import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This explicitly tells Vite where our public assets are.
  // This is a crucial instruction for a clean build.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})

