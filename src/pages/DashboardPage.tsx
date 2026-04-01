import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, LogOut, Settings, ChevronDown, Plus,
  Building2, Upload as UploadIcon, Mail
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import UploadZone from '@/components/upload/UploadZone'
import DocumentList from '@/components/documents/DocumentList'
import SettingsModal from '@/components/settings/SettingsModal'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useDocuments } from '@/hooks/useDocuments'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ counts }: { counts: Record<string, number> }) {
  const stats = [
    { label: 'En analyse', value: counts.pending ?? 0, color: 'bg-amber-400' },
    { label: 'À vérifier', value: counts.verified ?? 0, color: 'bg-blue-400' },
    { label: 'Validés', value: counts.validated ?? 0, color: 'bg-green-400' },
    { label: 'Exportés', value: counts.exported ?? 0, color: 'bg-gray-400' },
  ]

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  if (total === 0) return null

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {stats.map((s) => s.value > 0 && (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${s.color}`} />
          <span className="text-xs text-muted-foreground">{s.value} {s.label}</span>
        </div>
      ))}
      <span className="text-xs text-muted-foreground ml-1">— {total} document{total > 1 ? 's' : ''} au total</span>
    </div>
  )
}

// ─── Upload panel ─────────────────────────────────────────────────────────────

function UploadPanel({
  workspaceId,
  onUpload,
  uploading,
}: {
  workspaceId: string
  onUpload: (file: File) => Promise<void>
  uploading: ReturnType<typeof useDocuments>['uploading']
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UploadIcon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-sm">Ajouter des documents</span>
          {uploading.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {uploading.length} en cours
            </Badge>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <UploadZone
            workspaceId={workspaceId}
            uploading={uploading}
            onUpload={onUpload}
          />
        </div>
      )}
    </div>
  )
}

// ─── No workspace state ───────────────────────────────────────────────────────

function NoWorkspace({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Aucun workspace</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Créez votre premier workspace pour commencer à gérer vos documents comptables.
      </p>
      <Button onClick={onCreateWorkspace}>
        <Plus className="mr-2 h-4 w-4" />
        Créer un workspace
      </Button>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { workspace, workspaces, loading: wsLoading } = useWorkspace()
  const {
    documents,
    uploading,
    loading: docsLoading,
    uploadDocument,
    deleteDocument,
    updateDocument,
  } = useDocuments(workspace?.id)
  const { exportDocument } = useGoogleDrive(workspace?.id)

  // Compute status counts
  const statusCounts = documents.reduce(
    (acc, doc) => ({ ...acc, [doc.status]: (acc[doc.status] ?? 0) + 1 }),
    {} as Record<string, number>
  )

  const handleUpload = async (file: File) => {
    if (!workspace) return
    await uploadDocument(file, workspace.id)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo + workspace selector */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold hidden sm:block">InGest.ia</span>

            {workspace && (
              <>
                <Separator orientation="vertical" className="h-4 hidden sm:block" />
                <div className="flex items-center gap-1 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate max-w-32 sm:max-w-48">
                    {workspace.name}
                  </span>
                  {workspaces.length > 1 && (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-muted-foreground hidden md:block mr-2">{user?.email}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/mail')} title="Surveillance email">
              <Mail className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Loading workspace */}
        {wsLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {/* No workspace */}
        {!wsLoading && !workspace && (
          <NoWorkspace onCreateWorkspace={() => navigate('/workspace/create')} />
        )}

        {/* Workspace ready */}
        {!wsLoading && workspace && (
          <>
            {/* Page title + stats */}
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold">Tableau de bord</h1>
              <StatsBar counts={statusCounts} />
            </div>

            {/* Upload panel */}
            <UploadPanel
              workspaceId={workspace.id}
              onUpload={handleUpload}
              uploading={uploading}
            />

            {/* Document list */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Documents
              </h2>
              <DocumentList
                documents={documents}
                loading={docsLoading}
                onDelete={deleteDocument}
                onUpdate={updateDocument}
                workspaceId={workspace.id}
                onExportMonth={async (docIds) => {
                  for (const id of docIds) {
                    await exportDocument(id)
                  }
                }}
              />
            </div>
          </>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        workspaceId={workspace?.id}
        workspaceName={workspace?.name}
      />
    </div>
  )
}
