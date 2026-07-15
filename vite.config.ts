import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { runtimeDataPlugin } from './vite-plugin-runtime-data.ts'

export default defineConfig({
  plugins: [react(), runtimeDataPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Browser OTLP → Jaeger collector (avoids CORS)
      '/otlp': {
        target: 'http://127.0.0.1:4318',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/otlp/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
