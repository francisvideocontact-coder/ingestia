import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, CheckCircle, Loader2, Unplug, FolderOpen, X,
  ChevronRight, Home, Folder, Check, AlertCircle, ArrowLeft,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveFolder { id: string; name: string }
interface BreadcrumbItem { id: string | null; name: string }
type View = 'settings' | 'folder_picker'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string | undefined
  workspaceName?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsModal({ open, onClose, workspaceId, workspaceName }: SettingsModalProps) {
  const { isConnected, loading, connect, disconnect } = useGoogleDrive(workspaceId)

  // Settings state
  const [disconnecting, setDisconnecting] = useState(false)
  const [driveFolderPath, setDriveFolderPath] = useState<string | null>(null)
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null)
  const [savingFolder, setSavingFolder] = useState(false)

  // Folder picker state
  const [view, setView] = useState<View>('settings')
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersError, setFoldersError] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Mon Drive' }])

  const currentFolder = breadcrumb[breadcrumb.length - 1]

  // ── Charger les settings Drive ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || !workspaceId || !isConnected) return
    supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
      .then(({ data }) => {
        const s = data?.settings as Record<string, unknown> | null
        setDriveFolderId((s?.drive_folder_id as string) ?? null)
        setDriveFolderPath((s?.drive_folder_path as string) ?? null)
      })
  }, [open, workspaceId, isConnected])

  // Réinitialiser la vue quand la modale se ferme
  useEffect(() => {
    if (!open) setView('settings')
  }, [open])

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

          <div className="space-y-6 py-2">
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

            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1.5 text-xs">Info</Badge>
                L'application accède uniquement aux fichiers qu'elle crée et à la liste de vos dossiers pour la navigation.
              </p>
            </div>
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
