import { defineConfig } from "@playwright/test";
import { BASE_URL } from "./e2e/container";

// Tests share one throwaway container and reset its board before each test, so they run serially.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: BASE_URL, channel: "chrome" },
});
