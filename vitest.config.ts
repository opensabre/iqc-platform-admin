import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 },
      include: ["src/stores/auth.ts", "src/composables/permission.ts"],
    },
  },
});
