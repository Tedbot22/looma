import { useState, type FormEvent } from 'react'
import { CheckoutSkeleton } from '../components/Skeleton'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Home } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { formatNaira } from '../lib/format'
import { startPayment } from '../lib/payments'
import { formatKm, requestQuote, type Quote } from '../lib/delivery'
import { couponDiscount, couponStatus, describeCoupon } from '../lib/coupons'
import { useCart } from '../context/CartContext'
import { useCartLines } from '../hooks/useCartLines'
import { useProfile } from '../hooks/useProfile'
import { useAddressActions, useAddresses, type AddressValues } from '../hooks/useAddresses'
import { useDeliveryZones } from '../hooks/useDeliveryZones'
import { useCoupons } from '../hooks/useCoupons'
import HomeDeliveryDialog from '../components/HomeDeliveryDialog'

const inputClass =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function Checkout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { removeItems, loading } = useCart()
  const { lines, orderable, total, refetch } = useCartLines()
  const { data: profile } = useProfile()
  const { data: addresses = [], isLoading: addressesLoading } = useAddresses()
  const { data: zones = [], isLoading: zonesLoading } = useDeliveryZones()
  const addressActions = useAddressActions()
  const { data: coupons = [] } = useCoupons()

  // null = "the customer hasn't chosen yet", so we fall back to sensible defaults. No effects needed.
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  // What is selected: "campus:<option id>" or "address:<saved address id>"
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [method, setMethod] = useState<'on_delivery' | 'online'>('on_delivery')
  // null = "the customer hasn't chosen", so we apply their best voucher. 'none' = they chose no voucher.
  const [couponChoice, setCouponChoice] = useState<string | null>(null)
  // The voucher code box: what is typed, and the message shown under it.
  const [codeInput, setCodeInput] = useState('')
  const [codeMessage, setCodeMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const phone = phoneInput ?? profile?.phone ?? ''
  const soldOutCount = lines.length - orderable.length

  // ----- The delivery menu -----
  const campusOptions = zones.filter((z) => z.kind === 'campus')
  const homeOptions = zones.filter((z) => z.kind === 'home')
  // Saved addresses on a home option that is still switched on.
  const usable = addresses.filter((a) => a.delivery_zones?.kind === 'home')
  const defaultAddress = usable.find((a) => a.is_default) ?? usable[0]

  // Only a saved default is pre-selected. Otherwise the customer picks, so the fee is never a surprise.
  const activeKey = selectedKey ?? (defaultAddress ? `address:${defaultAddress.id}` : null)
  const [selectedType, selectedId] = activeKey ? [activeKey.split(':')[0], activeKey.slice(activeKey.indexOf(':') + 1)] : ['', '']

  const savedAddress = selectedType === 'address' ? (usable.find((a) => a.id === selectedId) ?? null) : null
  const campus = selectedType === 'campus' ? (campusOptions.find((z) => z.id === selectedId) ?? null) : null
  const zone = savedAddress ? savedAddress.delivery_zones : campus

  // A home address is priced by distance. The SERVER measures the route and works out the fee,
  // and saves it as a "quote". We ask for one whenever a saved address is selected.
  const quoteKey = ['delivery-quote', savedAddress?.id, savedAddress?.latitude, savedAddress?.longitude, savedAddress?.note]
  const quoteQuery = useQuery({
    queryKey: quoteKey,
    enabled: !!savedAddress,
    queryFn: () =>
      requestQuote({
        lat: Number(savedAddress!.latitude),
        lon: Number(savedAddress!.longitude),
        address: savedAddress!.details,
        note: savedAddress!.note ?? '',
      }),
    staleTime: 15 * 60_000, // a quote lasts 30 minutes, so reuse it for a while
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false, // every quote costs a routing request: don't repeat them needlessly
    retry: false,
  })
  const quote = savedAddress ? (quoteQuery.data ?? null) : null

  // A campus has a flat fee. A home address has to wait for its quote.
  const locationReady = campus ? true : !!(savedAddress && quote)
  const fee = campus ? campus.fee : (quote?.fee ?? 0)

  // ----- Vouchers -----
  // The preview below uses the same rules as the database. The database does its own
  // calculation when the order is placed and is the one that counts.
  const maxUnitPrice = Math.max(0, ...orderable.map((l) => l.price))
  const voucherOptions = coupons
    .filter((c) => couponStatus(c) === 'active')
    .map((c) => {
      const eligible = total >= c.min_order
      return { coupon: c, eligible, discount: eligible ? couponDiscount(c, { subtotal: total, deliveryFee: fee, maxUnitPrice }) : 0 }
    })
  const bestVoucher = voucherOptions.filter((o) => o.eligible).sort((a, b) => b.discount - a.discount)[0] ?? null
  const chosenVoucher =
    couponChoice === 'none'
      ? null
      : couponChoice
        ? (voucherOptions.find((o) => o.coupon.id === couponChoice && o.eligible) ?? null)
        : bestVoucher
  const discount = chosenVoucher?.discount ?? 0
  const grandTotal = Math.max(0, total + fee - discount) // the server recomputes this itself; this is for display

  if (loading || addressesLoading || zonesLoading) {
    return <CheckoutSkeleton />
  }

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

  // Apply a voucher by its code. We only look among the customer's OWN vouchers (already loaded),
  // so a code can never be used to discover or claim someone else's voucher.
  function applyCode() {
    const code = codeInput.trim().toUpperCase()
    if (!code) {
      setCodeMessage({ type: 'error', text: 'Enter a voucher code.' })
      return
    }

    const match = coupons.find((c) => c.code.toUpperCase() === code)
    if (!match) {
      setCodeMessage({ type: 'error', text: "That code isn't one of your vouchers. Check it and try again." })
      return
    }

    const status = couponStatus(match)
    if (status === 'used') {
      setCodeMessage({ type: 'error', text: 'That voucher has already been used.' })
    } else if (status === 'expired') {
      const when = new Date(match.expires_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })
      setCodeMessage({ type: 'error', text: `That voucher expired on ${when}.` })
    } else if (total < match.min_order) {
      setCodeMessage({ type: 'error', text: `Spend ${formatNaira(match.min_order - total)} more to use this voucher.` })
    } else {
      setCouponChoice(match.id)
      setCodeInput('')
      setCodeMessage({ type: 'ok', text: `Applied: ${describeCoupon(match)}` })
    }
  }

  // Called by the dialog: save the address to the profile, then select it in the menu.
  async function saveHomeAddress(values: AddressValues, previewQuote: Quote) {
    const id = await addressActions.add(values)
    // The dialog already priced this address, so reuse that quote instead of paying for another.
    queryClient.setQueryData(['delivery-quote', id, values.latitude, values.longitude, values.note?.trim() || null], previewQuote)
    setSelectedKey(`address:${id}`)
    setDialogOpen(false)
    toast.success('Address saved to your profile')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return // guards against double-clicks creating two orders
    if (!zone) {
      toast.error('Please choose how you want your order delivered.')
      return
    }
    setSubmitting(true)

    // Home delivery: make sure the price quote is still valid (they're good for 30 minutes).
    let quoteId: string | null = null
    if (savedAddress) {
      let q = quote
      if (!q || new Date(q.expires_at).getTime() - Date.now() < 3 * 60_000) {
        try {
          q = await requestQuote({
            lat: Number(savedAddress.latitude),
            lon: Number(savedAddress.longitude),
            address: savedAddress.details,
            note: savedAddress.note ?? '',
          })
        } catch (err) {
          toast.error((err as Error).message)
          setSubmitting(false)
          return
        }
        queryClient.setQueryData(quoteKey, q)
        // If the price moved while they were deciding, show them before charging anything.
        if (q.fee !== fee) {
          toast.error(`The delivery fee is now ${formatNaira(q.fee)}. Please check your total and try again.`)
          setSubmitting(false)
          return
        }
      }
      quoteId = q.quote_id
    }

    // Only available items are sent, at the quantity we can actually fulfil.
    // We send the delivery option and, for home delivery, the id of the server's price quote.
    // The fee itself and the address come from that saved quote, never from the browser.
    const { data: orderId, error } = await supabase.rpc('place_order', {
      p_items: orderable.map((l) => ({ variant_id: l.variantId, quantity: l.effectiveQty })),
      p_payment_method: method,
      p_zone_id: zone.id,
      p_phone: phone.trim(),
      p_coupon_id: chosenVoucher?.coupon.id ?? null,
      p_quote_id: quoteId,
    })

    if (error) {
      // The database rolled the WHOLE order back, so nothing was charged.
      if (error.message.includes('OUT_OF_STOCK') || error.message.includes('UNAVAILABLE')) {
        await refetch() // the sold-out item greys out in the summary
        toast.error(
          'An item just sold out. We updated your order summary: please review it and place your order again.'
        )
      } else if (error.message.includes('COUPON_')) {
        // Used elsewhere, expired while they were deciding, or the order no longer meets the minimum.
        await queryClient.invalidateQueries({ queryKey: ['coupons'] })
        setCouponChoice('none')
        toast.error("That voucher can't be used on this order any more. Check your vouchers and try again.")
      } else if (error.message.includes('QUOTE_')) {
        await queryClient.invalidateQueries({ queryKey: ['delivery-quote'] })
        toast.error('The delivery price expired. Please check the total and place your order again.')
      } else if (error.message.includes('INVALID_ZONE')) {
        await queryClient.invalidateQueries({ queryKey: ['delivery-zones'] })
        await queryClient.invalidateQueries({ queryKey: ['addresses'] })
        toast.error("That delivery option isn't available right now. Please choose another.")
      } else {
        toast.error('Something went wrong placing your order. Please try again.')
      }
      setSubmitting(false)
      return
    }

    // Online payment: get the Paystack page ready BEFORE touching the cart.
    // (If this fails the order still exists; the order page has a "Pay now" button to retry.)
    let paymentUrl: string | null = null
    if (method === 'online') {
      try {
        paymentUrl = await startPayment(orderId as string)
      } catch (err) {
        toast.error(`${(err as Error).message} You can try again from your order page.`)
      }
    }

    // Online payment: the items STAY in the cart while the customer is on Paystack. They are removed
    // from the order page once the payment is confirmed (see OrderConfirmation), so a customer who
    // backs out of Paystack, or whose link fails to load, never loses their cart.
    if (paymentUrl) {
      window.location.href = paymentUrl // hand over to Paystack
      return
    }

    // Pay on delivery or pick-up: the order is final, so remove only what was ordered.
    // Sold-out items stay in the cart, greyed out.
    if (method !== 'online') removeItems(orderable.map((l) => l.variantId))
    navigate(`/order/${orderId}`, { replace: true, state: { justOrdered: true } })
  }

  const radioCard = (selected: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected ? 'border-brand' : 'border-gray-200'}`

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-5">
      <form onSubmit={handleSubmit} className="space-y-6 md:col-span-3">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {/* Delivery */}
        <section className="space-y-3">
          <h2 className="font-semibold">Delivery</h2>

          {campusOptions.length === 0 && homeOptions.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              We aren't delivering anywhere right now. Please check back soon.
            </p>
          )}

          {/* Ready-made delivery points: no address needed */}
          {campusOptions.map((z) => (
            <label key={z.id} className={radioCard(activeKey === `campus:${z.id}`)}>
              <input
                type="radio"
                name="delivery"
                className="mt-1"
                checked={activeKey === `campus:${z.id}`}
                onChange={() => setSelectedKey(`campus:${z.id}`)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{z.name}</span>
                <span className="text-xs text-gray-500">Campus delivery · {formatNaira(z.fee)}</span>
              </span>
            </label>
          ))}

          {/* The customer's saved home addresses */}
          {usable.map((a) => (
            <label key={a.id} className={radioCard(activeKey === `address:${a.id}`)}>
              <input
                type="radio"
                name="delivery"
                className="mt-1"
                checked={activeKey === `address:${a.id}`}
                onChange={() => setSelectedKey(`address:${a.id}`)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  Home delivery
                  {a.is_default && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                      Default
                    </span>
                  )}
                </span>
                <span className="block text-sm text-gray-600">{a.details}</span>
                {a.note && <span className="block text-xs text-gray-500">{a.note}</span>}
                <span className="text-xs text-gray-500">
                  {activeKey !== `address:${a.id}`
                    ? 'Fee based on distance'
                    : quoteQuery.isFetching
                      ? 'Calculating your delivery fee…'
                      : quote
                        ? `${formatKm(quote.distance_m)} · ${formatNaira(quote.fee)}`
                        : null}
                </span>
                {activeKey === `address:${a.id}` && quoteQuery.isError && (
                  <span className="mt-1 block text-xs text-red-600">
                    {(quoteQuery.error as Error).message}{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        quoteQuery.refetch()
                      }}
                      className="font-medium underline"
                    >
                      Try again
                    </button>
                  </span>
                )}
              </span>
            </label>
          ))}

          {/* Choosing this opens the address box */}
          {homeOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="flex w-full items-start gap-3 rounded-lg border-2 border-dashed border-gray-300 p-3 text-left hover:border-brand"
            >
              <Home size={18} className="mt-0.5 shrink-0 text-gray-500" />
              <span>
                <span className="block font-medium">{usable.length > 0 ? 'Home delivery to a new address' : 'Home delivery'}</span>
                <span className="text-xs text-gray-500">Enter your address · fee based on distance</span>
              </span>
            </button>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Contact</h2>
          <input
            className={inputClass}
            placeholder="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhoneInput(e.target.value)}
            required
          />
          <p className="text-xs text-gray-400">We'll call or message this number about your delivery.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Voucher</h2>

          <div className="flex gap-2">
            <input
              className={`${inputClass} uppercase placeholder:normal-case`}
              placeholder="Enter voucher code"
              value={codeInput}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => {
                setCodeInput(e.target.value)
                setCodeMessage(null)
              }}
              // Pressing Enter here applies the code. Without this it would place the order.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyCode()
                }
              }}
            />
            <button
              type="button"
              onClick={applyCode}
              className="shrink-0 rounded-lg border border-brand px-5 text-sm font-semibold text-brand hover:bg-gray-50"
            >
              Apply
            </button>
          </div>
          {codeMessage && (
            <p className={`text-sm ${codeMessage.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{codeMessage.text}</p>
          )}

          {voucherOptions.length > 0 && (
            <>
            {voucherOptions.map(({ coupon, eligible, discount: saves }) => (
              <label
                key={coupon.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  !eligible ? 'cursor-not-allowed border-gray-100 opacity-60' : 'cursor-pointer'
                } ${chosenVoucher?.coupon.id === coupon.id ? 'border-brand' : 'border-gray-200'}`}
              >
                <input
                  type="radio"
                  name="voucher"
                  className="mt-1"
                  disabled={!eligible}
                  checked={chosenVoucher?.coupon.id === coupon.id}
                  onChange={() => setCouponChoice(coupon.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{describeCoupon(coupon)}</span>
                  <span className="text-xs text-gray-500">
                    {eligible
                      ? saves > 0
                        ? `Saves you ${formatNaira(saves)} on this order`
                        : 'Nothing to take off this order'
                      : `Spend ${formatNaira(coupon.min_order - total)} more to use this`}
                  </span>
                </span>
              </label>
            ))}

            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${!chosenVoucher ? 'border-brand' : 'border-gray-200'}`}>
              <input type="radio" name="voucher" checked={!chosenVoucher} onChange={() => setCouponChoice('none')} />
              <span className="text-sm font-medium">Don't use a voucher</span>
            </label>
            </>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Payment</h2>

          <label className={radioCard(method === 'on_delivery')}>
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

          <label className={radioCard(method === 'online')}>
            <input
              type="radio"
              name="method"
              className="mt-1"
              checked={method === 'online'}
              onChange={() => setMethod('online')}
            />
            <span>
              <span className="block font-medium">Pay online (card / bank transfer)</span>
              <span className="text-sm text-gray-500">
                Secure payment by Paystack. Your items are reserved while you pay.
              </span>
            </span>
          </label>
        </section>

        <button
          type="submit"
          disabled={submitting || !locationReady}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {submitting
            ? 'Placing order…'
            : method === 'online'
              ? `Pay ${formatNaira(grandTotal)}`
              : `Place order · ${formatNaira(grandTotal)}`}
        </button>
        {!locationReady && <p className="-mt-3 text-center text-xs text-gray-400">Choose a delivery option to continue.</p>}
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

        <dl className="mt-4 space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Subtotal</dt>
            <dd>{formatNaira(total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Delivery{zone ? ` (${zone.name})` : ''}</dt>
            <dd>{!zone ? 'Choose an option' : savedAddress && !quote ? (quoteQuery.isFetching ? 'Calculating…' : '–') : formatNaira(fee)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-700">
              <dt>Voucher</dt>
              <dd>-{formatNaira(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatNaira(grandTotal)}</dd>
          </div>
        </dl>
      </aside>

      {dialogOpen && homeOptions[0] && (
        <HomeDeliveryDialog zone={homeOptions[0]} onSave={saveHomeAddress} onCancel={() => setDialogOpen(false)} />
      )}
    </div>
  )
}
