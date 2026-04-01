import { useState } from 'react'
import {
  FileText, ImageIcon, Loader2, Trash2, CheckCircle,
  AlertCircle, Clock, Send, ChevronDown, ChevronUp, Eye, XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Document, DocumentStatus, DocumentType } from '@/types'
import DocumentSheet from '@/components/documents/DocumentSheet'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DocumentStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: 'En analyse',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  verified: {
    label: 'À vérifier',
    icon: <Clock className="h-3 w-3" />,
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  validated: {
    label: 'Validé',
    icon: <CheckCircle className="h-3 w-3" />,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  exported: {
    label: 'Exporté',
    icon: <Send className="h-3 w-3" />,
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  error: {
    label: 'Erreur analyse',
    icon: <AlertCircle className="h-3 w-3" />,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
}

const TYPE_LABELS: Record<DocumentType, string> = {
  facture: 'Facture',
  ndf: 'Note de frais',
  ticket: 'Ticket',
  avoir: 'Avoir',
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 60 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-700'
  return (
    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', color)}>
      {score}%
    </span>
  )
}

// ─── Amount formatters ────────────────────────────────────────────────────────

function formatAmount(amount: number | undefined | null, currency = 'EUR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentCardProps {
  document: Document
  onDelete: (id: string) => void
  onUpdate: (id: string, changes: Partial<Document>) => Promise<void>
  workspaceId?: string
}

export default function DocumentCard({ document: doc, onDelete, onUpdate, workspaceId }: DocumentCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [validating, setValidating] = useState(false)

  const isPdf = doc.original_filename.toLowerCase().endsWith('.pdf')
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.error
  const isPending = doc.status === 'pending'
  const isError = doc.status === 'error'
  const isVerified = doc.status === 'verified'
  const isValidated = doc.status === 'validated'
  const overallScore = doc.confidence_scores?.overall

  const handleDelete = async () => {
    if (!confirm(`Supprimer "${doc.original_filename}" ?`)) return
    setDeleting(true)
    try {
      await onDelete(doc.id)
    } catch {
      setDeleting(false)
    }
  }

  const handleValidate = async () => {
    setValidating(true)
    try {
      await onUpdate(doc.id, { status: 'validated' })
    } finally {
      setValidating(false)
    }
  }

  const handleUnvalidate = async () => {
    setValidating(true)
    try {
      await onUpdate(doc.id, { status: 'verified' })
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-sm',
      isPending && 'opacity-80'
    )}>
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        {/* File type icon */}
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          isPdf ? 'bg-red-50' : 'bg-blue-50'
        )}>
          {isPdf
            ? <FileText className="h-5 w-5 text-red-500" />
            : <ImageIcon className="h-5 w-5 text-blue-500" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              {/* Supplier or filename */}
              <p className="font-medium text-sm truncate">
                {isPending
                  ? <span className="text-muted-foreground italic">Analyse en cours…</span>
                  : isError
                  ? <span className="text-red-600 italic">Analyse échouée — supprimez et réessayez</span>
                  : (doc.supplier || doc.original_filename)
                }
              </p>
              {/* Original filename */}
              <p className="text-xs text-muted-foreground truncate">{doc.original_filename}</p>
            </div>

            {/* Status badge */}
            <Badge
              className={cn('shrink-0 flex items-center gap-1 border', status.className)}
              variant="outline"
            >
              {status.icon}
              {status.label}
            </Badge>
          </div>

          {/* Key data row */}
          {!isPending && !isError && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {doc.document_type && (
                <Badge variant="secondary" className="text-xs">
                  {TYPE_LABELS[doc.document_type]}
                </Badge>
              )}
              {doc.date && (
                <span className="text-xs text-muted-foreground">{formatDate(doc.date)}</span>
              )}
              {doc.amount_ttc != null && (
                <span className="text-sm font-semibold">
                  {formatAmount(doc.amount_ttc)} TTC
                  {doc.currency && doc.currency !== 'EUR' && doc.amount_original_currency != null && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({formatAmount(doc.amount_original_currency, doc.currency)})
                    </span>
                  )}
                </span>
              )}
              {doc.category && (
                <span className="text-xs text-muted-foreground">{doc.category}</span>
              )}
              {overallScore != null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Confiance : <ConfidenceBadge score={overallScore} />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isPending && !isError && (
            <>
              {/* Quick validate / unvalidate */}
              {isVerified && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={handleValidate}
                  disabled={validating}
                  title="Valider"
                >
                  {validating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle className="h-3.5 w-3.5" />
                  }
                </Button>
              )}
              {isValidated && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={handleUnvalidate}
                  disabled={validating}
                  title="Retirer la validation"
                >
                  {validating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <XCircle className="h-3.5 w-3.5" />
                  }
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setSheetOpen(true)}
                title="Voir et modifier"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />
            }
          </Button>
        </div>
      </div>

      {/* Document sheet */}
      <DocumentSheet
        document={doc}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onUpdate={onUpdate}
        workspaceId={workspaceId}
      />

      {/* Details panel */}
      {showDetails && !isPending && !isError && (
        <div className="border-t px-4 py-3 bg-muted/20 space-y-3">
          {/* Amounts */}
          {(doc.amount_ht != null || doc.amount_ttc != null || doc.vat_amount != null) && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Montant HT</p>
                <p className="text-sm font-medium">{formatAmount(doc.amount_ht)}</p>
                {doc.confidence_scores?.amount_ht != null && (
                  <ConfidenceBadge score={doc.confidence_scores.amount_ht} />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">TVA</p>
                <p className="text-sm font-medium">{formatAmount(doc.vat_amount)}</p>
                {doc.confidence_scores?.vat_amount != null && (
                  <ConfidenceBadge score={doc.confidence_scores.vat_amount} />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Montant TTC</p>
                <p className="text-sm font-semibold">{formatAmount(doc.amount_ttc)}</p>
                {doc.confidence_scores?.amount_ttc != null && (
                  <ConfidenceBadge score={doc.confidence_scores.amount_ttc} />
                )}
              </div>
            </div>
          )}

          {/* Filename preview */}
          {doc.final_filename && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Nom final</p>
              <p className="text-xs font-mono bg-muted px-2 py-1 rounded">{doc.final_filename}</p>
            </div>
          )}

          {/* Low confidence warning */}
          {overallScore != null && overallScore < 70 && (
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs">
                Confiance faible ({overallScore}%). Vérifiez les données extraites avant de valider.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
