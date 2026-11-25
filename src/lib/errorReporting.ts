// One place that hears about every error the store catches, so reporting can be plugged in later
// without touching the pages. Today it writes to the browser console. To send errors to a service such
// as Sentry, call setErrorReporter() once at start-up with a function that forwards them there.

export type ErrorContext = Record<string, unknown>
export type ErrorReporter = (error: unknown, context?: ErrorContext) => void

const consoleReporter: ErrorReporter = (error, context) => {
  console.error('[looma]', error, context ?? '')
}

let reporter: ErrorReporter = consoleReporter

export function setErrorReporter(next: ErrorReporter) {
  reporter = next
}

// Reporting must never be the thing that breaks the page, so a failing reporter is ignored.
export function captureError(error: unknown, context?: ErrorContext) {
  try {
    reporter(error, context)
  } catch {
    /* ignore */
  }
}

// Catches what error boundaries can't see: mistakes inside event handlers and promises nobody waited for.
// Returns a function that removes the listeners again.
export function installGlobalErrorHandlers(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
): () => void {
  const onError = (event: ErrorEvent) => captureError(event.error ?? event.message, { source: 'window.error' })
  const onRejection = (event: PromiseRejectionEvent) =>
    captureError(event.reason, { source: 'unhandledrejection' })
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
