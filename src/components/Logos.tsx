import { useState } from 'react'
import { STORE_NAME, LOGO_SRC } from "../config"

import (STORE_NAME)
export default function Logos({ size = 100, className = 'h-8 sm:h-9' }: {size?: number, className?: string }) {
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
      style={{width: size, height: size/2, }}
      onError={() => setMissing(true)}
      className={`block w-auto max-w-[160px] object-contain ${className}`}
    />
  )
}