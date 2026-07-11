# Root Vite config retired — use apps/web and apps/console
# Kept only so accidental `vite` at root fails clearly.
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    emptyOutDir: false,
  },
  server: {
    port: 5199,
  },
})
