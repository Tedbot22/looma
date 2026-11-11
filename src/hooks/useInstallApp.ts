import { useSyncExternalStore } from 'react'
import { getInstallState, isStandalone, subscribeInstall, subscribeStandalone, type InstallState } from '../lib/install'

const serverState: InstallState = { canPrompt: false, installed: false, ios: false }

export function useInstallApp(): InstallState {
  return useSyncExternalStore(subscribeInstall, getInstallState, () => serverState)
}

// True only while running as the installed app (not in a normal browser tab).
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => false)
}
