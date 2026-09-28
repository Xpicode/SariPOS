import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // The scanner is lazy-loaded, so Vite would only discover this package the first time the
  // camera opens, then reload the page to re-bundle it, wiping any half-filled form. Bundle it
  // up front instead. (Development only; production builds are unaffected.)
  optimizeDeps: { include: ['barcode-detector/ponyfill'] },
})
