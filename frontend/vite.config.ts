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
    proxy: {
      "/auth": "http://localhost:8000",
      "/usuarios": "http://localhost:8000",
      "/propostas": "http://localhost:8000",
      "/regras": "http://localhost:8000",
      "/titan": "http://localhost:8000",
      "/bancos": "http://localhost:8000",
      "/storm": "http://localhost:8000",
      "/convenios": "http://localhost:8000",
      "/corretores": "http://localhost:8000",
      "/grupos": "http://localhost:8000",
      "/layouts": "http://localhost:8000",
      "/importacoes": "http://localhost:8000",
      "/averbacoes": "http://localhost:8000",
      "/retornos-banco": "http://localhost:8000",
      "/pendencias": "http://localhost:8000",
      "/logs": "http://localhost:8000",
      "/relatorios": "http://localhost:8000",
      "/blacklist": "http://localhost:8000",
      "/buscar": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
