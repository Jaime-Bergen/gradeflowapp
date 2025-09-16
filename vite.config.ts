import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || __dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  // server: {
  //   proxy: {
  //     '/api': {
  //       target: 'http://localhost:3003',
  //       changeOrigin: true,
  //       secure: false
  //     }
  //   }
  // }
});
