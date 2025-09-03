/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

declare global {
  interface Window {
    CURRENT_USER_ID?: string
  }
}