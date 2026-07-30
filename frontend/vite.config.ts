import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      clientPort: 8080,
    },
  },
  define: {
    '__WS_TOKEN__': JSON.stringify(''),
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  build: {
    // Production optimizations
    minify: 'esbuild',
    sourcemap: mode === 'production' ? false : true,
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) requires a resolver function instead of the
        // Rollup object form. Keep stable vendor chunks for browser caching.
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, "/");
          if (!modulePath.includes("/node_modules/")) return undefined;

          const hasPackage = (packageName: string) =>
            modulePath.includes(`/node_modules/${packageName}/`);

          if (
            hasPackage("react") ||
            hasPackage("react-dom") ||
            hasPackage("react-router-dom")
          ) {
            return "react-vendor";
          }

          if (
            hasPackage("@radix-ui/react-dialog") ||
            hasPackage("@radix-ui/react-dropdown-menu") ||
            hasPackage("@radix-ui/react-select") ||
            hasPackage("@radix-ui/react-toast")
          ) {
            return "ui-vendor";
          }

          if (hasPackage("@tanstack/react-query")) return "query-vendor";
          return undefined;
        },
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Enable gzip compression
    reportCompressedSize: true,
    // Optimize asset inlining
    assetsInlineLimit: 4096,
  },
}));
