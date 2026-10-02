import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    sourcemap: false,
    minify: 'oxc',
    reportCompressedSize: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          return undefined;
        },
      },
    },
  },
})

