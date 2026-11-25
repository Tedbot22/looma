import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/errorReporting'
import { isStaleVersionError, reloadOnce } from '../lib/staleVersion'

interface Props {
  children: ReactNode
  // 'page' sits inside the store layout (the header and footer stay on screen). 'app' fills the screen.
  variant?: 'page' | 'app'
  // When this changes (for example the address), a shown error is cleared and the children are tried again.
  resetKey?: string
  onReload?: () => void
}

interface State {
  error: Error | null
  resetKey: string | undefined // the reset key the current state was last cleared for
}

// Catches a crash in anything below it and shows a friendly message instead of a blank white page.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  // A new reset key (for example moving to another page) clears a shown error so the children are tried again.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack, variant: this.props.variant ?? 'page' })
    if (isStaleVersionError(error)) reloadOnce(this.props.onReload ?? (() => window.location.reload()))
  }

  private reload = () => (this.props.onReload ?? (() => window.location.reload()))()

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isStaleVersionError(error)
    const size = this.props.variant === 'app' ? 'min-h-screen' : 'min-h-[40vh]'

    return (
      <div role="alert" className={`${size} flex flex-col items-center justify-center px-6 py-16 text-center`}>
        <h1 className="text-xl font-semibold text-gray-900">
          {stale ? 'Looma has just been updated' : 'Something went wrong'}
        </h1>
        <p className="mt-2 max-w-md text-sm text-gray-600">
          {stale
            ? 'Please reload the page to get the latest version.'
            : "We've noted the problem. You can try again, or head back to the shop."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {stale ? (
            <button type="button" onClick={this.reload} className="rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white">
              Reload page
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white"
              >
                Try again
              </button>
              <a href="/shop" className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700">
                Go to the shop
              </a>
            </>
          )}
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-8 max-w-full overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-700">
            {error.stack ?? error.message}
          </pre>
        )}
      </div>
    )
  }
}
