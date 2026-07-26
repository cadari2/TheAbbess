import { defineConfig } from "vite";
export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: new URL("../public", import.meta.url).pathname,
  server: { port: 5199, strictPort: true },
});
