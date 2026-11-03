import { callFunction } from './payments'

// A price quote for delivering to one exact address. The server made it, and checkout
// sends only quote_id to place_order, which reads the fee from the saved quote.
export interface Quote {
  quote_id: string
  distance_m: number
  fee: number
  expires_at: string
  address: string
  note: string | null
}

export const requestQuote = (args: { lat: number; lon: number; address: string; note?: string }) =>
  callFunction<Quote>('delivery-quote', args)

export const formatKm = (meters: number) => `${(meters / 1000).toFixed(1)} km`

// The same formula the server uses, so the admin page can show an example before saving.
// The server is the one that actually prices orders.
export function calculateFee(baseFee: number, costPerKm: number, distanceKm: number, roundTo: number): number {
  const raw = baseFee + costPerKm * distanceKm
  return roundTo > 0 ? Math.round(raw / roundTo) * roundTo : Math.round(raw)
}

// Opens Google Maps with the route from the store to the customer (no Google key needed).
export function routeUrl(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }) {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${origin.lat},${origin.lon}` +
    `&destination=${destination.lat},${destination.lon}` +
    '&travelmode=driving'
  )
}
