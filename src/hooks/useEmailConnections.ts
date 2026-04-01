import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EmailConnection } from '@/types'

export interface NewEmailConnection {
  provider: 'gmail' | 'imap'
  credentials: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }
}

interface UseEmailConnectionsReturn {
  connections: EmailConnection[]
  loading: boolean
  error: string | null
  addConnection: (data: NewEmailConnection) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  scanEmails: (connectionId: string) => Promise<{ created: number }>
}

export function useEmailConnections(workspaceId: string | null | undefined): UseEmailConnectionsReturn {
  const [connections, setConnections] = useState<EmailConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConnections = useCallback(async () => {
    if (!workspaceId) {
      setConnections([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('email_connections')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setConnections((data as EmailConnection[]) ?? [])
    }
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  const addConnection = useCallback(async (data: NewEmailConnection) => {
    if (!workspaceId) throw new Error('No workspace')
    const { data: inserted, error: insertError } = await supabase
      .from('email_connections')
      .insert({
        workspace_id: workspaceId,
        provider: data.provider,
        credentials: data.credentials,
        filters: {},
        scan_frequency: 'manual',
      })
      .select()
      .single()

    if (insertError) throw insertError
    setConnections((prev) => [inserted as EmailConnection, ...prev])
  }, [workspaceId])

  const deleteConnection = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase
      .from('email_connections')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError
    setConnections((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const scanEmails = useCallback(async (connectionId: string): Promise<{ created: number }> => {
    const { data, error: fnError } = await supabase.functions.invoke('scan-emails', {
      body: { connection_id: connectionId },
    })
    if (fnError) throw fnError
    return data as { created: number }
  }, [])

  return { connections, loading, error, addConnection, deleteConnection, scanEmails }
}
