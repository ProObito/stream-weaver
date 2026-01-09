import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Lovable tagger ko SAFE tareeke se load karo
let componentTagger: null | (() => any) = null;

if (process.env.NODE_ENV === "development") {
  try {
    // dynamic import so production build na toote
    componentTagger = require("lovable-tagger").componentTagger;
  } catch (e) {
    componentTagger = null;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger ? componentTagger() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
