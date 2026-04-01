import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, Plus, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import EmailConnectionCard from '@/components/email/EmailConnectionCard'
import EmailCandidateCard from '@/components/email/EmailCandidateCard'
import AddConnectionModal from '@/components/email/AddConnectionModal'
import { useEmailConnections } from '@/hooks/useEmailConnections'
import { useEmailCandidates } from '@/hooks/useEmailCandidates'
import { useWorkspace } from '@/hooks/useWorkspace'

// ─── Tab filter ───────────────────────────────────────────────────────────────

const CANDIDATE_TABS = [
  { key: 'pending', label: 'À traiter' },
  { key: 'all', label: 'Tous' },
] as const

type CandidateTab = typeof CANDIDATE_TABS[number]['key']

// ─── Component ────────────────────────────────────────────────────────────────

export default function MailPage() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id

  const { connections, loading: connectionsLoading, addConnection, deleteConnection, scanEmails } =
    useEmailConnections(workspaceId)

  const { candidates, loading: candidatesLoading, ingestCandidate, updateStatus } =
    useEmailCandidates(workspaceId)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<CandidateTab>('pending')

  const filteredCandidates =
    activeTab === 'pending'
      ? candidates.filter((c) => c.status === 'pending')
      : candidates

  const pendingCount = candidates.filter((c) => c.status === 'pending').length

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Surveillance email</span>
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary">{pendingCount} en attente</Badge>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* ── Connexions email ──────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Boîtes connectées
            </h2>
            <Button size="sm" onClick={() => setAddModalOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Connecter une boîte
            </Button>
          </div>

          {connectionsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed">
              <Mail className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Aucune boîte connectée</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connectez Gmail ou IMAP pour détecter automatiquement vos factures.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setAddModalOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Connecter une boîte
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <EmailConnectionCard
                  key={c.id}
                  connection={c}
                  onDelete={deleteConnection}
                  onScan={scanEmails}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Candidats ─────────────────────────────────────────────────────── */}
        {connections.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Documents détectés
              </h2>
              {/* Tab filter */}
              <div className="flex gap-1">
                {CANDIDATE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {tab.label}
                    {tab.key === 'pending' && pendingCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-xs bg-primary-foreground/20 text-primary-foreground">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {candidatesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {activeTab === 'pending' ? 'Aucun document en attente' : 'Aucun document détecté'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cliquez sur le bouton scan d'une boîte pour détecter les nouveaux emails.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCandidates.map((c) => (
                  <EmailCandidateCard
                    key={c.id}
                    candidate={c}
                    onIngest={async (id) => { await ingestCandidate(id) }}
                    onIgnore={(id) => updateStatus(id, 'ignored')}
                    onBlock={(id) => updateStatus(id, 'blocked')}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <AddConnectionModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={addConnection}
      />
    </div>
  )
}
