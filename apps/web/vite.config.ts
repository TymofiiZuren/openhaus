import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.OPENHAUS_API_PROXY_TARGET ?? 'http://127.0.0.1:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
      '/healthz': apiProxyTarget,
      '/readyz': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
