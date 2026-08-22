import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// public/sw.js is copied into dist/ byte-for-byte by Vite (files in public/
// aren't processed/hashed) — so its content is otherwise identical build to
// build. The browser's native service-worker update check works by
// byte-diffing the SW script itself, so with a static sw.js there is
// literally nothing for it to detect on a normal code-only deploy, no
// matter how the app polls for updates (see useVersionCheck.ts). Stamping a
// unique build id into the file after each build gives it a real, changing
// fingerprint without touching its actual logic (push notifications, PWA
// install, etc. in public/sw.js stay untouched).
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    closeBundle() {
      const swPath = path.resolve(import.meta.dirname, 'dist/sw.js')
      if (!fs.existsSync(swPath)) return
      const original = fs.readFileSync(swPath, 'utf-8')
      const stamped = `// build: ${Date.now()}-${Math.random().toString(36).slice(2, 8)}\n${original}`
      fs.writeFileSync(swPath, stamped)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    stampServiceWorker(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    // jspdf/html2canvas (PDF export) are legitimately this size for what
    // they do — no reason to chase those. Icons and other vendor code are
    // now split into their own chunks above instead of riding along with
    // something else, so this limit should rarely trip; kept a little
    // above the default as headroom rather than as a "these are fine, stop
    // warning" escape hatch.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        admin: path.resolve(import.meta.dirname, 'admin.html'),
      },
      output: {
        // Split heavy, rarely-changing vendor code out of the main app
        // chunk. This doesn't shrink total bytes shipped, but it lets the
        // browser cache these separately (they change far less often than
        // app code, so a new deploy won't force users to re-download React
        // etc.) and lets the browser fetch them in parallel.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Anchor on the exact package folder under node_modules rather
          // than a loose substring match — `id.includes('/react/')` also
          // matched unrelated packages whose path just happens to contain
          // "react" (notably @phosphor-icons/react, a large icon library),
          // silently sweeping them into this chunk and inflating it to
          // 5MB+. Matching the real package boundary keeps this chunk to
          // just React itself.
          const normalized = id.replace(/\\/g, '/');
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(normalized)) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/framer-motion/')) {
            return 'vendor-motion';
          }
          if (normalized.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (normalized.includes('/node_modules/react-hook-form/')) {
            return 'vendor-form';
          }
          // Icon set is large and changes far less often than app code —
          // split out so it caches independently instead of riding along
          // with (or bloating) another vendor chunk.
          if (normalized.includes('/node_modules/@phosphor-icons/')) {
            return 'vendor-icons';
          }
          return undefined;
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
  },
})
