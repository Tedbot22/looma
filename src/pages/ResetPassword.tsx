import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, EyeOff, LinkIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MIN_LENGTH = 6 // same rule as signup
const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-11 text-sm outline-none focus:border-brand'

type State = 'checking' | 'ready' | 'invalid'

// Step 2 of resetting a password: the page the email link opens. The link logs the person in with a
// short-lived "recovery" session, and this page only lets them set a new password while that session exists.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [state, setState] = useState<State>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  // Read before the Supabase client tidies the address bar: did the person arrive from a reset link?
  const fromLink = useRef(
    /type=recovery/.test(window.location.hash) || /[?&]code=/.test(window.location.search)
  )
  // An expired or already-used link comes back with an error in the address.
  const linkError = useRef(/error_code=|error=access_denied/.test(window.location.hash))

  useEffect(() => {
    if (linkError.current) {
      setState('invalid')
      return
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState('ready')
    })

    // The event can fire before this page is on screen, so also check for the session directly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && fromLink.current) setState('ready')
    })

    // Nothing arrived: the link is missing, expired or was opened without its parameters.
    const giveUp = setTimeout(() => setState((s) => (s === 'checking' ? 'invalid' : s)), 4000)

    return () => {
      data.subscription.unsubscribe()
      clearTimeout(giveUp)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("The two passwords don't match.")
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      toast.error(
        /different|same/i.test(error.message)
          ? 'Your new password must be different from the old one.'
          : /weak|short|least/i.test(error.message)
            ? `Please choose a stronger password (at least ${MIN_LENGTH} characters).`
            : /session|jwt|expired/i.test(error.message)
              ? 'This reset link has expired. Please request a new one.'
              : "We couldn't change your password. Please try again."
      )
      return
    }

    // Log out anywhere else this account was signed in: whoever knew the old password loses access.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
    toast.success('Password changed. You are now logged in.')
    navigate('/', { replace: true })
  }

  if (state === 'checking') {
    return (
      <div className="mx-auto max-w-sm py-16 text-center text-sm text-gray-500" role="status">
        Checking your link…
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div className="mx-auto max-w-sm py-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <LinkIcon size={26} />
        </span>
        <h1 className="mt-4 text-2xl font-bold">This link isn't working</h1>
        <p className="mt-2 text-sm text-gray-600">
          Reset links work once and expire after a while. Request a new one and use it straight away.
        </p>
        <Link
          to="/forgot-password"
          className="mt-6 block w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light"
        >
          Get a new link
        </Link>
        <p className="mt-4 text-sm text-gray-500">
          <Link to="/login" className="font-medium text-brand underline">
            Back to log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-gray-500">Pick something you haven't used on this store before.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <div className="relative">
          <input
            className={inputClass}
            placeholder={`New password (min. ${MIN_LENGTH} characters)`}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-400 hover:text-gray-700"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <input
          className={inputClass}
          placeholder="Confirm new password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {confirm.length > 0 && password !== confirm && <p className="text-xs text-red-600">The two passwords don't match yet.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
