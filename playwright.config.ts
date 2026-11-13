import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
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
