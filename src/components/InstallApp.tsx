import { useEffect, useState } from 'react'
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react'
import { STORE_NAME } from '../config'
import { useInstallApp } from '../hooks/useInstallApp'
import { promptInstall } from '../lib/install'

// iPhones can't show an install dialog, so we explain the manual steps.
function IosSteps({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${STORE_NAME}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 text-gray-900 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Install {STORE_NAME}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <ol className="mt-4 space-y-4 text-sm">
          <li className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <Share size={18} />
            </span>
            <span>
              Tap the <b>Share</b> button in your browser (the square with an arrow).
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <PlusSquare size={18} />
            </span>
            <span>
              Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-gray-500">
          Open {STORE_NAME} from your home screen afterwards. That's also what lets your iPhone send you order
          notifications.
        </p>
      </div>
    </div>
  )
}

export default function InstallApp({ variant, className = '' }: { variant: 'footer' | 'card'; className?: string }) {
  const { canPrompt, installed, ios } = useInstallApp()
  const [help, setHelp] = useState(false)

  // Already installed, or a browser that can't install: show nothing.
  if (installed || (!canPrompt && !ios)) return null

  async function handleClick() {
    if (canPrompt) await promptInstall()
    else setHelp(true)
  }

  return (
    <>
      {variant === 'footer' ? (
        <button
          type="button"
          onClick={handleClick}
          className={`flex w-fit items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-brand ${className}`}
        >
          <Download size={16} /> Get the {STORE_NAME} app
        </button>
      ) : (
        <div className={`flex items-center gap-4 rounded-2xl border border-gray-200 p-4 ${className}`}>
          <Smartphone size={20} className="shrink-0 text-gray-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install the {STORE_NAME} app</p>
            <p className="text-xs text-gray-500">Access LOOMA directly from your home screen with just one tap.</p>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-light"
          >
            Install
          </button>
        </div>
      )}
      {help && <IosSteps onClose={() => setHelp(false)} />}
    </>
  )
}
