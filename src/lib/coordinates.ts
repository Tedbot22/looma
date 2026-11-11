// Turns a typed location into decimal latitude/longitude. Accepts either
//   4.900917, 6.906306                 (decimal, as most apps show it)
//   4°54'03.3"N 6°54'22.7"E            (degrees, minutes, seconds, as Google Maps shows it)
// Returns null if it can't be read, or if the numbers are out of range.
export function parseLatLon(input: string): { lat: number; lon: number } | null {
  const text = input
    .trim()
    .replace(/[′’‘]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')

  let lat: number | null = null
  let lon: number | null = null

  const decimal = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (decimal) {
    lat = Number(decimal[1])
    lon = Number(decimal[2])
  } else {
    const parts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*')?\s*(?:(\d+(?:\.\d+)?)\s*")?\s*([NSEW])?/gi)]
    if (parts.length !== 2) return null
    const toDecimal = (m: RegExpMatchArray) => {
      const value = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600
      const hemisphere = (m[4] ?? '').toUpperCase()
      return hemisphere === 'S' || hemisphere === 'W' ? -value : value
    }
    const first = parts[0]
    const second = parts[1]
    // The letter says which is which; with no letters, latitude comes first.
    const firstIsLon = /[EW]/i.test(first[4] ?? '')
    lat = toDecimal(firstIsLon ? second : first)
    lon = toDecimal(firstIsLon ? first : second)
  }

  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 }
}
