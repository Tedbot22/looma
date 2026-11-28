// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as jobsApi from '../../api/jobs'
import * as pushApi from '../../api/push'
import type { JobOverview } from '../../api/jobs'
import AdminJobs from './AdminJobs'

const dialog = vi.hoisted(() => ({ confirm: vi.fn(async (_options: { title: string; message: string }) => true) }))
vi.mock('../../context/DialogContext', () => ({ useDialog: () => dialog }))
vi.mock('../../api/jobs', () => ({ fetchJobOverview: vi.fn(), requeueJob: vi.fn(), cancelJob: vi.fn() }))
vi.mock('../../api/push', () => ({ savePushSettings: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const api = vi.mocked(jobsApi)
const push = vi.mocked(pushApi)

const overview = (over: Partial<JobOverview> = {}): JobOverview => ({
  enabled: true,
  counts: [
    { kind: 'push.customer', status: 'queued', n: 4 },
    { kind: 'push.customer', status: 'succeeded', n: 30 },
    { kind: 'push.customer', status: 'dead', n: 1 },
  ],
  oldest_waiting_seconds: 30,
  dead: [{ id: 77, kind: 'push.customer', sub_kind: 'cart_1', attempts: 5, last_error: 'Push rejected: 401: VAPID key mismatch', finished_at: '2026-06-01T10:00:00Z' }],
  ...over,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return render(<AdminJobs />, { wrapper })
}

beforeEach(() => {
  api.fetchJobOverview.mockResolvedValue(overview())
  api.requeueJob.mockResolvedValue(true)
  push.savePushSettings.mockResolvedValue()
  dialog.confirm.mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Reminder system page', () => {
  it('shows the totals, and each reminder that gave up with the reason', async () => {
    renderPage()
    expect(await screen.findByText('Reliable sending is on')).toBeTruthy()
    expect(screen.getByText('Waiting to send').previousSibling?.textContent).toBe('4')
    expect(screen.getByText('Gave up').previousSibling?.textContent).toBe('1')
    expect(screen.getByText('Cart reminder (first)')).toBeTruthy()
    expect(screen.getByText('Push rejected: 401: VAPID key mismatch')).toBeTruthy()
    expect(screen.getByText(/tried 5 times/)).toBeTruthy()
  })

  it('says so, cheerfully, when nothing has failed', async () => {
    api.fetchJobOverview.mockResolvedValue(overview({ dead: [], counts: [{ kind: 'push.customer', status: 'succeeded', n: 9 }] }))
    renderPage()
    expect(await screen.findByText(/Nothing has failed/)).toBeTruthy()
  })

  it('gives a failed reminder another go, and refreshes', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.requeueJob).toHaveBeenCalledWith(77))
    await waitFor(() => expect(api.fetchJobOverview).toHaveBeenCalledTimes(2)) // reloaded after the change
  })

  it('warns when the longest-waiting reminder has waited too long, naming how long', async () => {
    api.fetchJobOverview.mockResolvedValue(overview({ oldest_waiting_seconds: 40 * 60 }))
    renderPage()
    expect(await screen.findByText(/waiting 40 minutes/)).toBeTruthy()
    expect(screen.getByText(/timer .* may have stopped/s)).toBeTruthy()
  })

  it('does not warn about waiting when the queue is off (nothing is meant to be working through it)', async () => {
    api.fetchJobOverview.mockResolvedValue(overview({ enabled: false, oldest_waiting_seconds: 3 * 3600 }))
    renderPage()
    expect(await screen.findByText('Reliable sending is off')).toBeTruthy()
    expect(screen.queryByText(/may have stopped/)).toBeNull()
  })

  it('turns the queue on only after the owner confirms, and tells them what it means', async () => {
    api.fetchJobOverview.mockResolvedValue(overview({ enabled: false, counts: [], dead: [], oldest_waiting_seconds: null }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(dialog.confirm).toHaveBeenCalled())
    expect(dialog.confirm.mock.calls[0][0]).toMatchObject({ title: 'Turn on reliable sending?', message: expect.stringContaining('retried automatically') })
    await waitFor(() => expect(push.savePushSettings).toHaveBeenCalledWith({ queue_enabled: true }))
  })

  it('does nothing if the owner cancels the confirmation', async () => {
    dialog.confirm.mockResolvedValue(false)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Switch back' }))
    await waitFor(() => expect(dialog.confirm).toHaveBeenCalled())
    expect(push.savePushSettings).not.toHaveBeenCalled()
  })

  it('switches back to the old sender when asked, warning that waiting reminders will not be sent', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Switch back' }))
    await waitFor(() => expect(push.savePushSettings).toHaveBeenCalledWith({ queue_enabled: false }))
    expect(dialog.confirm.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining('will not be sent') })
  })

  it('shows the database’s refusal instead of a blank page (for example, someone who is not the owner)', async () => {
    api.fetchJobOverview.mockRejectedValue({ message: 'NOT_ADMIN' })
    renderPage()
    expect(await screen.findByText(/Couldn't load: NOT_ADMIN/)).toBeTruthy()
  })
})
