import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    // Sem proxy: o frontend chama o backend direto via VITE_API_URL
    // (frontend/src/lib/api.ts, baseURL absoluta), habilitado por CORS
    // no backend (main.py). Um proxy por prefixo aqui colidia com as
    // rotas do React Router de mesmo nome (ex: /propostas, /regras,
    // /bancos...) — navegação direta por URL ou F5 nessas 12 telas
    // acabava sendo interceptada pelo proxy e recebia JSON da API em
    // vez do app React (AUDITORIA_PRODUCAO.md, achado M11).
  },
});
