import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The app calls the backend with relative URLs (/api/..., /uploads/...), so
// both `npm run dev` and `npm run preview` proxy them to the Laravel API.
// Production hosting does the same through vercel.json / netlify.toml.
// Override the backend with VITE_API_TARGET (see .env.example).
// [ANDROID] `vite build --mode native` (npm run build:native) builds the Android bundle. The only HTML change:
// no viewport-fit=cover, so Capacitor keeps the WebView *between* the status bar and the gesture bar
// instead of drawing the page underneath them.
const nativeHtml = (mode) => ({
  name: "uip-native-html",
  transformIndexHtml(html) {
    return mode === "native" ? html.replace(", viewport-fit=cover", "") : html;
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_TARGET || "https://uip-laravel-production.up.railway.app";
  const proxy = {
    "/api": { target, changeOrigin: true, secure: true },
    "/uploads": { target, changeOrigin: true, secure: true },
  };

  return {
    plugins: [react(), nativeHtml(mode)], // [ANDROID] nativeHtml is a no-op unless --mode native
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
