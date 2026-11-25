// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'
import { isStaleVersionError } from '../lib/staleVersion'
import { setErrorReporter } from '../lib/errorReporting'

afterEach(cleanup)

// React prints caught render errors to the console; keep the test output readable.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.clear()
})

function Bomb({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message)
}

describe('ErrorBoundary', () => {
  it('shows the page normally when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('replaces a crashed page with a friendly message and reports the error once', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    expect(screen.getByRole('link', { name: /go to the shop/i }).getAttribute('href')).toBe('/shop')
    expect(reporter).toHaveBeenCalledTimes(1)
    expect(reporter.mock.calls[0][0]).toMatchObject({ message: 'kaboom' })
    setErrorReporter(() => {})
  })

  it('lets the customer try again once the problem has passed', () => {
    let broken = true
    function Flaky() {
      if (broken) throw new Error('temporary')
      return <p>Recovered</p>
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    broken = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByText('Recovered')).toBeTruthy()
  })

  it('clears the error when the reset key changes (moving to another page)', () => {
    function Harness() {
      const [page, setPage] = useState('/broken')
      return (
        <>
          <button onClick={() => setPage('/fine')}>go</button>
          <ErrorBoundary resetKey={page}>{page === '/broken' ? <Bomb /> : <p>Fine page</p>}</ErrorBoundary>
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByText('Fine page')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('treats a page that failed to load after an update as "reload", and reloads by itself once', () => {
    const onReload = vi.fn()
    const stale = 'Failed to fetch dynamically imported module: https://looma.app/assets/Shop-abc123.js'
    const { unmount } = render(
      <ErrorBoundary onReload={onReload}>
        <Bomb message={stale} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert').textContent).toContain('just been updated')
    expect(onReload).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /reload page/i }))
    expect(onReload).toHaveBeenCalledTimes(2) // the button always works

    // The same failure right away must not trigger another automatic reload (no reload loop).
    unmount()
    render(
      <ErrorBoundary onReload={onReload}>
        <Bomb message={stale} />
      </ErrorBoundary>
    )
    expect(onReload).toHaveBeenCalledTimes(2)
  })
})

describe('isStaleVersionError', () => {
  it('recognises the messages browsers give for a missing page file', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: /assets/x.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
    ]) {
      expect(isStaleVersionError(new Error(message)), message).toBe(true)
    }
  })

  it('does not mistake ordinary errors for it', () => {
    expect(isStaleVersionError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleVersionError('Failed to fetch dynamically imported module')).toBe(false) // not an Error object
    expect(isStaleVersionError(null)).toBe(false)
  })
})
