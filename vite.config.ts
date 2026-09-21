import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // The version shown in 設定 → アプリ情報 comes from package.json, so it cannot drift
  // from the tag a release was cut at.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    // A desktop bundle is loaded from disk; a source map would only add weight.
    sourcemap: false,
    target: 'chrome110',
  },
})
