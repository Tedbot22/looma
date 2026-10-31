import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { formatNaira } from '../lib/format'
import { useCart } from '../context/CartContext'
import { useCartLines } from '../hooks/useCartLines'
import { useProfile } from '../hooks/useProfile'

const inputClass =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function Checkout() {
  const navigate = useNavigate()
  const { removeItems, loading } = useCart()
  const { lines, orderable, total, refetch } = useCartLines()

  // Pre-fill the phone number saved at signup.
  const { data: profile } = useProfile()

  // null = "the user hasn't typed yet", so we show the saved value. No effect needed.
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [method, setMethod] = useState<'on_delivery' | 'online'>('on_delivery')
  const [submitting, setSubmitting] = useState(false)

  const phone = phoneInput ?? profile?.phone ?? ''
  const soldOutCount = lines.length - orderable.length

  if (loading) return <p className="py-20 text-center text-gray-400">Loading…</p>

  if (orderable.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">
          {lines.length === 0 ? 'Your cart is empty.' : 'Nothing in your cart is available right now.'}
        </p>
        <Link to={lines.length === 0 ? '/shop' : '/cart'} className="mt-3 inline-block font-medium text-brand underline">
          {lines.length === 0 ? 'Back to shop' : 'Review your cart'}
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return // guards against double-clicks creating two orders
    setSubmitting(true)

    // Only available items are sent, at the quantity we can actually fulfil.
    const { data: orderId, error } = await supabase.rpc('place_order', {
      p_items: orderable.map((l) => ({ variant_id: l.variantId, quantity: l.effectiveQty })),
      p_payment_method: method,
      p_address: address.trim(),
      p_phone: phone.trim(),
    })

    if (error) {
      // Someone else bought it between page load and now. The database rolled the whole
      // order back, so nothing was charged. Re-check stock: the item greys out in the
      // summary and the customer can simply place the order again for the rest.
      if (error.message.includes('OUT_OF_STOCK') || error.message.includes('UNAVAILABLE')) {
        await refetch()
        toast.error(
          'An item just sold out. We updated your order summary: please review it and place your order again.'
        )
      } else {
        toast.error('Something went wrong placing your order. Please try again.')
      }
      setSubmitting(false)
      return
    }

    // Remove only what was ordered. Sold-out items stay in the cart, greyed out.
    navigate(`/order/${orderId}`, { replace: true })
    removeItems(orderable.map((l) => l.variantId))
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-5">
      <form onSubmit={handleSubmit} className="space-y-5 md:col-span-3">
        <h1 className="text-2xl font-bold">Checkout</h1>

        <section className="space-y-3">
          <h2 className="font-semibold">Delivery details</h2>
          <textarea
            className={inputClass}
            placeholder="Delivery address (hostel/room, street, landmark)"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
          <input
            className={inputClass}
            placeholder="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhoneInput(e.target.value)}
            required
          />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Payment</h2>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              method === 'on_delivery' ? 'border-brand' : 'border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="method"
              className="mt-1"
              checked={method === 'on_delivery'}
              onChange={() => setMethod('on_delivery')}
            />
            <span>
              <span className="block font-medium">Pay on delivery</span>
              <span className="text-sm text-gray-500">Pay when your order arrives.</span>
            </span>
          </label>

          <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-gray-100 p-3 opacity-60">
            <input type="radio" name="method" className="mt-1" disabled />
            <span>
              <span className="block font-medium">Pay online (card / transfer)</span>
              <span className="text-sm text-gray-500">Coming soon.</span>
            </span>
          </label>
        </section>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {submitting ? 'Placing order…' : `Place order · ${formatNaira(total)}`}
        </button>
      </form>

      {/* Order summary: available items only */}
      <aside className="h-fit rounded-xl bg-gray-50 p-5 md:col-span-2">
        <h2 className="mb-3 font-semibold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {orderable.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span className="text-gray-600">
                {l.name} <span className="text-gray-400">({l.variantLabel})</span> × {l.effectiveQty}
              </span>
              <span className="shrink-0 font-medium">{formatNaira(l.price * l.effectiveQty)}</span>
            </li>
          ))}
        </ul>

        {soldOutCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {soldOutCount} sold-out {soldOutCount === 1 ? 'item is' : 'items are'} not included and
            will stay in your cart.{' '}
            <Link to="/cart" className="font-medium underline">
              View cart
            </Link>
          </p>
        )}

        <div className="mt-4 flex justify-between border-t border-gray-200 pt-3 font-semibold">
          <span>Total</span>
          <span>{formatNaira(total)}</span>
        </div>
      </aside>
    </div>
  )
}
