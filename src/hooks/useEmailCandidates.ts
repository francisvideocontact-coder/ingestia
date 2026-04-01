import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EmailCandidate, EmailCandidateStatus } from '@/types'

interface UseEmailCandidatesReturn {
  candidates: EmailCandidate[]
  loading: boolean
  error: string | null
  ingestCandidate: (id: string) => Promise<{ document_id: string }>
  updateStatus: (id: string, status: EmailCandidateStatus) => Promise<void>
  refetch: () => Promise<void>
}

export function useEmailCandidates(workspaceId: string | null | undefined): UseEmailCandidatesReturn {
  const [candidates, setCandidates] = useState<EmailCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCandidates = useCallback(async (silent = false) => {
    if (!workspaceId) {
      setCandidates([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)

    // Join via email_connections to filter by workspace
    const { data, error: fetchError } = await supabase
      .from('email_candidates')
      .select('*, email_connections!inner(workspace_id)')
      .eq('email_connections.workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      // Strip the join columns from the result
      setCandidates((data ?? []).map(({ email_connections: _ec, ...c }) => c as EmailCandidate))
    }
    if (!silent) setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`email_candidates:${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_candidates' },
        () => { fetchCandidates(true) }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'email_candidates' },
        (payload) => {
          setCandidates((prev) =>
            prev.map((c) => (c.id === payload.new.id ? (payload.new as EmailCandidate) : c))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, fetchCandidates])

  const ingestCandidate = useCallback(async (id: string): Promise<{ document_id: string }> => {
    const { data, error: fnError } = await supabase.functions.invoke('ingest-email-candidate', {
      body: { candidate_id: id },
    })
    if (fnError) throw fnError
    // Optimistically update status
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'ingested' as EmailCandidateStatus } : c))
    )
    return data as { document_id: string }
  }, [])

  const updateStatus = useCallback(async (id: string, status: EmailCandidateStatus) => {
    const { error: updateError } = await supabase
      .from('email_candidates')
      .update({ status })
      .eq('id', id)

    if (updateError) throw updateError
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    )
  }, [])

  return { candidates, loading, error, ingestCandidate, updateStatus, refetch: fetchCandidates }
}
