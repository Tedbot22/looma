// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureError, installGlobalErrorHandlers, setErrorReporter } from './errorReporting'

afterEach(() => setErrorReporter(() => {}))

describe('captureError', () => {
  it('passes the error and its context to the reporter', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)
    const error = new Error('boom')
    captureError(error, { page: '/shop' })
    expect(reporter).toHaveBeenCalledWith(error, { page: '/shop' })
  })

  it('never throws, even if the reporter itself fails', () => {
    setErrorReporter(() => {
      throw new Error('reporter is down')
    })
    expect(() => captureError(new Error('x'))).not.toThrow()
  })
})

describe('installGlobalErrorHandlers', () => {
  it('reports stray errors and unhandled promise failures, and can be switched off', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)
    const target = new EventTarget() as unknown as Window // a private target, so the test runner's own handlers stay out of it
    const remove = installGlobalErrorHandlers(target)

    const failure = new Error('in a click handler')
    target.dispatchEvent(new ErrorEvent('error', { error: failure, message: failure.message }))
    expect(reporter).toHaveBeenCalledWith(failure, { source: 'window.error' })

    const rejection = new Event('unhandledrejection') as Event & { reason: unknown }
    rejection.reason = new Error('nobody waited for this')
    target.dispatchEvent(rejection)
    expect(reporter).toHaveBeenLastCalledWith(rejection.reason, { source: 'unhandledrejection' })

    remove()
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('after removal') }))
    expect(reporter).toHaveBeenCalledTimes(2)
  })
})
