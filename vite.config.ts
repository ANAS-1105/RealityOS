import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const API_TARGET = process.env.REALITYOS_API ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the heavy, lazily-imported document parsers in their own chunks.
          if (id.includes('pdfjs-dist')) return 'pdf'
          if (id.includes('mammoth')) return 'docx'
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('node_modules')) return 'vendor'
          return undefined
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/auth/freebuff': { target: API_TARGET, changeOrigin: false },
    },
  },
})
