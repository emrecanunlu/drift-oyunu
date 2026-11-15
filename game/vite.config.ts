import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/config.json": "http://localhost:8080" } },
});
