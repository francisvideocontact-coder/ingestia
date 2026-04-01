import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const code = searchParams.get('code')
    const workspaceId = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      setErrorMessage(error === 'access_denied' ? 'Accès refusé par l\'utilisateur.' : error)
      setStatus('error')
      return
    }

    if (!code || !workspaceId) {
      setErrorMessage('Paramètres manquants dans la réponse Google.')
      setStatus('error')
      return
    }

    const exchange = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { code, workspace_id: workspaceId },
        })

        if (fnError) {
          // Récupérer le vrai message depuis la réponse de l'Edge Function
          const realMessage = (data as { error?: string } | null)?.error ?? fnError.message
          throw new Error(realMessage)
        }
        if (data?.error) throw new Error(data.error)

        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 1500)
      } catch (err) {
        setErrorMessage((err as Error).message ?? 'Une erreur est survenue.')
        setStatus('error')
      }
    }

    exchange()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="flex flex-col items-center text-center gap-4 max-w-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Connexion à Google Drive en cours…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-semibold text-lg">Google Drive connecté !</p>
            <p className="text-sm text-muted-foreground">Redirection vers le tableau de bord…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="font-semibold text-lg">Échec de la connexion</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Retour au tableau de bord
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
