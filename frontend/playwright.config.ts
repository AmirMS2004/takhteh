import { defineConfig } from "@playwright/test";
import { BASE_URL } from "./e2e/container";

// Tests share one throwaway container and reset its board before each test, so they run serially.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Wide enough that drag tests see source and target columns next to the open chat panel.
  use: { baseURL: BASE_URL, channel: "chrome", viewport: { width: 1600, height: 1000 } },
});
