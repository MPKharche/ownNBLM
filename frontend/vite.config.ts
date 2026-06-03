import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ownNBLM",
        short_name: "ownNBLM",
        theme_color: "#080B12",
        background_color: "#080B12",
        display: "standalone",
        icons: [{ src: "/vite.svg", sizes: "192x192", type: "image/svg+xml" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,ico,svg}"] },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react"
          if (id.includes("react-markdown")) return "vendor-markdown"
          if (id.includes("framer-motion")) return "vendor-motion"
          if (id.includes("lucide-react")) return "vendor-ui"
          if (id.includes("react")) return "vendor-react"
        },
      },
    },
  },
  server: {
    // Bind IPv4 + IPv6 — default Vite on Windows often listens only on [::1],
    // so http://127.0.0.1:5173 fails while http://localhost:5173 works.
    host: true,
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:8000",
      "/api": "http://127.0.0.1:8000",
      "/metrics": "http://127.0.0.1:8000",
    },
  },
})
