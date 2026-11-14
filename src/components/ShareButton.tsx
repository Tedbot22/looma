import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  title: string // e.g. the product name
  text: string // a short line to go with the link
  url: string // absolute address to share
  className?: string
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / non-secure pages: the classic fallback.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

// The Share button. On phones it opens the phone's own share sheet (WhatsApp, Instagram, Messages...).
// Where that isn't available (most desktop browsers) it opens a small menu with Copy link and WhatsApp.
export default function ShareButton({ title, text, url, className = '' }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Close the menu when tapping elsewhere or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleCopy() {
    const ok = await copyText(url)
    if (ok) {
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(`Couldn't copy. The link is ${url}`)
    }
  }

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
      } catch (err) {
        // Closing the share sheet counts as an "AbortError": that's not a problem.
        if ((err as Error).name !== 'AbortError') setMenuOpen(true)
      }
      return
    }
    setMenuOpen((open) => !open)
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleShare}
        aria-label="Share this item"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="rounded-full border border-gray-200 p-2 text-gray-500 hover:border-brand hover:text-brand"
      >
        <Share2 size={20} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50"
          >
            {copied ? <Check size={16} className="text-brand" /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            role="menuitem"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
        </div>
      )}
    </div>
  )
}
