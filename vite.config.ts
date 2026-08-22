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
    // jspdf/html2canvas (PDF export) and the shared icon set are
    // legitimately this size for what they do; splitting further would
    // mean hand-chunking hundreds of individual icon imports for little
    // real benefit. Raise the warning threshold instead of chasing it.
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
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('react-hook-form')) {
            return 'vendor-form';
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
