import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface UseGoogleDriveReturn {
  isConnected: boolean
  loading: boolean
  exporting: Set<string>
  connect: (workspaceId: string) => void
  disconnect: (workspaceId: string) => Promise<void>
  exportDocument: (documentId: string) => Promise<{ drive_file_id: string; drive_folder_path: string }>
}

export function useGoogleDrive(workspaceId: string | undefined): UseGoogleDriveReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<Set<string>>(new Set())

  // ── Vérifier si Google Drive est connecté ──────────────────────────────────
  useEffect(() => {
    if (!workspaceId) {
      setIsConnected(false)
      setLoading(false)
      return
    }

    const checkConnection = async () => {
      setLoading(true)
      const { count } = await supabase
        .from('google_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
      setIsConnected((count ?? 0) > 0)
      setLoading(false)
    }

    checkConnection()
  }, [workspaceId])

  // ── Générer l'URL OAuth Google et rediriger ────────────────────────────────
  const connect = useCallback((wsId: string) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: wsId,
    })

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }, [])

  // ── Déconnecter Google Drive ───────────────────────────────────────────────
  const disconnect = useCallback(async (wsId: string) => {
    await supabase
      .from('google_tokens')
      .delete()
      .eq('workspace_id', wsId)
    setIsConnected(false)
  }, [])

  // ── Exporter un document vers Google Drive ─────────────────────────────────
  const exportDocument = useCallback(async (documentId: string) => {
    setExporting((prev) => new Set(prev).add(documentId))
    try {
      const { data, error } = await supabase.functions.invoke('export-document', {
        body: { document_id: documentId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { drive_file_id: string; drive_folder_path: string }
    } finally {
      setExporting((prev) => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
    }
  }, [])

  return { isConnected, loading, exporting, connect, disconnect, exportDocument }
}
