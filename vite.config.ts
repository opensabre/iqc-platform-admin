import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_APP_PORT || 3010),
      proxy: {
        [env.VITE_APP_BASE_API || "/api"]: {
          target: env.VITE_APP_API_URL,
          changeOrigin: true,
        },
        "/oauth2": { target: env.VITE_APP_API_URL, changeOrigin: true, secure: false },
        "/login/oauth2": { target: env.VITE_APP_API_URL, changeOrigin: true, secure: false },
      },
    },
    plugins: [vue()],
  };
});
