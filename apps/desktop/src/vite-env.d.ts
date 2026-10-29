/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURA_SERVER_URL?: string;
  readonly TAURI_ENV_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
