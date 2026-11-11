import { useSyncExternalStore } from 'react'
import { getInstallState, subscribeInstall, type InstallState } from '../lib/install'

const serverState: InstallState = { canPrompt: false, installed: false, ios: false }

export function useInstallApp(): InstallState {
  return useSyncExternalStore(subscribeInstall, getInstallState, () => serverState)
}
