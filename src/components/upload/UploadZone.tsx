import { useRef, useState, useCallback } from 'react'
import { Upload, Camera, FileText, ImageIcon, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { validateFile, type UploadingFile } from '@/hooks/useDocuments'
import CameraCapture from '@/components/upload/CameraCapture'

interface UploadZoneProps {
  workspaceId: string
  uploading: UploadingFile[]
  onUpload: (file: File) => Promise<void>
  disabled?: boolean
}

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif'

function FileIcon({ filename }: { filename: string }) {
  const isPdf = filename.toLowerCase().endsWith('.pdf')
  return isPdf
    ? <FileText className="h-4 w-4 text-red-500" />
    : <ImageIcon className="h-4 w-4 text-blue-500" />
}

function UploadStatusIcon({ status }: { status: UploadingFile['status'] }) {
  switch (status) {
    case 'uploading':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    case 'analyzing':
      return (
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse [animation-delay:300ms]" />
        </div>
      )
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />
  }
}

function UploadStatusLabel({ status }: { status: UploadingFile['status'] }) {
  switch (status) {
    case 'uploading': return <span className="text-xs text-muted-foreground">Envoi en cours…</span>
    case 'analyzing': return <span className="text-xs text-amber-600">Analyse IA…</span>
    case 'done': return <span className="text-xs text-green-600">Terminé</span>
    case 'error': return <span className="text-xs text-red-500">Erreur</span>
  }
}

export default function UploadZone({ uploading, onUpload, disabled }: Omit<UploadZoneProps, 'workspaceId'> & { workspaceId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const processFiles = useCallback(async (files: File[]) => {
    setValidationErrors([])
    const errors: string[] = []

    for (const file of files) {
      const err = validateFile(file)
      if (err) {
        errors.push(`${file.name} : ${err}`)
        continue
      }
      try {
        await onUpload(file)
      } catch (uploadErr) {
        errors.push(`${file.name} : Erreur lors de l'upload`)
        console.error(uploadErr)
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      setTimeout(() => setValidationErrors([]), 8000)
    }
  }, [onUpload])

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) processFiles(files)
  }

  // ── File input ──────────────────────────────────────────────────────────────
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) processFiles(files)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  // ── Camera capture ──────────────────────────────────────────────────────────
  const onCameraCapture = (file: File) => {
    processFiles([file])
  }

  const hasUploading = uploading.length > 0

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors select-none',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
      >
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
          isDragging ? 'bg-primary/20' : 'bg-muted'
        )}>
          <Upload className={cn('h-6 w-6 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground')} />
        </div>

        <div className="space-y-1">
          <p className="font-medium text-sm">
            {isDragging ? 'Déposez les fichiers ici' : 'Glissez-déposez vos documents'}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, PNG, HEIC — max 20 Mo par fichier
          </p>
        </div>

        <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            Choisir des fichiers
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setCameraOpen(true)}
            title="Prendre une photo"
          >
            <Camera className="mr-2 h-3.5 w-3.5" />
            Caméra
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Upload queue */}
      {hasUploading && (
        <div className="space-y-2">
          {uploading.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <FileIcon filename={item.filename} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.filename}</p>
                <UploadStatusLabel status={item.status} />
                {item.error && (
                  <p className="text-xs text-destructive">{item.error}</p>
                )}
              </div>
              <UploadStatusIcon status={item.status} />
            </div>
          ))}
        </div>
      )}

      {/* Camera dialog */}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onCameraCapture}
      />
    </div>
  )
}
