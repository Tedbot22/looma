import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { AlertTriangle } from 'lucide-react'

// In-app replacements for the browser's window.confirm / window.prompt boxes.
// They look like the rest of the store, work on every device, and are used with await:
//
//   const dialog = useDialog()
//   if (!(await dialog.confirm({ title: 'Delete this banner?', danger: true }))) return
//   const note = await dialog.prompt({ title: 'Note for the customer', label: 'Note (optional)' })
//   if (note === null) return // they cancelled

interface BaseOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for things that can't be undone. Focus starts on Cancel. */
  danger?: boolean
}

export type ConfirmOptions = BaseOptions

export interface PromptOptions extends BaseOptions {
  label?: string
  placeholder?: string
  initialValue?: string
  /** When true the confirm button stays disabled until something is typed. Default: the answer is optional. */
  required?: boolean
  multiline?: boolean
  maxLength?: number
}

interface DialogApi {
  /** Resolves true when confirmed, false when cancelled (button, Escape or tapping outside). */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Resolves the typed text (trimmed, possibly empty) when confirmed, or null when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>
}

type Request =
  | ({ kind: 'confirm'; id: number; resolve: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; id: number; resolve: (v: string | null) => void } & PromptOptions)

const DialogContext = createContext<DialogApi | null>(null)
const DIALOG_MARK = '__loomaDialog'

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([])
  const nextId = useRef(0)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const id = nextId.current++
        setQueue((q) => [...q, { ...options, kind: 'confirm', id, resolve }])
      }),
    []
  )

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        const id = nextId.current++
        setQueue((q) => [...q, { ...options, kind: 'prompt', id, resolve }])
      }),
    []
  )

  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt])
  const current = queue[0]

  // The device back button should close the dialog (like Cancel) instead of leaving the page.
  // While a dialog is open we add one history entry; Back removes it and we treat that as a cancel.
  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  const ignorePops = useRef(0) // popstates caused by our own history.back() when a dialog closes normally
  const open = queue.length > 0

  useEffect(() => {
    if (!open) return
    const ignore = ignorePops
    let pushed = false
    // Deferred a tick so React StrictMode's mount/unmount/mount in dev doesn't push and pop twice.
    const timer = setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), [DIALOG_MARK]: true }, '')
      pushed = true
    }, 0)

    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current--
        return
      }
      const [first, ...rest] = queueRef.current
      if (!first) return
      if (first.kind === 'confirm') first.resolve(false)
      else first.resolve(null)
      setQueue(rest)
      // Another dialog is waiting, so it needs its own entry for Back to remove.
      if (rest.length > 0) {
        window.history.pushState({ ...(window.history.state ?? {}), [DIALOG_MARK]: true }, '')
      }
    }
    window.addEventListener('popstate', onPop)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      // Closed with a button, so remove the extra entry (unless Back already did).
      if (pushed && window.history.state?.[DIALOG_MARK]) {
        ignore.current++
        window.history.back()
      }
    }
  }, [open])

  // Stop the page behind the dialog from scrolling while it's open.
  useEffect(() => {
    if (!current) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [current])

  function finish(request: Request, value: boolean | string | null) {
    if (request.kind === 'confirm') request.resolve(value === true)
    else request.resolve(typeof value === 'string' ? value : null)
    setQueue((q) => q.filter((r) => r.id !== request.id))
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {/* key makes each dialog start fresh (empty input, focus reset) even when two are queued */}
      {current && <DialogView key={current.id} request={current} onDone={(value) => finish(current, value)} />}
    </DialogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

function DialogView({ request, onDone }: { request: Request; onDone: (value: boolean | string | null) => void }) {
  const isPrompt = request.kind === 'prompt'
  const [value, setValue] = useState(isPrompt ? request.initialValue ?? '' : '')
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  const danger = !!request.danger
  const missingRequired = isPrompt && !!request.required && value.trim() === ''

  // Move focus into the dialog, and hand it back to whatever opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const target = isPrompt ? inputRef.current : danger ? cancelRef.current : confirmRef.current
    target?.focus()
    return () => opener?.focus?.()
  }, [isPrompt, danger])

  function submit() {
    if (missingRequired) return
    onDone(isPrompt ? value.trim() : true)
  }

  function cancel() {
    onDone(isPrompt ? null : false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      cancel()
      return
    }
    // Enter confirms from a one-line field; in a multi-line box Ctrl/Cmd+Enter does.
    if (e.key === 'Enter' && isPrompt && e.target === inputRef.current) {
      const multiline = !!request.multiline
      if (!multiline || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        submit()
      }
      return
    }
    // Keep Tab inside the dialog.
    if (e.key === 'Tab' && panelRef.current) {
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea')
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role={danger ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.message ? messageId : undefined}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-sale">
              <AlertTriangle size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {request.title}
            </h2>
            {request.message && (
              <div id={messageId} className="mt-1.5 text-sm text-gray-600">
                {request.message}
              </div>
            )}
          </div>
        </div>

        {isPrompt && (
          <label className="mt-4 block text-sm font-medium text-gray-700">
            {request.label}
            {request.multiline ? (
              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.placeholder}
                maxLength={request.maxLength}
                rows={3}
                className={`${fieldClass} font-normal`}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.placeholder}
                maxLength={request.maxLength}
                className={`${fieldClass} font-normal`}
              />
            )}
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={submit}
            disabled={missingRequired}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              danger ? 'bg-sale hover:bg-red-700' : 'bg-brand hover:bg-brand-light'
            }`}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
