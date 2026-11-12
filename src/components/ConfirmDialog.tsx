import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// "Are you sure?" dialog for actions that are hard to undo (logging out, deactivating an account).
// Same look as the admin ConfirmDialog (title, text and button styles), but always centred with a margin around
// it, and drawn straight into <body> (a portal) so an animating page can never shift or clip it.
// Escape, tapping outside, or Cancel closes it. Focus starts on Cancel, so a stray Enter never confirms.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // The latest values, read inside the key handler. The effect below then only runs when the dialog opens
  // or closes: before, it re-ran on every re-render and pulled focus back to Cancel each time.
  const busyRef = useRef(busy)
  const cancelHandler = useRef(onCancel)
  useEffect(() => {
    busyRef.current = busy
    cancelHandler.current = onCancel
  })

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // the page behind doesn't scroll

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) cancelHandler.current()
      // Keep Tab inside the dialog: it only has two buttons (skipping one that is disabled while working).
      if (e.key === 'Tab') {
        e.preventDefault()
        if (busyRef.current) return
        const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
        next?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
        className="pop-in max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm text-gray-600">
          {children}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              danger ? 'bg-sale hover:bg-red-700' : 'bg-brand hover:bg-brand-light'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
