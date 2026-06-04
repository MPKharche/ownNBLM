import { expect, test } from "@playwright/test"

test("health and login shell", async ({ page, request }) => {
  const health = await request.get("http://127.0.0.1:8765/health")
  expect(health.ok()).toBeTruthy()

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /ownNBLM/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
})

test("billing plans load", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel(/email/i).fill("admin@ownnblm.local")
  await page.getByLabel(/password/i).fill("admin123")
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/chat/, { timeout: 15_000 })
  await page.goto("/billing")
  await expect(page.getByText(/usage|plan/i).first()).toBeVisible({ timeout: 10_000 })
})
