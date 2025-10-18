import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Muy importante para Electron: en build usar rutas relativas
  base: command === 'build' ? './' : '/',

  server: {
    host: '0.0.0.0',     // Permite acceso desde cualquier IP en dev
    port: 5173,
    strictPort: true,
  },

  // Opcional: reduce warnings por tamaño y separa vendor en un chunk
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },

  // Solo variables que empiecen con VITE_ pasan al cliente
  envPrefix: 'VITE_',
}))
