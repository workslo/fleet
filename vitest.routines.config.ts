import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["routines/**/*.spec.ts"],
  },
});
