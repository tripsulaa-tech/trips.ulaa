import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { invoicePdfDevMiddleware } from './vite-plugins/invoicePdfDevMiddleware.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Only needed to hand SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (server-only,
  // no VITE_ prefix — see .env.example) to invoicePdfDevMiddleware below;
  // Vite doesn't put non-VITE_-prefixed vars in process.env by default.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Local-only stand-in for api/invoices/[id]/pdf.ts — `npm run dev` runs
      // plain `vite`, which never runs Vercel serverless functions, so
      // without this the "Download Invoice" button can't reach a real PDF
      // route locally. See vite-plugins/invoicePdfDevMiddleware.ts for the
      // full explanation. Registered for `vite dev` only — `vite build`
      // (production) never loads this plugin.
      ...(command === 'serve' ? [invoicePdfDevMiddleware(env)] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
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
  }
})
