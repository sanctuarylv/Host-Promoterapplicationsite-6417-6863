import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import runableAnalyticsPlugin from "./vite/__plugins/runable-analytics-plugin";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";
import ports from "../../__ports.cjs";

const root = path.resolve(__dirname, "../..");

/** Official production origin (public, not a secret). Used when VITE_SITE_URL is blank. */
const CANONICAL_ORIGIN = "https://crew.sanctuarylv.org";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, root, "");
  if (command === "build") {
    // The single root .env is shared by dev and deployments and sets NODE_ENV=development.
    // Copying that into process.env made `vite build` compile React in development mode
    // (708 kB main chunk). Builds always compile for production; dev keeps the .env value.
    // loadEnv() also records the file's NODE_ENV in process.env.VITE_USER_NODE_ENV, which Vite
    // later promotes to NODE_ENV=development; an empty value disables that promotion.
    delete env.NODE_ENV;
    delete env.VITE_USER_NODE_ENV;
    process.env.VITE_USER_NODE_ENV = "";
    process.env.NODE_ENV = "production";
  }
  Object.assign(process.env, env);
  // Canonical/og URLs must never point at a preview host or be relative.
  if (!process.env.VITE_SITE_URL?.trim()) process.env.VITE_SITE_URL = CANONICAL_ORIGIN;

  return {
    // All env files live at the repo root — keep Vite's own env loading there too,
    // so packages/web/.env* files can never shadow the root .env.
    envDir: root,
    plugins: [
      honoDevPlugin(),
      react(),
      runableAnalyticsPlugin(),
      tailwind(),
      assetOptimizerPlugin(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/web"),
      },
    },
    server: {
      port: ports.website,
      strictPort: true,
      allowedHosts: true,
      hmr: { overlay: false },
      cors: false,
    },
  };
});
