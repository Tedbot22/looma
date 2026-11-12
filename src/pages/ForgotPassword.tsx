import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

const RESEND_SECONDS = 60

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand'

// Step 1 of resetting a password: ask for the email, and send a link to /reset-password.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  // Count down before another email can be requested (stops accidental repeat sends).
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(address: string) {
    setSending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSending(false)

    // We say the same thing whether or not the email has an account, so nobody can use this form
    // to find out who is registered. Only real problems (too many requests, no connection) are shown.
    if (error && (error.status === 429 || /rate|limit|seconds/i.test(error.message))) {
      toast.error('Too many requests. Please wait a minute and try again.')
      return
    }
    if (error && /fetch|network/i.test(error.message)) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    setSentTo(address)
    setWait(RESEND_SECONDS)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void send(email.trim())
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-sm py-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          <MailCheck size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-gray-600">
          If there's an account for <span className="font-medium text-gray-900">{sentTo}</span>, we've sent a link to reset your password. It can take a
          minute to arrive, so check your spam folder too.
        </p>
        <button
          type="button"
          disabled={wait > 0 || sending}
          onClick={() => void send(sentTo)}
          className="mt-6 w-full rounded-lg border border-gray-300 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
        >
          {sending ? 'Sending…' : wait > 0 ? `Send again in ${wait}s` : 'Send the email again'}
        </button>
        <p className="mt-4 text-sm text-gray-500">
          <button type="button" onClick={() => setSentTo(null)} className="font-medium text-brand underline">
            Use a different email
          </button>
          {' · '}
          <Link to="/login" className="font-medium text-brand underline">
            Back to log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-gray-500">Enter your email and we'll send you a link to choose a new one.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          className={inputClass}
          placeholder="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-brand underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
