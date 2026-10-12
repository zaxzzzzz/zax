import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
    // Proxy /api requests to the local backend server (npm run server)
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      },
      // Serve uploaded promo banner images from the backend (server/data/uploads)
      '/uploads': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  test: {
    // Exclude the reference project copy (Next.js app with its own tests)
    exclude: ['nee-noi-debt-planner/**', 'node_modules/**']
  }
});
