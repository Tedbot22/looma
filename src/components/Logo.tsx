import { useState } from 'react'
import { LOGO_SRC, STORE_NAME } from '../config'

// The store logo as an image. Put your file in /public and point LOGO_SRC (see config.ts) at it.
// If the file can't be found, a dashed "YOUR LOGO" box is shown instead, so the spot is always visible.
// Change the size with the className, e.g. <Logo className="h-10" />.
export default function Logo({ className = 'h-8 sm:h-9' }: { className?: string }) {
  const [missing, setMissing] = useState(false)

  if (missing) {
    return (
      <span
        role="img"
        aria-label={STORE_NAME}
        className={`flex w-32 items-center justify-center rounded-md border border-dashed border-gray-400 bg-gray-50 text-[11px] font-semibold uppercase tracking-widest text-gray-400 ${className}`}
      >
        Your logo
      </span>
    )
  }

  return (
    <img
      src={LOGO_SRC}
      alt={STORE_NAME}
      onError={() => setMissing(true)}
      className={`block w-auto max-w-[160px] object-contain ${className}`}
    />
  )
}
