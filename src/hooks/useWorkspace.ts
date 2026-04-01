import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Workspace } from '@/types'

const ACTIVE_WORKSPACE_KEY = 'ingestia_active_workspace_id'

interface UseWorkspaceReturn {
  workspace: Workspace | null
  workspaces: Workspace[]
  loading: boolean
  error: string | null
  switchWorkspace: (id: string) => void
}

export function useWorkspace(): UseWorkspaceReturn {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setWorkspaces([])
      setWorkspace(null)
      setLoading(false)
      return
    }

    const fetchWorkspaces = async () => {
      setLoading(true)
      setError(null)

      // Fetch workspaces where user is a member (via RLS)
      const { data, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      const list = (data as Workspace[]) ?? []
      setWorkspaces(list)

      if (list.length === 0) {
        setWorkspace(null)
        setLoading(false)
        return
      }

      // Restore active workspace from localStorage
      const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY)
      const active = list.find((w) => w.id === savedId) ?? list[0]
      setWorkspace(active)
      setLoading(false)
    }

    fetchWorkspaces()
  }, [user])

  const switchWorkspace = (id: string) => {
    const found = workspaces.find((w) => w.id === id)
    if (found) {
      setWorkspace(found)
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
    }
  }

  return { workspace, workspaces, loading, error, switchWorkspace }
}
