import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build can be served from any S3/CloudFront path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
