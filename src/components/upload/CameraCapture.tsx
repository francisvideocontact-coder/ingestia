import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, SwitchCamera, X, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface CameraCaptureProps {
  open: boolean
  onClose: () => void
  onCapture: (file: File) => void
}

type CameraError = 'permission_denied' | 'not_found' | 'unknown'

export default function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraError, setCameraError] = useState<CameraError | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [captured, setCaptured] = useState<string | null>(null) // base64 preview
  const [isReady, setIsReady] = useState(false)

  // ── Start camera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setIsReady(false)
    setCameraError(null)
    setCaptured(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      const error = err as DOMException
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('permission_denied')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('not_found')
      } else {
        setCameraError('unknown')
      }
    }
  }, [])

  // ── Open/close camera ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      startCamera(facingMode)
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      setCaptured(null)
      setCameraError(null)
      setIsReady(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch camera ───────────────────────────────────────────────────────────
  const switchCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  // ── Capture frame ───────────────────────────────────────────────────────────
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCaptured(dataUrl)

    // Stop camera stream while previewing
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // ── Retake ──────────────────────────────────────────────────────────────────
  const retake = () => {
    setCaptured(null)
    startCamera(facingMode)
  }

  // ── Confirm capture ─────────────────────────────────────────────────────────
  const confirmCapture = () => {
    if (!canvasRef.current || !captured) return

    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const file = new File([blob], `photo-${timestamp}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
        onClose()
      },
      'image/jpeg',
      0.92
    )
  }

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photographier un document
          </DialogTitle>
          <DialogDescription>
            Cadrez le document dans la fenêtre et appuyez sur Capturer
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black">
          {/* Error state */}
          {cameraError && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-white p-6">
              <AlertCircle className="h-10 w-10 text-red-400" />
              {cameraError === 'permission_denied' && (
                <>
                  <p className="font-medium">Accès à la caméra refusé</p>
                  <p className="text-sm text-gray-300 text-center">
                    Autorisez l'accès à la caméra dans les paramètres de votre navigateur.
                  </p>
                </>
              )}
              {cameraError === 'not_found' && (
                <>
                  <p className="font-medium">Aucune caméra détectée</p>
                  <p className="text-sm text-gray-300 text-center">
                    Votre appareil ne dispose pas de caméra accessible.
                  </p>
                </>
              )}
              {cameraError === 'unknown' && (
                <>
                  <p className="font-medium">Erreur caméra</p>
                  <p className="text-sm text-gray-300 text-center">
                    Impossible d'accéder à la caméra. Réessayez.
                  </p>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => startCamera(facingMode)}>
                Réessayer
              </Button>
            </div>
          )}

          {/* Camera preview */}
          {!cameraError && !captured && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedData={() => setIsReady(true)}
                className="w-full max-h-[60vh] object-contain"
              />
              {/* Document frame guide */}
              {isReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-white/60 rounded-lg w-[80%] h-[60%] relative">
                    {/* Corner accents */}
                    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                      <div
                        key={corner}
                        className={`absolute w-6 h-6 border-white border-2 ${
                          corner === 'tl' ? 'top-0 left-0 border-r-0 border-b-0 rounded-tl' :
                          corner === 'tr' ? 'top-0 right-0 border-l-0 border-b-0 rounded-tr' :
                          corner === 'bl' ? 'bottom-0 left-0 border-r-0 border-t-0 rounded-bl' :
                          'bottom-0 right-0 border-l-0 border-t-0 rounded-br'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Captured preview */}
          {captured && (
            <img
              src={captured}
              alt="Document capturé"
              className="w-full max-h-[60vh] object-contain"
            />
          )}
        </div>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Controls */}
        <div className="p-4 flex items-center justify-between gap-3">
          {!captured ? (
            <>
              <Button variant="outline" size="icon" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>

              <Button
                size="lg"
                className="flex-1 max-w-xs mx-auto rounded-full h-14 w-14 flex-none p-0"
                onClick={captureFrame}
                disabled={!isReady || !!cameraError}
                title="Capturer"
              >
                <Camera className="h-6 w-6" />
              </Button>

              <Button variant="outline" size="icon" onClick={switchCamera} title="Retourner la caméra">
                <SwitchCamera className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={retake} className="flex-1">
                <X className="mr-2 h-4 w-4" />
                Reprendre
              </Button>
              <Button onClick={confirmCapture} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                Utiliser cette photo
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
