/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OTEL_EXPORTER?: string
  /** `json` (default) = `.runtime-data` via Vite middleware; `localstorage` = browser storage */
  readonly VITE_LOCAL_SAVE_MODE?: 'json' | 'localstorage' | string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
