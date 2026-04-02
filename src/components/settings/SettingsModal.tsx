import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, CheckCircle, Loader2, Unplug, FolderOpen, X,
  ChevronRight, Home, Folder, Check, AlertCircle, ArrowLeft, FileText, BookOpen, ScanLine,
  Users, Plus, Trash2, Crown, Shield, Eye,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateFilename } from '@/lib/nomenclature'
import type { WorkspaceSettings } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveFolder { id: string; name: string }
interface BreadcrumbItem { id: string | null; name: string }
type View = 'settings' | 'folder_picker' | 'scan_folder_picker'

interface WorkspaceMember {
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  member: 'Membre',
  viewer: 'Lecteur',
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  member: <Users className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string | undefined
  workspaceName?: string
  onWorkspaceRenamed?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsModal({ open, onClose, workspaceId, workspaceName, onWorkspaceRenamed }: SettingsModalProps) {
  const { user } = useAuth()
  const { isConnected, loading, connect, disconnect } = useGoogleDrive(workspaceId)

  // Workspace name state
  const [wsName, setWsName] = useState('')
  const [savingWsName, setSavingWsName] = useState(false)

  // Settings state
  const [disconnecting, setDisconnecting] = useState(false)
  const [driveFolderPath, setDriveFolderPath] = useState<string | null>(null)
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null)
  const [savingFolder, setSavingFolder] = useState(false)

