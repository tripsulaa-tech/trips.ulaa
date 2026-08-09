import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
