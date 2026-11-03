// Prices a delivery. The fee is worked out HERE, on the server, from the settings the owner
// entered in the admin and the real driving distance, never from anything the browser claims.
//
//   fee = round( BASE_FEE + COST_PER_KM x distanceKm , to ROUND_TO )
//
// The result is saved as a "quote". Checkout then sends only the quote's id to place_order.
//
// Deploy:  npx supabase functions deploy delivery-quote --no-verify-jwt
// Secret:  npx supabase secrets set GEOAPIFY_API_KEY=your-server-key
// @ts-nocheck
import { admin, corsHeaders, getUserFromRequest, json } from '../_shared/paystack.ts'

const QUOTE_VALID_MINUTES = 30
const MAX_QUOTES_PER_MINUTE = 20 // each quote costs a routing request, so don't let one account run up the bill

// A setting that is empty or not a number counts as "not set up yet".
const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? NaN : Number(v))

// Rounds to the nearest multiple, e.g. 837.5 with a step of 50 -> 850.
const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : Math.round(value))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)

  const body = await req.json().catch(() => ({}))
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  const address = String(body.address ?? '').trim()
  const note = String(body.note ?? '').trim().slice(0, 300)

  if (!address || Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'Please pick your address from the suggestions.' }, 400)
  }

  // ----- the owner's pricing settings -----
  const { data: rows } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'delivery_origin_lat',
      'delivery_origin_lon',
      'delivery_base_fee',
      'delivery_cost_per_km',
      'delivery_round_to',
    ])
  const s = Object.fromEntries((rows ?? []).map((r) => [r.key as string, r.value as string]))

  const originLat = num(s.delivery_origin_lat)
  const originLon = num(s.delivery_origin_lon)
  const baseFee = num(s.delivery_base_fee)
  const costPerKm = num(s.delivery_cost_per_km)
  const step = num(s.delivery_round_to)

  if ([originLat, originLon, baseFee, costPerKm].some(Number.isNaN)) {
    console.error('Delivery pricing is not fully set up in Admin > Delivery.')
    return json({ error: "Home delivery isn't available right now. Please choose another option." }, 503)
  }

  // ----- a simple brake on how often one customer can ask -----
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin
    .from('delivery_quotes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= MAX_QUOTES_PER_MINUTE) {
    return json({ error: 'Too many requests. Please wait a moment and try again.' }, 429)
  }

  // ----- the real driving distance from the store to the customer (Geoapify routing) -----
  // Geoapify wants waypoints as "lat,lon|lat,lon".
  const key = Deno.env.get('GEOAPIFY_API_KEY')
  if (!key) {
    console.error('GEOAPIFY_API_KEY secret is missing.')
    return json({ error: 'Delivery pricing is temporarily unavailable.' }, 503)
  }

  const url =
    `https://api.geoapify.com/v1/routing?waypoints=${originLat},${originLon}|${lat},${lon}` +
    `&mode=drive&apiKey=${key}`
  const res = await fetch(url).catch(() => null)
  if (!res || !res.ok) {
    console.error('Geoapify routing failed:', res?.status, await res?.text().catch(() => ''))
    return json({ error: "We couldn't measure the distance right now. Please try again." }, 502)
  }

  const route = await res.json().catch(() => null)
  const meters = route?.features?.[0]?.properties?.distance
  if (typeof meters !== 'number') {
    return json({ error: "We couldn't find a driving route to that address. Please choose another." }, 422)
  }

  // ----- the formula -----
  const distanceKm = meters / 1000
  const fee = roundTo(baseFee + costPerKm * distanceKm, step)

  const expiresAt = new Date(Date.now() + QUOTE_VALID_MINUTES * 60_000).toISOString()
  const { data: quote, error } = await admin
    .from('delivery_quotes')
    .insert({
      user_id: user.id,
      address,
      note: note || null,
      lat,
      lon,
      origin_lat: originLat,
      origin_lon: originLon,
      distance_m: Math.round(meters),
      fee,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !quote) {
    console.error('Could not save quote:', error)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }

  return json({
    quote_id: quote.id,
    distance_m: Math.round(meters),
    fee,
    expires_at: expiresAt,
    address,
    note: note || null,
  })
})
