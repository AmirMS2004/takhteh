import { defineConfig } from "@playwright/test";

// Tests need the backend, so they run against the container started by scripts/start.*.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8000", channel: "chrome" },
});
