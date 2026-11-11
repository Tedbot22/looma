// "Install the app" support.
//
// Chrome, Edge and Android announce that the site can be installed with a `beforeinstallprompt`
// event, often long before the person reaches a page that shows an install button. So we listen
// from the very start (this file is imported in main.tsx) and keep the event for later.
// iPhones never send that event: there the only way is Share -> Add to Home Screen, so the
// button shows instructions instead.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  canPrompt: boolean // the browser will show its own install dialog
  installed: boolean // already running as an installed app
  ios: boolean // needs the manual "Add to Home Screen" steps
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPads pretend to be Macs, so also check for a touch screen.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = isStandalone()
const listeners = new Set<() => void>()

function compute(): InstallState {
  return { canPrompt: deferred !== null && !installed, installed, ios: isIOS() }
}

// useSyncExternalStore needs the same object back until something really changes.
let snapshot = compute()
export const getInstallState = () => snapshot

function update() {
  snapshot = compute()
  listeners.forEach((l) => l())
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of the browser's mini-bar
    deferred = e as BeforeInstallPromptEvent
    update()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    update()
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    installed = e.matches
    update()
  })
}

// Shows the browser's install dialog. Returns true if the person accepted.
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null // each saved event can only be used once
  update()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}
