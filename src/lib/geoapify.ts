// Address search (autocomplete) with Geoapify. This runs in the browser, so the key it uses is
// a PUBLIC one: in the Geoapify dashboard, restrict it to your website's address so nobody else can use it.

export const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY as string | undefined

// An address the customer picked, with its exact position on the map.
export interface Place {
  formatted: string
  lat: number
  lon: number
}

interface Feature {
  properties?: { formatted?: string; lat?: number; lon?: number }
}

export async function searchAddresses(
  text: string,
  signal: AbortSignal,
  bias?: { lat: number; lon: number }
): Promise<Place[]> {
  const params = new URLSearchParams({
    text,
    filter: 'countrycode:ng', // Nigeria only
    limit: '5',
    lang: 'en',
    apiKey: GEOAPIFY_KEY ?? '',
  })
  // Show results near the store first.
  if (bias) params.set('bias', `proximity:${bias.lon},${bias.lat}`)

  const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal })
  if (!res.ok) throw new Error('Address search failed')

  const data = (await res.json()) as { features?: Feature[] }
  return (data.features ?? []).flatMap((f): Place[] => {
    const p = f.properties
    if (!p?.formatted || typeof p.lat !== 'number' || typeof p.lon !== 'number') return []
    return [{ formatted: p.formatted, lat: p.lat, lon: p.lon }]
  })
}
