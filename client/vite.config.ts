import { createHash } from 'node:crypto';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Content-Security-Policy for the built app: the browser refuses any script that isn't one of
// OUR files, so even if an attacker got HTML into the page (say, a product name), it can't run.
// Build only: the dev server injects inline scripts for hot reload, which this would block.
// (frame-ancestors can't be set from a <meta> tag; the host adds it as a header in Phase 10.)
function contentSecurityPolicy(apiUrl: string): Plugin {
  // A wrong API address would only show up as a blank app after deploying; stop the build now.
  if (!/^(\/|https?:\/\/)/.test(apiUrl ?? '')) {
    throw new Error(`VITE_API_URL must be "/api/v1" or an http(s) URL, got "${apiUrl}"`);
  }
  return {
    name: 'saripos-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post', // hash the FINAL html, exactly as the browser will see it
      handler(html) {
        // The inline theme script in index.html is allowed by its hash, and only it: change
        // one character of it and the hash changes, so the browser won't run a tampered copy.
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        );
        const policy = [
          "default-src 'self'",
          // wasm-unsafe-eval: lets the barcode decoder (.wasm) compile; it does NOT allow eval().
          ["script-src 'self' 'wasm-unsafe-eval'", ...inline].join(' '),
          // Inline style attributes are used by the UI library (popovers, scroll lock). Styles
          // can't run code, so this is the accepted trade-off; scripts stay strict.
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          // The API, nothing else. Deployed, it's "/api/v1" on our own site (vercel.json forwards
          // it), so 'self' covers it; locally it's another port, so that origin is added.
          `connect-src 'self'${apiUrl.startsWith('/') ? '' : ` ${new URL(apiUrl).origin}`}`,
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; ');
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
              injectTo: 'head-prepend', // before any script, or it wouldn't cover them
            },
          ],
        };
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(loadEnv(mode, import.meta.dirname).VITE_API_URL),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // The scanner is lazy-loaded, so Vite would only discover this package the first time the
  // camera opens, then reload the page to re-bundle it, wiping any half-filled form. Bundle it
  // up front instead. (Development only; production builds are unaffected.)
  optimizeDeps: { include: ['barcode-detector/ponyfill'] },
  // `vite preview` of a build made with VITE_API_URL=/api/v1 forwards the API like Vercel does.
  preview: { proxy: { '/api': 'http://localhost:4000' } },
}));
