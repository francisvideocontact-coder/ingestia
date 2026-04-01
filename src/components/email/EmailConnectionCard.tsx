import { useState } from 'react'
import { Mail, Loader2, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EmailConnection } from '@/types'

interface EmailConnectionCardProps {
  connection: EmailConnection
  onDelete: (id: string) => Promise<void>
  onScan: (id: string) => Promise<{ created: number }>
}

const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  imap: 'IMAP',
}

export default function EmailConnectionCard({ connection, onDelete, onScan }: EmailConnectionCardProps) {
  const [scanning, setScanning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const creds = connection.credentials as { host?: string; user?: string }

  const handleScan = async () => {
    setScanning(true)
    setLastResult(null)
    try {
      const result = await onScan(connection.id)
      setLastResult(
        result.created === 0
          ? 'Aucun nouveau document trouvé'
          : `${result.created} nouveau${result.created > 1 ? 'x' : ''} candidat${result.created > 1 ? 's' : ''} détecté${result.created > 1 ? 's' : ''}`
      )
    } catch (err) {
      setLastResult('Erreur lors du scan : ' + (err as Error).message)
    } finally {
      setScanning(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cette connexion mail ? Les candidats non ingérés seront également supprimés.')) return
    setDeleting(true)
    try {
      await onDelete(connection.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        <Mail className="h-5 w-5 text-blue-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">{creds.user ?? '—'}</p>
          <Badge variant="secondary" className="text-xs">
            {PROVIDER_LABELS[connection.provider] ?? connection.provider}
          </Badge>
          {creds.host && (
            <span className="text-xs text-muted-foreground">{creds.host}</span>
          )}
        </div>
        {lastResult && (
          <p className="text-xs text-muted-foreground mt-1">{lastResult}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={handleScan}
          disabled={scanning}
          title="Scanner les emails maintenant"
        >
          {scanning
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />
          }
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Trash2 className="h-4 w-4" />
          }
        </Button>
      </div>
    </div>
  )
}
