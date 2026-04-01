import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Document } from '@/types'

// ─── Upload tracking ──────────────────────────────────────────────────────────

export interface UploadingFile {
  id: string
  filename: string
  status: 'uploading' | 'analyzing' | 'done' | 'error'
  error?: string
}

// ─── File validation ──────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(heic|heif)$/i)) {
    return `Format non supporté : ${file.type || 'inconnu'}. Acceptés : PDF, JPG, PNG, HEIC.`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : 20 Mo.`
  }
  return null
}

// ─── Sanitize filename for storage ───────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseDocumentsReturn {
  documents: Document[]
  uploading: UploadingFile[]
  loading: boolean
  error: string | null
  uploadDocument: (file: File, workspaceId: string) => Promise<void>
  updateDocument: (id: string, changes: Partial<Document>) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useDocuments(workspaceId: string | null | undefined): UseDocumentsReturn {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState<UploadingFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch documents ─────────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async (silent = false) => {
    if (!workspaceId) {
      setDocuments([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setDocuments((data as Document[]) ?? [])
    }
    if (!silent) setLoading(false)
  }, [workspaceId])

  // Initial load
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ── Poll while documents are pending (Realtime UPDATE fallback) ────────────
  const hasPending = documents.some((d) => d.status === 'pending')
  useEffect(() => {
    if (!hasPending || !workspaceId) return
    const timer = setInterval(() => fetchDocuments(true), 3000)
    return () => clearInterval(timer)
  }, [hasPending, workspaceId, fetchDocuments])

  // ── Sync uploading queue with document status (for poll-based updates) ─────
  useEffect(() => {
    setUploading((prev) => {
      if (prev.length === 0) return prev
      return prev.map((u) => {
        if (u.status !== 'analyzing') return u
        const doc = documents.find((d) => d.id === u.id)
        if (!doc || doc.status === 'pending') return u
        // Document is done — schedule removal from queue
        const delay = doc.status === 'error' ? 5000 : 2000
        setTimeout(() => {
          setUploading((p) => p.filter((item) => item.id !== u.id))
        }, delay)
        return {
          ...u,
          status: doc.status === 'error' ? 'error' : 'done',
          error: doc.status === 'error' ? 'Analyse échouée' : undefined,
        }
      })
    })
  }, [documents])

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`documents:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newDoc = payload.new as Document
            // Skip if already added optimistically
            setDocuments((prev) =>
              prev.some((d) => d.id === newDoc.id) ? prev : [newDoc, ...prev]
            )
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Document
            setDocuments((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            )
            // Mark upload as done (or error) when analysis finishes
            if (updated.status !== 'pending') {
              const uploadStatus = updated.status === 'error' ? 'error' : 'done'
              setUploading((prev) =>
                prev.map((u) =>
                  u.id === updated.id
                    ? { ...u, status: uploadStatus, error: updated.status === 'error' ? 'Analyse échouée' : undefined }
                    : u
                )
              )
              // Remove from uploading after a short delay (longer for errors so user sees it)
              setTimeout(() => {
                setUploading((prev) => prev.filter((u) => u.id !== updated.id))
              }, updated.status === 'error' ? 5000 : 2000)
            }
          } else if (payload.eventType === 'DELETE') {
            setDocuments((prev) => prev.filter((d) => d.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  // ── Upload a document ───────────────────────────────────────────────────────
  const uploadDocument = useCallback(
    async (file: File, wsId: string) => {
      if (!user) throw new Error('Non authentifié')

      const uploadId = crypto.randomUUID()
      const safeFilename = sanitizeFilename(file.name)
      const storagePath = `${wsId}/${uploadId}/${safeFilename}`

      // Track upload state
      setUploading((prev) => [
        ...prev,
        { id: uploadId, filename: file.name, status: 'uploading' },
      ])

      try {
        // 1. Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (storageError) throw storageError

        // 2. Insert document record (generate ID client-side to avoid PostgREST RLS false-positive)
        const documentId = crypto.randomUUID()
        const { error: insertError } = await supabase
          .from('documents')
          .insert({
            id: documentId,
            workspace_id: wsId,
            uploaded_by: user.id,
            original_file_url: storagePath,
            original_filename: file.name,
            status: 'pending',
          })

        if (insertError) throw insertError

        // Optimistically add document to list (don't wait for Realtime)
        setDocuments((prev) => [{
          id: documentId,
          workspace_id: wsId,
          uploaded_by: user.id,
          original_file_url: storagePath,
          original_filename: file.name,
          status: 'pending',
          created_at: new Date().toISOString(),
        } as Document, ...prev])

        // Update local tracking with real document ID
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, id: documentId, status: 'analyzing' }
              : u
          )
        )

        // 3. Fire and forget: call Edge Function for analysis
        supabase.functions
          .invoke('analyze-document', {
            body: { document_id: documentId },
          })
          .catch((err) => {
            console.error('Analysis failed:', err)
            setUploading((prev) =>
              prev.map((u) =>
                u.id === documentId
                  ? { ...u, status: 'error', error: 'Analyse échouée' }
                  : u
              )
            )
          })
      } catch (err) {
        const error = err as Error
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: 'error', error: error.message }
              : u
          )
        )
        throw err
      }
    },
    [user]
  )

  // ── Update a document ───────────────────────────────────────────────────────
  const updateDocument = useCallback(async (id: string, changes: Partial<Document>) => {
    const { error: updateError } = await supabase
      .from('documents')
      .update(changes)
      .eq('id', id)

    if (updateError) throw updateError

    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)))
  }, [])

  // ── Delete a document ───────────────────────────────────────────────────────
  const deleteDocument = useCallback(async (id: string) => {
    const doc = documents.find((d) => d.id === id)
    if (!doc) return

    // Delete from Storage
    await supabase.storage.from('documents').remove([doc.original_file_url])

    // Delete from DB (cascade will remove export_logs)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }, [documents])

  return {
    documents,
    uploading,
    loading,
    error,
    uploadDocument,
    updateDocument,
    deleteDocument,
    refetch: fetchDocuments,
  }
}
