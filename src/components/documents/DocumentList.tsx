import { useState } from 'react'
import { FileText, Loader2, CloudUpload, Download } from 'lucide-react'
import JSZip from 'jszip'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
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

// ─── Month grouping ────────────────────────────────────────────────────────────

interface MonthGroup {
  key: string
  label: string
  docs: Document[]
}

function groupByMonth(docs: Document[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  const indexMap: Record<string, number> = {}

  for (const doc of docs) {
    const raw = doc.date ?? doc.created_at
    const date = new Date(raw)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    if (indexMap[key] === undefined) {
      indexMap[key] = groups.length
      groups.push({ key, label, docs: [] })
    }
    groups[indexMap[key]].docs.push(doc)
  }

  return groups
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentListProps {
  documents: Document[]
  loading: boolean
  onDelete: (id: string) => void
  onUpdate: (id: string, changes: Partial<Document>) => Promise<void>
  workspaceId?: string
  onExportMonth?: (docIds: string[]) => Promise<void>
}

export default function DocumentList({
  documents,
  loading,
  onDelete,
  onUpdate,
  workspaceId,
  onExportMonth,
}: DocumentListProps) {
  const [activeTab, setActiveTab] = useState<DocumentStatus | 'all'>('all')
  const [exportingMonth, setExportingMonth] = useState<string | null>(null)
  const [zippingMonth, setZippingMonth] = useState<string | null>(null)

  const filtered = activeTab === 'all'
    ? documents
    : documents.filter((d) => d.status === activeTab)

  const countFor = (key: DocumentStatus | 'all') =>
    key === 'all' ? documents.length : documents.filter((d) => d.status === key).length

  const handleExportMonth = async (monthKey: string, docIds: string[]) => {
    if (!onExportMonth) return
    setExportingMonth(monthKey)
    try {
      await onExportMonth(docIds)
    } finally {
      setExportingMonth(null)
    }
  }

  const handleDownloadZip = async (monthKey: string, docs: Document[]) => {
    setZippingMonth(monthKey)
    try {
      const zip = new JSZip()
      await Promise.all(
        docs.map(async (doc) => {
          const { data } = await supabase.storage
            .from('documents')
            .createSignedUrl(doc.original_file_url, 60)
          if (!data?.signedUrl) return
          const response = await fetch(data.signedUrl)
          const blob = await response.blob()
          const filename = doc.final_filename ?? doc.original_filename
          zip.file(filename, blob)
        })
      )
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `InGestia_${monthKey}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setZippingMonth(null)
    }
  }

  const groups = groupByMonth(filtered)

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
        <div className="space-y-6">
          {groups.map((group) => {
            const validatedIds = group.docs
              .filter((d) => d.status === 'validated')
              .map((d) => d.id)
            const isExporting = exportingMonth === group.key

            return (
              <div key={group.key} className="space-y-2">
                {/* Month header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide capitalize">
                    {group.label}
                  </h3>
                  {validatedIds.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={zippingMonth === group.key}
                        onClick={() => handleDownloadZip(group.key, group.docs.filter(d => d.status === 'validated'))}
                      >
                        {zippingMonth === group.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        {zippingMonth === group.key ? 'Compression…' : 'Télécharger ZIP'}
                      </Button>
                      {onExportMonth && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={isExporting}
                          onClick={() => handleExportMonth(group.key, validatedIds)}
                        >
                          {isExporting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CloudUpload className="h-3.5 w-3.5" />
                          )}
                          {isExporting ? 'Export en cours…' : `Drive (${validatedIds.length})`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Documents */}
                <div className="space-y-2">
                  {group.docs.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      workspaceId={workspaceId}
                    />
                  ))}
                </div>
              </div>
            )
          })}
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
