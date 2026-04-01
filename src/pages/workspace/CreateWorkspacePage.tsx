import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Loader2, FileText, Plus, Trash2, Users, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { createWorkspaceSchema, type CreateWorkspaceFormData } from '@/lib/validation'
import type { PendingInvitation, WorkspaceRole } from '@/types'

const ROLE_LABELS: Record<Exclude<WorkspaceRole, 'owner'>, string> = {
  admin: 'Administrateur',
  member: 'Membre',
  viewer: 'Lecteur',
}

const DEFAULT_CATEGORIES = [
  { name: 'Matériel informatique', code: 'MATERIEL' },
  { name: 'Fournitures de bureau', code: 'FOURNITURES' },
  { name: 'Déplacements', code: 'DEPLACEMENT' },
  { name: 'Repas & Restauration', code: 'REPAS' },
  { name: 'Télécommunications', code: 'TELECOM' },
  { name: 'Logiciels & Abonnements', code: 'LOGICIELS' },
  { name: 'Formation', code: 'FORMATION' },
  { name: 'Autres', code: 'AUTRES' },
]

export default function CreateWorkspacePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<WorkspaceRole, 'owner'>>('member')
  const [inviteError, setInviteError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormData>({
    resolver: zodResolver(createWorkspaceSchema),
  })

  const addInvitation = () => {
    setInviteError(null)
    const email = inviteEmail.trim().toLowerCase()

    if (!email) {
      setInviteError('Entrez une adresse email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Adresse email invalide.')
      return
    }
    if (email === user?.email?.toLowerCase()) {
      setInviteError('Vous ne pouvez pas vous inviter vous-même.')
      return
    }
    if (invitations.some((inv) => inv.email === email)) {
      setInviteError('Cette adresse est déjà dans la liste.')
      return
    }

    setInvitations((prev) => [...prev, { email, role: inviteRole }])
    setInviteEmail('')
  }

  const removeInvitation = (email: string) => {
    setInvitations((prev) => prev.filter((inv) => inv.email !== email))
  }

  const onSubmit = async (data: CreateWorkspaceFormData) => {
    if (!user) return
    setServerError(null)

    try {
      // 1. Créer le workspace (UUID généré côté client pour éviter le .select()
      //    qui déclencherait la policy workspaces_select avant l'insertion du membre)
      const workspaceId = crypto.randomUUID()
      const { error: wsError } = await supabase
        .from('workspaces')
        .insert({ id: workspaceId, name: data.name, owner_id: user.id })

      if (wsError) throw wsError

      // 2. Insérer l'owner dans workspace_members
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' })

      if (memberError) throw memberError

      // 3. Insérer les catégories par défaut
      const categories = DEFAULT_CATEGORIES.map((cat) => ({
        workspace_id: workspaceId,
        name: cat.name,
        code: cat.code,
        is_active: true,
      }))

      const { error: catError } = await supabase.from('categories').insert(categories)
      if (catError) console.warn('Erreur insertion catégories:', catError)

      // 4. Envoyer les invitations
      for (const invitation of invitations) {
        const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(invitation.email, {
          data: {
            workspace_id: workspaceId,
            role: invitation.role,
          },
        })
        if (inviteErr) {
          console.warn(`Invitation échouée pour ${invitation.email}:`, inviteErr)
        }
      }

      navigate('/dashboard')
    } catch (err) {
      const error = err as Error
      setServerError(error.message || 'Erreur lors de la création du workspace.')
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pt-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">InGest.ia</h1>
            <p className="text-sm text-muted-foreground">Configuration initiale</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {/* Section : Nom du workspace */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Votre workspace
              </CardTitle>
              <CardDescription>
                Le workspace est votre espace de travail. Donnez-lui le nom de votre entreprise
                ou de votre organisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du workspace</Label>
                <Input
                  id="name"
                  placeholder="Ex: ACME SAS, Cabinet Martin..."
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section : Invitation membres */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Inviter des membres
              </CardTitle>
              <CardDescription>
                Optionnel — Invitez des collaborateurs à rejoindre votre workspace.
                Ils recevront un email d'invitation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Formulaire d'ajout */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="collaborateur@exemple.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addInvitation()
                      }
                    }}
                  />
                </div>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as Exclude<WorkspaceRole, 'owner'>)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="member">Membre</SelectItem>
                    <SelectItem value="viewer">Lecteur</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={addInvitation}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {inviteError && (
                <p className="text-sm text-destructive">{inviteError}</p>
              )}

              {/* Liste des invitations */}
              {invitations.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <p className="text-sm font-medium text-muted-foreground">
                    {invitations.length} invitation{invitations.length > 1 ? 's' : ''} en attente
                  </p>
                  {invitations.map((inv) => (
                    <div
                      key={inv.email}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{inv.email}</span>
                        <Badge variant="secondary">{ROLE_LABELS[inv.role]}</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeInvitation(inv.email)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Légende des rôles */}
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Rôles disponibles</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li><span className="font-medium">Administrateur</span> — Peut tout gérer sauf supprimer le workspace</li>
                  <li><span className="font-medium">Membre</span> — Peut uploader et vérifier des documents</li>
                  <li><span className="font-medium">Lecteur</span> — Peut uniquement consulter les documents</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Bouton de soumission */}
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer mon workspace et continuer
          </Button>
        </form>
      </div>
    </div>
  )
}
