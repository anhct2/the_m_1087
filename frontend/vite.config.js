import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev only: forward /api → backend
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8088',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',   // Docker COPY từ /dist; dev dùng npm run build bình thường
    emptyOutDir: true,
  },
})
