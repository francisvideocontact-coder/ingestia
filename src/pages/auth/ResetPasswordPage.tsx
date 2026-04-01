import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, FileText, CheckCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validation'

type PageState = 'waiting' | 'ready' | 'success'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [pageState, setPageState] = useState<PageState>('waiting')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const onSubmit = async (data: ResetPasswordFormData) => {
    setServerError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) throw error
      setPageState('success')
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      const error = err as Error
      if (error.message.toLowerCase().includes('same password')) {
        setServerError('Le nouveau mot de passe doit être différent de l\'ancien.')
      } else {
        setServerError('Une erreur est survenue. Veuillez demander un nouveau lien de réinitialisation.')
      }
    }
  }

  // ── En attente du token de récupération ──────────────────────────────────────
  if (pageState === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Vérification du lien…</h2>
                <p className="text-sm text-muted-foreground">
                  Si rien ne se passe, le lien est peut-être expiré.{' '}
                  <Link to="/forgot-password" className="text-primary hover:underline">
                    Demander un nouveau lien
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Succès ────────────────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Mot de passe modifié !</h2>
                <p className="text-sm text-muted-foreground">Redirection vers votre tableau de bord…</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Formulaire ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">InGest.ia</span>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Nouveau mot de passe
            </CardTitle>
            <CardDescription>Choisissez un mot de passe sécurisé pour votre compte</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {serverError && (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 16 caractères"
                  autoComplete="new-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  16 caractères minimum · 1 majuscule · 1 chiffre · 1 caractère spécial
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••••••••••"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
            </CardContent>

            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer le nouveau mot de passe
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
