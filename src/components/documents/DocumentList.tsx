import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import DocumentCard from '@/components/documents/DocumentCard'
import type { Document, DocumentStatus } from '@/types'

// ─── Tab config ───────────────────────────────────────────────────────────────

interface Tab {
  key: DocumentStatus | 'all'
  label: string
}

const TABS: Tab[] = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En analyse' },
  { key: 'verified', label: 'À vérifier' },
  { key: 'validated', label: 'Validés' },
  { key: 'exported', label: 'Exportés' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentListProps {
  documents: Document[]
  loading: boolean
  onDelete: (id: string) => void
  onUpdate: (id: string, changes: Partial<Document>) => Promise<void>
  workspaceId?: string
}

export default function DocumentList({ documents, loading, onDelete, onUpdate, workspaceId }: DocumentListProps) {
  const [activeTab, setActiveTab] = useState<DocumentStatus | 'all'>('all')

  const filtered = activeTab === 'all'
    ? documents
    : documents.filter((d) => d.status === activeTab)

  const countFor = (key: DocumentStatus | 'all') =>
    key === 'all' ? documents.length : documents.filter((d) => d.status === key).length

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
        {TABS.map((tab) => {
          const count = countFor(tab.key)
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-xs',
                  isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={activeTab} hasDocuments={documents.length > 0} />
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <DocumentCard key={doc.id} document={doc} onDelete={onDelete} onUpdate={onUpdate} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab, hasDocuments }: { tab: DocumentStatus | 'all'; hasDocuments: boolean }) {
  const messages: Record<typeof tab, { title: string; description: string }> = {
    all: {
      title: 'Aucun document',
      description: 'Uploadez votre premier document pour commencer.',
    },
    pending: {
      title: 'Aucun document en cours d\'analyse',
      description: 'Les documents en cours d\'analyse apparaîtront ici.',
    },
    verified: {
      title: 'Aucun document à vérifier',
      description: hasDocuments ? 'Tous vos documents sont vérifiés.' : 'Uploadez un document pour commencer.',
    },
    validated: {
      title: 'Aucun document validé',
      description: 'Validez vos documents après vérification.',
    },
    exported: {
      title: 'Aucun document exporté',
      description: 'Vos documents exportés vers Google Drive apparaîtront ici.',
    },
    error: {
      title: 'Aucun document en erreur',
      description: 'Les documents ayant échoué à l\'analyse apparaîtront ici.',
    },
  }

  const { title, description } = messages[tab]

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}
