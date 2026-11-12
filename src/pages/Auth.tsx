import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { REFERRAL_KEY } from '../config'

// Only allow redirects to pages inside our own site ("/checkout"),
// never "https://evil.com" or "//evil.com" (an "open redirect" vulnerability).
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function savedReferral(): string {
  try {
    return localStorage.getItem(REFERRAL_KEY) ?? ''
  } catch {
    return ''
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const next = safeNext(params.get('next'))

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState(savedReferral)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Already logged in? Skip this page.
  if (user) return <Navigate to={next} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isSignup && !acceptedTerms) {
      toast.error('Please accept the Terms and Conditions to create an account.')
      return
    }
    setSubmitting(true)

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // The handle_new_user database trigger reads these to create the profile
            // and link the referrer.
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
              referral_code: referralCode.trim().toUpperCase(),
              terms_accepted_at: new Date().toISOString(), // a record of when they agreed
            },
          },
        })
        if (error) throw error

        if (data.session) {
          toast.success('Account created!')
          navigate(next, { replace: true })
        } else {
          // Email confirmation is switched on in Supabase.
          toast.success('Check your email to confirm your account, then log in.')
          navigate('/login', { replace: true })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate(next, { replace: true })
      }
    } catch (err) {
      const message = (err as Error).message
      // Deactivated accounts are blocked from signing in (see supabase/phase10_deactivate_account.sql).
      toast.error(/banned/i.test(message) ? 'This account has been deactivated. Contact us if you would like it reactivated.' : message)
    } finally {
      setSubmitting(false)
    }
  }

  // Keep the ?next= part when switching between login and signup.
  const switchLink = `${isSignup ? '/login' : '/signup'}${
    params.get('next') ? `?next=${encodeURIComponent(next)}` : ''
  }`

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {isSignup ? 'Sign up to place orders and earn rewards.' : 'Log in to continue.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        {isSignup && (
          <>
            <input
              className={inputClass}
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </>
        )}

        <input
          className={inputClass}
          placeholder="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputClass}
          placeholder="Password (min. 6 characters)"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {isSignup && (
          <input
            className={`${inputClass} uppercase`}
            placeholder="Referral code (optional)"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
        )}

        {isSignup && (
          <label className="flex items-start gap-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" target="_blank" className="font-medium text-brand underline">
                Terms and Conditions
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-brand underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <Link to={switchLink} className="font-medium text-brand underline">
          {isSignup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </div>
  )
}
