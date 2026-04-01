import { useState } from 'react'
import { Loader2, Paperclip, Link2, Download, EyeOff, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EmailCandidate } from '@/types'

interface EmailCandidateCardProps {
  candidate: EmailCandidate
  onIngest: (id: string) => Promise<void>
  onIgnore: (id: string) => Promise<void>
  onBlock: (id: string) => Promise<void>
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export default function EmailCandidateCard({ candidate, onIngest, onIgnore, onBlock }: EmailCandidateCardProps) {
  const [ingesting, setIngesting] = useState(false)
  const [updating, setUpdating] = useState(false)

  const isDone = candidate.status !== 'pending'

  const handleIngest = async () => {
    setIngesting(true)
    try { await onIngest(candidate.id) } finally { setIngesting(false) }
  }

  const handleIgnore = async () => {
    setUpdating(true)
    try { await onIgnore(candidate.id) } finally { setUpdating(false) }
  }

  const handleBlock = async () => {
    setUpdating(true)
    try { await onBlock(candidate.id) } finally { setUpdating(false) }
  }

  const statusBadge = {
    pending: null,
    ingested: <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">Ingéré</Badge>,
    ignored: <Badge className="bg-gray-100 text-gray-600 border-gray-200 border text-xs">Ignoré</Badge>,
    blocked: <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs">Bloqué</Badge>,
  }[candidate.status]

  return (
    <div className={`rounded-xl border bg-card p-4 flex items-start gap-3 ${isDone ? 'opacity-60' : ''}`}>
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        {candidate.detected_type === 'attachment'
          ? <Paperclip className="h-4 w-4 text-muted-foreground" />
          : <Link2 className="h-4 w-4 text-muted-foreground" />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-medium text-sm truncate">{candidate.subject || '(sans objet)'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-muted-foreground truncate">{candidate.sender}</span>
          <span className="text-xs text-muted-foreground">{formatDate(candidate.date)}</span>
          {statusBadge}
        </div>
      </div>

      {/* Actions */}
      {!isDone && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={handleIngest}
            disabled={ingesting || updating}
          >
            {ingesting
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Download className="h-3 w-3" />
            }
            Ingérer
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={handleIgnore}
            disabled={ingesting || updating}
            title="Ignorer"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleBlock}
            disabled={ingesting || updating}
            title="Bloquer l'expéditeur"
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
