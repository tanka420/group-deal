import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import {circleBrowserJwt} from "./build/circleBrowserJwt.ts";
import { bundleInventory } from "./build/bundleInventory.ts";

export default defineConfig({
  plugins: [circleBrowserJwt(), react(), nodePolyfills(), bundleInventory()],
  // Discover lazy wallet dependencies at server startup, so the first wallet
  // action does not force Vite to reload the page and discard pending state.
  optimizeDeps:{include:["@reown/appkit","@reown/appkit/networks","@reown/appkit-adapter-ethers","viem/op-stack","viem/chains"]},
  build:{manifest:true,rollupOptions:{input:{app:"index.html",fallback:"fallback.html"}}},
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.GROUPDEAL_API_PROXY || "http://127.0.0.1:4100",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.GROUPDEAL_API_PROXY || "http://127.0.0.1:4100",
        changeOrigin: true,
      },
    },
  },
});
