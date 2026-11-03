import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // Dev only: the compile server runs separately (`yarn server`).
      "/api": process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001",
    },
  },
});
