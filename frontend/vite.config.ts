import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Il frontend parla solo con il backend su /api: in sviluppo Vite inoltra a 127.0.0.1:8000.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

// HTTPS in locale con il certificato mkcert, fuori dal repo (la banca in Production rimanda solo
// a indirizzi https). Senza certificato, o con FD_HTTPS=off, si resta in http.
const TLS_DIR =
  process.env.FD_TLS_DIR ??
  join(
    process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url)),
    "secrets",
    "tls",
  );
const TLS_CERT = join(TLS_DIR, "localhost.pem");
const TLS_KEY = join(TLS_DIR, "localhost-key.pem");
const https =
  process.env.FD_HTTPS !== "off" && existsSync(TLS_CERT) && existsSync(TLS_KEY)
    ? { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }
    : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    https,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, https },
  // Mappe del codice generate ma non collegate dalle pagine (sul server non si pubblicano).
  build: { sourcemap: "hidden" },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    css: false,
    // Le pagine con grafici, renderizzate in jsdom con tutti i file in parallelo, possono
    // superare i 5 s predefiniti senza essere sbagliate.
    testTimeout: 15_000,
    env: { TZ: "Europe/Rome" },
  },
});