  // Knowledge base state
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ imported: number; suppliers_found: number } | null>(null)
  const [scanFolderId, setScanFolderId] = useState<string | null>(null)
  const [scanFolderName, setScanFolderName] = useState<string | null>(null)
  const [supplierCount, setSupplierCount] = useState<number | null>(null)

  // Nomenclature state
  const [separator, setSeparator] = useState('_')
  const [nomenclatureCase, setNomenclatureCase] = useState<'UPPER' | 'LOWER'>('UPPER')
  const [ndfPrefix, setNdfPrefix] = useState(false)
  const [savingNomenclature, setSavingNomenclature] = useState(false)

  // Members state
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ success?: boolean; error?: string } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Folder picker state
  const [view, setView] = useState<View>('settings')
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersError, setFoldersError] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Mon Drive' }])

  const currentFolder = breadcrumb[breadcrumb.length - 1]

  // ── Charger les settings ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !workspaceId) return
    supabase
      .from('workspaces')
      .select('name, settings')
      .eq('id', workspaceId)
      .single()
      .then(({ data }) => {
        const s = data?.settings as WorkspaceSettings | null
        setDriveFolderId(s?.drive_folder_id ?? null)
        setDriveFolderPath(s?.drive_folder_path ?? null)
        const nom = s?.nomenclature
        setSeparator(nom?.separator ?? '_')
        setNomenclatureCase(nom?.case ?? 'UPPER')
        setNdfPrefix(nom?.ndf_prefix ?? false)
        if (data?.name) setWsName(data.name)
      })
    supabase
      .from('supplier_categories')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .then(({ count }) => setSupplierCount(count ?? 0))
  }, [open, workspaceId])

  const refreshSupplierCount = () => {
    if (!workspaceId) return
    supabase
      .from('supplier_categories')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .then(({ count }) => setSupplierCount(count ?? 0))
  }

  // Réinitialiser la vue quand la modale se ferme
  useEffect(() => {
    if (!open) setView('settings')
  }, [open])

  // ── Nom du workspace ─────────────────────────────────────────────────────────
  const handleSaveWsName = async () => {
    if (!workspaceId || !wsName.trim()) return
    setSavingWsName(true)
    await supabase.from('workspaces').update({ name: wsName.trim() }).eq('id', workspaceId)
    setSavingWsName(false)
    onWorkspaceRenamed?.()
  }

  // ── Membres ──────────────────────────────────────────────────────────────────
  const loadMembers = useCallback(async () => {
    if (!workspaceId) return
    setMembersLoading(true)
    const { data } = await supabase.rpc('get_workspace_members', { p_workspace_id: workspaceId })
    setMembers((data as WorkspaceMember[]) ?? [])
    setMembersLoading(false)
  }, [workspaceId])

  useEffect(() => {
    if (open && workspaceId) loadMembers()
  }, [open, workspaceId, loadMembers])

  const handleInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return
    const email = inviteEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteResult({ error: 'Adresse email invalide.' })
      return
    }
    setInviting(true)
    setInviteResult(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('invite-member', {
        body: { workspace_id: workspaceId, email, role: inviteRole },
      })
      if (fnError || data?.error) {
        setInviteResult({ error: data?.error ?? fnError?.message ?? 'Erreur inconnue' })
      } else {
        setInviteResult({ success: true })
        setInviteEmail('')
      }
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!workspaceId) return
    setRemovingId(member.id)
    await supabase.from('workspace_members').delete().eq('id', member.id)
    await loadMembers()
    setRemovingId(null)
  }

  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 'member'
  const canManageMembers = ['owner', 'admin'].includes(myRole)

  // ── Folder picker ────────────────────────────────────────────────────────────
  const loadFolders = useCallback(async (parentId: string | null) => {
    if (!workspaceId) return
    setFoldersLoading(true)
    setFoldersError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('list-drive-folders', {
        body: { workspace_id: workspaceId, parent_id: parentId },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error === 'insufficient_scope') {
        setFoldersError('scope_error')
        return
      }
      if (data?.error === 'access_denied') {
        setFoldersError('scope_error') // Même UI : reconnexion nécessaire
        return
      }
      if (data?.error) throw new Error(data.detail ?? data.error)
      setFolders(data.folders ?? [])
    } catch (err) {
      setFoldersError((err as Error).message)
    } finally {
      setFoldersLoading(false)
    }
  }, [workspaceId])

  const openPicker = () => {
    setBreadcrumb([{ id: null, name: 'Mon Drive' }])
    setFolders([])
    setView('folder_picker')
    loadFolders(null)
  }

  const navigateInto = (folder: DriveFolder) => {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
    loadFolders(folder.id)
  }

  const navigateTo = (index: number) => {
    const target = breadcrumb[index]
    setBreadcrumb((prev) => prev.slice(0, index + 1))
    loadFolders(target.id)
  }

  const saveFolder = async (folderId: string, folderPath: string) => {
    if (!workspaceId) return
    setSavingFolder(true)
    try {
      const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
      await supabase
        .from('workspaces')
        .update({
          settings: {
            ...(ws?.settings as object ?? {}),
            drive_folder_id: folderId,
            drive_folder_path: folderPath,
          },
        })
        .eq('id', workspaceId)
      setDriveFolderId(folderId)
      setDriveFolderPath(folderPath)
      setView('settings')
    } finally {
      setSavingFolder(false)
    }
  }

  const handleSelectFolder = async () => {
    if (!currentFolder.id) return
    const path = breadcrumb.slice(1).map((b) => b.name).join('/')
    await saveFolder(currentFolder.id, path)
  }

  const handleSelectFolderDirect = async (folder: DriveFolder) => {
    const path = [...breadcrumb.slice(1).map((b) => b.name), folder.name].join('/')
    await saveFolder(folder.id, path)
  }

  // ── Settings actions ─────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!workspaceId) return
    setDisconnecting(true)
    try {
      await disconnect(workspaceId)
      setDriveFolderPath(null)
      setDriveFolderId(null)
    } finally {
      setDisconnecting(false)
    }
  }

  const handleClearFolder = async () => {
    if (!workspaceId) return
    setSavingFolder(true)
    try {
      const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
      const settings = { ...(ws?.settings as object ?? {}) } as Record<string, unknown>
      delete settings.drive_folder_id
      delete settings.drive_folder_path
      await supabase.from('workspaces').update({ settings }).eq('id', workspaceId)
      setDriveFolderId(null)
      setDriveFolderPath(null)
    } finally {
      setSavingFolder(false)
    }
  }

  // ── Nomenclature ─────────────────────────────────────────────────────────────
  const saveNomenclature = async (nom: WorkspaceSettings['nomenclature']) => {
    if (!workspaceId) return
    setSavingNomenclature(true)
    try {
      const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
      await supabase
        .from('workspaces')
        .update({ settings: { ...(ws?.settings as object ?? {}), nomenclature: nom } })
        .eq('id', workspaceId)
    } finally {
      setSavingNomenclature(false)
    }
  }

  const handleSeparatorChange = (val: string) => {
    setSeparator(val)
    saveNomenclature({ separator: val, case: nomenclatureCase, ndf_prefix: ndfPrefix })
  }

  const handleCaseChange = (val: 'UPPER' | 'LOWER') => {
    setNomenclatureCase(val)
    saveNomenclature({ separator, case: val, ndf_prefix: ndfPrefix })
  }

  const handleNdfPrefixChange = (val: boolean) => {
    setNdfPrefix(val)
    saveNomenclature({ separator, case: nomenclatureCase, ndf_prefix: val })
  }

  const nomenclatureSettings: WorkspaceSettings['nomenclature'] = {
    separator, case: nomenclatureCase, ndf_prefix: ndfPrefix,
  }

  // ── Drive scan ───────────────────────────────────────────────────────────────
  const handleScanDrive = async () => {
    if (!workspaceId) return
    setScanning(true)
    setScanResult(null)
    try {
      const body: Record<string, string> = { workspace_id: workspaceId }
      if (scanFolderId) body.folder_id = scanFolderId
      const { data, error: fnError } = await supabase.functions.invoke('scan-drive-suppliers', { body })
      if (fnError) {
        console.error('[scan] function error:', fnError)
      } else if (data?.error) {
        console.error('[scan] response error:', data.error, data.detail)
      } else if (data?.imported != null) {
        setScanResult({ imported: data.imported, suppliers_found: data.suppliers_found })
        refreshSupplierCount()
      }
    } finally {
      setScanning(false)
    }
  }

  const handleSelectScanFolder = async (folder: DriveFolder) => {
    const path = [...breadcrumb.slice(1).map((b) => b.name), folder.name].join('/')
    setScanFolderId(folder.id)
    setScanFolderName(path || folder.name)
    setView('settings')
  }

  const defaultFolderLabel = workspaceName
    ? `Qonto Connect Import - ${workspaceName}/Dropzone`
    : 'Qonto Connect Import - [workspace]/Dropzone'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* ── Vue : Paramètres ─────────────────────────────────────────────────── */}
      {view === 'settings' && (
        <DialogContent className="max-w-md overflow-hidden" style={{ width: 'min(448px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Paramètres</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2 overflow-y-auto max-h-[calc(100svh-10rem)]">

            {/* ── Nom du workspace ──────────────────────────────────────────── */}
            <section className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Nom du workspace</label>
              <div className="flex gap-2">
                <input
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveWsName()}
                  placeholder="Ex: Studio Caillou"
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveWsName}
                  disabled={savingWsName || !wsName.trim() || wsName.trim() === workspaceName}
                >
                  {savingWsName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </section>

            {/* ── Membres ───────────────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Membres</h3>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                {/* Liste des membres */}
                {membersLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Chargement…
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0 text-xs font-semibold">
                          {m.email[0].toUpperCase()}
                        </div>
                        <span className="text-xs flex-1 truncate">{m.email}</span>
                        <span className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0',
                          m.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                          m.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {ROLE_ICONS[m.role]}
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                        {canManageMembers && m.role !== 'owner' && m.user_id !== user?.id && (
                          <button
                            onClick={() => handleRemoveMember(m)}
                            disabled={removingId === m.id}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1"
                            title="Retirer du workspace"
                          >
                            {removingId === m.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulaire d'invitation */}
                {canManageMembers && (
                  <div className="space-y-2 pt-1 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Inviter par email</p>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteResult(null) }}
                        onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                        placeholder="email@exemple.com"
                        className="flex-1 h-8 rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Membre</option>
                        <option value="viewer">Lecteur</option>
                      </select>
                      <Button size="sm" className="h-8 px-2.5" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                        {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {inviteResult?.error && (
                      <p className="text-xs text-destructive">{inviteResult.error}</p>
                    )}
                    {inviteResult?.success && (
                      <div className="flex items-center gap-1.5 text-xs text-green-700">
                        <Check className="h-3.5 w-3.5" />
                        Invitation envoyée ! La personne recevra un email.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Google Drive</h3>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification…
                </div>
              ) : isConnected ? (
                <div className="space-y-3">
                  {/* Statut */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <p className="text-sm font-medium flex-1">Connecté</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting
                        ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        : <Unplug className="mr-2 h-3.5 w-3.5" />
                      }
                      Déconnecter Google Drive
                    </Button>
                  </div>

                  {/* Dossier de destination */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Dossier de destination</p>

                    {driveFolderId ? (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 min-w-0">
                        <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate min-w-0">{driveFolderPath}</span>
                        {savingFolder
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                          : (
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              onClick={handleClearFolder}
                              title="Réinitialiser vers le dossier par défaut"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-muted-foreground min-w-0">
                        <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="text-xs font-mono flex-1 truncate min-w-0 opacity-60">{defaultFolderLabel}</span>
                        <span className="text-xs bg-muted rounded px-1.5 py-0.5 shrink-0">défaut</span>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={openPicker}
                      disabled={savingFolder}
                    >
                      <FolderOpen className="mr-2 h-3.5 w-3.5" />
                      {driveFolderId ? 'Changer de dossier' : 'Choisir un dossier'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Non connecté</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Connectez votre Google Drive pour exporter automatiquement vos documents.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => workspaceId && connect(workspaceId)} disabled={!workspaceId}>
                    <HardDrive className="mr-2 h-3.5 w-3.5" />
                    Connecter Google Drive
                  </Button>
                </div>
              )}
            </section>

            {/* ── Base de connaissances ────────────────────────────────────── */}
            {isConnected && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Base de connaissances</h3>
                  {supplierCount !== null && (
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {supplierCount} fournisseur{supplierCount !== 1 ? 's' : ''} connu{supplierCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Si tu as déjà des fichiers bien nommés sur Google Drive, l'app peut les scanner pour apprendre automatiquement à reconnaître tes fournisseurs habituels. Plus elle en connaît, mieux elle catégorise les prochaines factures sans intervention.
                  </p>

                  {/* Dossier de scan */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Dossier à scanner</p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 min-w-0">
                      <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-xs flex-1 truncate min-w-0 text-muted-foreground">
                        {scanFolderName ?? 'Tout le Drive'}
                      </span>
                      {scanFolderId && (
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          onClick={() => { setScanFolderId(null); setScanFolderName(null) }}
                          title="Réinitialiser"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        setBreadcrumb([{ id: null, name: 'Mon Drive' }])
                        setFolders([])
                        setView('scan_folder_picker')
                        loadFolders(null)
                      }}
                    >
                      <FolderOpen className="mr-2 h-3.5 w-3.5" />
                      {scanFolderId ? 'Changer de dossier' : 'Choisir un dossier'}
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={handleScanDrive}
                    disabled={scanning}
                  >
                    {scanning
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <ScanLine className="h-3.5 w-3.5" />
                    }
                    {scanning ? 'Scan en cours…' : 'Scanner'}
                  </Button>

                  {scanResult && (
                    <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <p className="text-xs text-green-700">
                        <span className="font-semibold">{scanResult.imported} fournisseurs</span> importés
                        {scanResult.suppliers_found > scanResult.imported && (
                          <span className="text-green-600"> ({scanResult.suppliers_found} trouvés au total)</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Nomenclature ─────────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Nomenclature</h3>
                {savingNomenclature && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                {/* Separator */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Séparateur</span>
                  <div className="flex gap-1">
                    {['_', '-', '.'].map((sep) => (
                      <button
                        key={sep}
                        onClick={() => handleSeparatorChange(sep)}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-mono font-semibold transition-colors',
                          separator === sep
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/60'
                        )}
                      >
                        {sep}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Case */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Casse</span>
                  <div className="flex gap-1">
                    {(['UPPER', 'LOWER'] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => handleCaseChange(c)}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-medium transition-colors',
                          nomenclatureCase === c
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/60'
                        )}
                      >
                        {c === 'UPPER' ? 'MAJ' : 'min'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* NDF prefix */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Préfixe NDF</span>
                  <button
                    onClick={() => handleNdfPrefixChange(!ndfPrefix)}
                    className={cn(
                      'px-3 py-1 rounded text-xs font-medium transition-colors',
                      ndfPrefix
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    NDF
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Aperçu</p>
                <p className="text-xs font-mono bg-muted px-2 py-1.5 rounded truncate">
                  {generateFilename(
                    { date: '2025-02-22', supplier: 'Amazon', document_type: 'facture', category: 'Matériel' },
                    nomenclatureSettings
                  )}
                </p>
                <p className="text-xs font-mono bg-muted px-2 py-1.5 rounded truncate">
                  {generateFilename(
                    { date: '2025-02-22', supplier: 'Uber', document_type: 'ndf', category: 'Transport' },
                    nomenclatureSettings
                  )}
                </p>
              </div>
            </section>

            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1.5 text-xs">Info</Badge>
                L'application accède uniquement aux fichiers qu'elle crée et à la liste de vos dossiers pour la navigation.
              </p>
            </div>
          </div>
        </DialogContent>
      )}

      {/* ── Vue : Scan folder picker ─────────────────────────────────────────── */}
      {view === 'scan_folder_picker' && (
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center gap-3">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setView('settings')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <DialogTitle className="text-base">Dossier à scanner</DialogTitle>
            </div>
          </DialogHeader>

          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 bg-muted/40 border-b min-h-[38px]">
            {breadcrumb.map((item, i) => (
              <div key={i} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                {i < breadcrumb.length - 1 ? (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-medium"
                    onClick={() => navigateTo(i)}
                  >
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold">
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Folder list */}
          <div className="min-h-[280px] max-h-[360px] overflow-y-auto">
            {foldersLoading ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-xs">Chargement des dossiers…</p>
              </div>
            ) : foldersError ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <Button variant="outline" size="sm" onClick={() => loadFolders(currentFolder.id)}>Réessayer</Button>
              </div>
            ) : folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-2 text-muted-foreground">
                <Folder className="h-6 w-6 opacity-40" />
                <p className="text-sm font-medium">Aucun sous-dossier</p>
              </div>
            ) : (
              <ul>
                {folders.map((folder) => (
                  <li key={folder.id} className="border-b last:border-0">
                    <div className="flex items-center gap-2 px-3 py-0.5 hover:bg-muted/40 transition-colors group">
                      <button
                        className="flex items-center gap-3 flex-1 py-2.5 text-left min-w-0"
                        onClick={() => handleSelectScanFolder(folder)}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                          <Folder className="h-4 w-4 text-blue-500" />
                        </div>
                        <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
                      </button>
                      <button
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => navigateInto(folder)}
                        title="Ouvrir le dossier"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setView('settings')}>
              Annuler
            </Button>
            {currentFolder.id && (
              <Button size="sm" onClick={() => handleSelectScanFolder({ id: currentFolder.id!, name: currentFolder.name })}>
                <Check className="mr-2 h-3.5 w-3.5" />
                Scanner « {currentFolder.name} »
              </Button>
            )}
          </div>
        </DialogContent>
      )}

      {/* ── Vue : Folder picker ──────────────────────────────────────────────── */}
      {view === 'folder_picker' && (
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center gap-3">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setView('settings')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <DialogTitle className="text-base">Choisir un dossier</DialogTitle>
            </div>
          </DialogHeader>

          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 bg-muted/40 border-b min-h-[38px]">
            {breadcrumb.map((item, i) => (
              <div key={i} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                {i < breadcrumb.length - 1 ? (
                  <button
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-medium"
                    onClick={() => navigateTo(i)}
                  >
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold">
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Folder list */}
          <div className="min-h-[280px] max-h-[360px] overflow-y-auto">
            {foldersLoading ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-xs">Chargement des dossiers…</p>
              </div>
            ) : foldersError === 'scope_error' ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Reconnexion nécessaire</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Déconnectez Google Drive puis reconnectez-vous pour activer la navigation.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setView('settings')}>
                  Retour aux paramètres
                </Button>
              </div>
            ) : foldersError ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-3 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-xs text-muted-foreground">{foldersError}</p>
                <Button variant="outline" size="sm" onClick={() => loadFolders(currentFolder.id)}>
                  Réessayer
                </Button>
              </div>
            ) : folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[280px] gap-2 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Folder className="h-6 w-6 opacity-40" />
                </div>
                <p className="text-sm font-medium">Aucun sous-dossier</p>
                <p className="text-xs opacity-60">Sélectionnez ce dossier ou revenez en arrière</p>
              </div>
            ) : (
              <ul>
                {folders.map((folder) => (
                  <li key={folder.id} className="border-b last:border-0">
                    <div className="flex items-center gap-2 px-3 py-0.5 hover:bg-muted/40 transition-colors group">
                      {/* Folder icon + name — clicks to SELECT */}
                      <button
                        className="flex items-center gap-3 flex-1 py-2.5 text-left min-w-0"
                        onClick={() => handleSelectFolderDirect(folder)}
                        title="Sélectionner ce dossier"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                          <Folder className="h-4 w-4 text-blue-500" />
                        </div>
                        <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
                      </button>
                      {/* Navigate INTO arrow */}
                      <button
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => navigateInto(folder)}
                        title="Ouvrir le dossier"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setView('settings')}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSelectFolder}
              disabled={!currentFolder.id || foldersLoading || savingFolder}
            >
              {savingFolder
                ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                : <Check className="mr-2 h-3.5 w-3.5" />
              }
              Choisir « {currentFolder.id ? currentFolder.name : 'Mon Drive'} »
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
