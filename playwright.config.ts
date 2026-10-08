import { defineConfig, devices } from "@playwright/test";

const PORT = 8787;

export default defineConfig({
  testDir: "e2e",
  // Both people share one Durable Object room, so tests must not run in parallel.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview",
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
