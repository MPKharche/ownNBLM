import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : [
        {
          command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8765",
          cwd: "../backend",
          url: "http://127.0.0.1:8765/health",
          reuseExistingServer: true,
          env: {
            ENVIRONMENT: "development",
            LLM_BUDGET_ENABLED: "false",
            DATABASE_URL: "sqlite:///./e2e.db",
          },
        },
        {
          command: "npm run dev -- --host 127.0.0.1 --port 5173",
          cwd: "../frontend",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
          env: {
            VITE_DEV_API_PROXY: "http://127.0.0.1:8765",
          },
        },
      ],
})
