import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, CheckCircle, Loader2, Unplug, FolderOpen, X,
  ChevronRight, Home, Folder, Check, AlertCircle, ArrowLeft,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
      if (fnError) throw fnError
      if (data?.error === 'insufficient_scope') {
        setFoldersError('scope_error')
        return
      }
      if (data?.error) throw new Error(data.error)
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

  const handleSelectFolder = async () => {
    if (!currentFolder.id || !workspaceId) return
    const path = breadcrumb.slice(1).map((b) => b.name).join('/')
    setSavingFolder(true)
    try {
      const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
      await supabase
        .from('workspaces')
        .update({
          settings: {
            ...(ws?.settings as object ?? {}),
            drive_folder_id: currentFolder.id,
            drive_folder_path: path,
          },
        })
        .eq('id', workspaceId)
      setDriveFolderId(currentFolder.id)
      setDriveFolderPath(path)
      setView('settings')
    } finally {
      setSavingFolder(false)
    }
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
        <DialogContent className="max-w-md">
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
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <p className="text-sm font-medium">Connecté</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Dossier de destination */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Dossier de destination</p>

                    {driveFolderId ? (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                        <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate">{driveFolderPath}</span>
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
                      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-muted-foreground">
                        <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="text-xs font-mono flex-1 truncate opacity-60">{defaultFolderLabel}</span>
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
          <DialogHeader className="px-4 pt-4 pb-3 border-b">
            <div className="flex items-center gap-2">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setView('settings')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <DialogTitle className="text-base">Choisir un dossier</DialogTitle>
            </div>
          </DialogHeader>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 flex-wrap px-4 py-2 bg-muted/30 border-b min-h-[36px]">
            {breadcrumb.map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                {i < breadcrumb.length - 1 ? (
                  <button
                    className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                    onClick={() => navigateTo(i)}
                  >
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </button>
                ) : (
                  <span className="text-xs font-semibold flex items-center gap-1">
                    {i === 0 ? <Home className="h-3 w-3" /> : item.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Folder list */}
          <div className="min-h-[240px] max-h-[320px] overflow-y-auto">
            {foldersLoading ? (
              <div className="flex items-center justify-center h-[240px]">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : foldersError === 'scope_error' ? (
              <div className="flex flex-col items-center justify-center h-[240px] gap-3 px-6 text-center">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">Reconnexion nécessaire</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Déconnectez Google Drive puis reconnectez-vous pour activer la navigation de dossiers.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setView('settings')}>
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Retour aux paramètres
                </Button>
              </div>
            ) : foldersError ? (
              <div className="flex flex-col items-center justify-center h-[240px] gap-3 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <p className="text-xs text-muted-foreground">{foldersError}</p>
                <Button variant="outline" size="sm" onClick={() => loadFolders(currentFolder.id)}>
                  Réessayer
                </Button>
              </div>
            ) : folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] gap-2 text-muted-foreground">
                <Folder className="h-8 w-8 opacity-30" />
                <p className="text-sm">Aucun sous-dossier</p>
              </div>
            ) : (
              <ul className="divide-y">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => navigateInto(folder)}
                    >
                      <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm truncate flex-1">{folder.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="px-4 py-3 border-t bg-muted/20 flex-row gap-2 justify-between sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => setView('settings')}>
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
              Sélectionner ce dossier
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
