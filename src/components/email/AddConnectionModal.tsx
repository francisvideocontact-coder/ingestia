import { useState } from 'react'
import { Loader2, Mail, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { NewEmailConnection } from '@/hooks/useEmailConnections'

// ─── Provider presets ──────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', host: 'imap.gmail.com', port: 993 },
  { id: 'outlook', label: 'Outlook / Hotmail', host: 'outlook.office365.com', port: 993 },
  { id: 'imap', label: 'Autre (IMAP)', host: '', port: 993 },
] as const

type ProviderId = typeof PROVIDERS[number]['id']

// ─── Component ────────────────────────────────────────────────────────────────

interface AddConnectionModalProps {
  open: boolean
  onClose: () => void
  onAdd: (data: NewEmailConnection) => Promise<void>
}

export default function AddConnectionModal({ open, onClose, onAdd }: AddConnectionModalProps) {
  const [provider, setProvider] = useState<ProviderId>('gmail')
  const [host, setHost] = useState('imap.gmail.com')
  const [port, setPort] = useState('993')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProviderChange = (p: ProviderId) => {
    setProvider(p)
    const preset = PROVIDERS.find((x) => x.id === p)
    if (preset && preset.host) setHost(preset.host)
    if (preset) setPort(String(preset.port))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onAdd({
        provider: provider === 'gmail' ? 'gmail' : 'imap',
        credentials: {
          host,
          port: parseInt(port, 10),
          secure: true,
          user: email,
          pass: password,
        },
      })
      onClose()
      // Reset
      setEmail('')
      setPassword('')
    } catch (err) {
      setError((err as Error).message ?? 'Erreur lors de l\'ajout')
    } finally {
      setSaving(false)
    }
  }

  const isGmail = provider === 'gmail'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Connecter une boîte mail
          </DialogTitle>
          <DialogDescription>
            Les emails avec pièces jointes comptables seront détectés automatiquement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Provider selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fournisseur</Label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={cn(
                    'px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                    provider === p.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gmail app password notice */}
          {isGmail && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-700">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs">
                Gmail nécessite un <strong>mot de passe d'application</strong> (pas votre mot de passe habituel).{' '}
                Activez-le dans : Compte Google → Sécurité → Validation en 2 étapes → Mots de passe des applications.
              </p>
            </div>
          )}

          {/* IMAP host + port (hidden for Gmail/Outlook presets) */}
          {provider === 'imap' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Serveur IMAP</Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="imap.example.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Port</Label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="993"
                  required
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Adresse email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@gmail.com"
              required
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {isGmail ? 'Mot de passe d\'application (16 caractères)' : 'Mot de passe'}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isGmail ? 'xxxx xxxx xxxx xxxx' : '••••••••'}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connecter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
