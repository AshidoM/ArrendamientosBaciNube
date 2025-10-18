import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Permite acceso desde cualquier IP
    port: 5173, // Puerto (puedes cambiarlo si lo necesitas)
    strictPort: true, // Falla si el puerto está ocupado
  }
})