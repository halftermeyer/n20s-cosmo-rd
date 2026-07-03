import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /n20s/* to the n20s-server to avoid CORS issues in server mode
      '/n20s': {
        target: process.env.VITE_N20S_URL || 'http://localhost:7475',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/n20s/, ''),
      },
    },
  },
})
