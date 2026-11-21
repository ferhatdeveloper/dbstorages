import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  css: {
    // Search PostCSS config in this app dir (avoid monorepo root postcss.config.js).
    postcss: __dirname,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@graphcore/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/socket.io': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
  },
})
