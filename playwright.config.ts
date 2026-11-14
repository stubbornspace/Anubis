import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  projects: [
    {
      name: "chromium",
      testIgnore: "mobile.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "webkit",
      testIgnore: "mobile.spec.ts",
      use: { browserName: "webkit" },
    },
    {
      name: "iphone",
      testMatch: ["mobile.spec.ts", "cloud.spec.ts"],
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "ipad",
      testMatch: ["mobile.spec.ts", "cloud.spec.ts"],
      use: {
        ...devices["iPad Pro 11"],
        viewport: { width: 1024, height: 1366 },
        browserName: "webkit",
      },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run frontend:dev -- --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
  },
});
