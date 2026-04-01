import { useState, useEffect, useMemo } from 'react'
import { Loader2, AlertCircle, CheckCircle, Upload } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { generateFilename } from '@/lib/nomenclature'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'
import type { Document, DocumentStatus, DocumentType } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'facture', label: 'Facture' },
  { value: 'ndf', label: 'Note de frais' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'avoir', label: 'Avoir' },
]

const CATEGORIES = [
  'MATERIEL',
  'FOURNITURES',
  'DEPLACEMENT',
  'REPAS',
  'TELECOM',
  'LOGICIELS',
  'FORMATION',
  'AUTRES',
]

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  pending: { label: 'En analyse', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  verified: { label: 'À vérifier', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  validated: { label: 'Validé', className: 'bg-green-100 text-green-700 border-green-200' },
  exported: { label: 'Exporté', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  error: { label: 'Erreur', className: 'bg-red-100 text-red-700 border-red-200' },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocumentSheetProps {
  document: Document | null
  open: boolean
  onClose: () => void
  onUpdate: (id: string, changes: Partial<Document>) => Promise<void>
  workspaceId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentSheet({ document: doc, open, onClose, onUpdate, workspaceId }: DocumentSheetProps) {
  const { isConnected, exportDocument, exporting } = useGoogleDrive(workspaceId)
  // ── Preview state ──────────────────────────────────────────────────────────
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // ── Form state ─────────────────────────────────────────────────────────────
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType | ''>('')
  const [category, setCategory] = useState('')
  const [amountHt, setAmountHt] = useState('')
  const [vat, setVat] = useState('')
  const [amountTtc, setAmountTtc] = useState('')

  // ── Action state ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)

  const isPdf = doc?.original_filename.toLowerCase().endsWith('.pdf')

  // ── Populate form when doc changes ────────────────────────────────────────
  useEffect(() => {
    if (!doc) return
    setSupplier(doc.supplier ?? '')
    setDate(doc.date ?? '')
    setDocumentType(doc.document_type ?? '')
    setCategory(doc.category ?? '')
    setAmountHt(doc.amount_ht != null ? String(doc.amount_ht) : '')
    setVat(doc.vat_amount != null ? String(doc.vat_amount) : '')
    setAmountTtc(doc.amount_ttc != null ? String(doc.amount_ttc) : '')
  }, [doc])

  // ── Fetch signed URL when sheet opens ─────────────────────────────────────
  useEffect(() => {
    if (!open || !doc) {
      setSignedUrl(null)
      setPreviewError(null)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    supabase.storage
      .from('documents')
      .createSignedUrl(doc.original_file_url, 3600)
      .then(({ data, error: err }) => {
        if (err || !data) {
          setPreviewError('Impossible de charger le document.')
        } else {
          setSignedUrl(data.signedUrl)
        }
        setPreviewLoading(false)
      })
  }, [open, doc])

  // ── Auto-preview filename ──────────────────────────────────────────────────
  const previewedFilename = useMemo(
    () => generateFilename({ supplier: supplier || undefined, date: date || undefined, document_type: (documentType as DocumentType) || undefined, category: category || undefined }),
    [supplier, date, documentType, category]
  )

  // ── Save edits ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!doc) return
    setSaving(true)
    try {
      const changes: Partial<Document> = {
        supplier: supplier || undefined,
        date: date || undefined,
        document_type: (documentType as DocumentType) || undefined,
        category: category || undefined,
        amount_ht: amountHt !== '' ? parseFloat(amountHt) : undefined,
        vat_amount: vat !== '' ? parseFloat(vat) : undefined,
        amount_ttc: amountTtc !== '' ? parseFloat(amountTtc) : undefined,
        final_filename: previewedFilename,
      }
      await onUpdate(doc.id, changes)
      onClose()
    } catch {
      // keep sheet open on error
    } finally {
      setSaving(false)
    }
  }

  // ── Validate (verified → validated) ───────────────────────────────────────
  const handleValidate = async () => {
    if (!doc) return
    setValidating(true)
    try {
      await onUpdate(doc.id, { status: 'validated' })
    } finally {
      setValidating(false)
    }
  }

  // ── Export vers Google Drive (validated → exported) ───────────────────────
  const handleExportToDrive = async () => {
    if (!doc) return
    setValidating(true)
    try {
      await exportDocument(doc.id)
      onClose()
    } finally {
      setValidating(false)
    }
  }

  if (!doc) return null

  const statusCfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.error
  const canEdit = doc.status !== 'pending' && doc.status !== 'exported'

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[85vw] max-w-[1100px] sm:max-w-[1100px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <SheetTitle className="text-sm font-medium truncate flex-1">
              {doc.original_filename}
            </SheetTitle>
            <Badge
              variant="outline"
              className={cn('shrink-0 border text-xs', statusCfg.className)}
            >
              {statusCfg.label}
            </Badge>
          </div>
        </SheetHeader>

        {/* Body — two columns */}
        <div className="flex flex-1 min-h-0">

          {/* Left: document preview */}
          <div className="flex-[55] border-r min-h-0 bg-muted/20 flex flex-col overflow-hidden">
            {previewLoading && (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {previewError && (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-destructive">
                <AlertCircle className="h-6 w-6" />
                <p className="text-sm">{previewError}</p>
              </div>
            )}
            {signedUrl && !previewLoading && (
              isPdf ? (
                <iframe
                  src={signedUrl}
                  className="flex-1 w-full border-0 min-h-0"
                  title={doc.original_filename}
                />
              ) : (
                <div className="flex items-center justify-center flex-1 p-4 overflow-auto">
                  <img
                    src={signedUrl}
                    alt={doc.original_filename}
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>
              )
            )}
          </div>

          {/* Right: editable form */}
          <div className="flex-[45] flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Fournisseur */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fournisseur</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="ex: AMAZON FR"
                  disabled={!canEdit}
                />
              </div>

              {/* Date */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              {/* Type de document */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type de document</Label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                  disabled={!canEdit}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">— Choisir —</option>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Catégorie */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Catégorie</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!canEdit}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">— Choisir —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Montants */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Montant HT (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountHt}
                    onChange={(e) => setAmountHt(e.target.value)}
                    placeholder="0.00"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">TVA (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={vat}
                    onChange={(e) => setVat(e.target.value)}
                    placeholder="0.00"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Montant TTC (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountTtc}
                    onChange={(e) => setAmountTtc(e.target.value)}
                    placeholder="0.00"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              {/* Nom de fichier final */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nom de fichier final</Label>
                <p className="text-xs font-mono bg-muted px-2 py-2 rounded border border-border break-all">
                  {previewedFilename}
                </p>
              </div>

            </div>

            {/* Footer actions */}
            {canEdit && (
              <div className="border-t px-5 py-4 flex flex-col gap-2 shrink-0">
                {/* Status action */}
                {doc.status === 'verified' && (
                  <Button
                    onClick={handleValidate}
                    disabled={validating}
                    className="w-full gap-2"
                  >
                    {validating
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CheckCircle className="h-4 w-4" />
                    }
                    Valider le document
                  </Button>
                )}
                {doc.status === 'validated' && (
                  <Button
                    onClick={handleExportToDrive}
                    disabled={validating || exporting.has(doc.id) || !isConnected}
                    className="w-full gap-2"
                    title={!isConnected ? 'Connectez Google Drive dans les paramètres' : undefined}
                  >
                    {(validating || exporting.has(doc.id))
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Upload className="h-4 w-4" />
                    }
                    {isConnected ? 'Exporter vers Google Drive' : 'Google Drive non connecté'}
                  </Button>
                )}

                {/* Save */}
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Enregistrer les modifications
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
