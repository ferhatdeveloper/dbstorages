/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NODE_API_BASE?: string
  readonly VITE_GO_API_BASE?: string
  readonly VITE_WEB_URL?: string
  readonly VITE_CONSOLE_URL?: string
  readonly VITE_BASE?: string
  readonly BASE_URL: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
