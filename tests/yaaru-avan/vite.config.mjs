import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [{
    name: 'isolated-game-test', enforce: 'pre',
    resolveId(id) { if (/\.(png|jpg|webp|svg|woff2?)$/.test(id)) return '\0test-image'; },
    load(id) { if (id === '\0test-image') return 'export default ' + JSON.stringify('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'); },
    transform(code, id) {
      // Test-only fixtures; the real component and all of its event handlers still run.
      if (id.endsWith('/yaaruAvanEngine.ts')) return code.replace('const flip = Math.random() < 0.5;', 'if (window.__fixture) return structuredClone(window.__fixture); const flip = Math.random() < 0.5;');
    },
  }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 4173 },
});
