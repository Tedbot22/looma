import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, X } from 'lucide-react'

// Opens the phone's camera and reads ONE QR code, then stops.
// It only reports what it read: whether the code is valid is decided by the server.
export default function QrScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [cameraError, setCameraError] = useState(false)

  useEffect(() => {
    let stopped = false
    let raf = 0
    let stream: MediaStream | null = null

    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }

    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        // Shrink the frame: faster to read, and plenty sharp for a phone-screen QR.
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
          if (result?.data) {
            stop() // one code, then stop: a stream of repeat scans would count as repeat attempts
            onScanRef.current(result.data.trim())
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        tick()
      } catch {
        setCameraError(true) // permission refused, no camera, or not a secure (https) page
      }
    })()

    return stop
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="font-semibold">Scan the customer's QR code</p>
        <button onClick={onClose} aria-label="Close scanner" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>

      {!cameraError ? (
        <div className="relative flex-1">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 rounded-2xl border-4 border-white/80" />
          </div>
          <p className="absolute inset-x-0 bottom-6 px-6 text-center text-sm text-white/90">
            Hold your phone steady so the whole code fits inside the box.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
          <Camera size={36} />
          <p className="font-medium">The camera could not be opened.</p>
          <p className="text-sm text-white/80">
            Allow camera access for this page in your browser settings, then tap Close and open the scanner again.
          </p>
        </div>
      )}
    </div>
  )
}
