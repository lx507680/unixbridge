import type { UnixbridgeApi } from '../preload'

declare global {
  interface Window {
    unixbridge: UnixbridgeApi
  }
}

export {}
