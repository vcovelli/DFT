import { test, expect } from "@playwright/test";
test("marketing page renders and ordering fails closed without account setup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("DEMO / STAGING");
  await expect(
    page.getByRole("heading", { name: "Your lessons. Done." }),
  ).toBeVisible();
  await expect(page.getByText("Orders are temporarily paused")).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay .*deposit/ })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("owner pages redirect unauthenticated visitors to sign-in", async ({
  page,
  request,
}) => {
  await page.goto("/owner");
  await expect(page).toHaveURL(/\/owner\/login/);
  await expect(
    page.getByRole("heading", { name: "Owner sign-in" }),
  ).toBeVisible();
  const response = await request.get(
    "/api/owner/orders/00000000-0000-4000-8000-000000000001",
  );
  expect(response.status()).toBe(401);
});
test("returning from Checkout never claims verified payment", async ({
  page,
}) => {
  await page.goto("/order-result?result=returned");
  await expect(
    page.getByText(/This page is not proof of payment/),
  ).toBeVisible();
  await page.goto("/order-result?result=cancelled");
  await expect(
    page.getByRole("heading", { name: "Payment was not completed" }),
  ).toBeVisible();
});
test("security headers and policy notice are served", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  await page.goto("/policies");
  await expect(
    page.getByRole("heading", { name: "Order terms & privacy" }),
  ).toBeVisible();
});

test("health and maintenance expose no private diagnostics", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(503);
  expect(await health.json()).toEqual({ ok: false });
  expect(health.headers()["cache-control"]).toBe("no-store");
  for (const method of ["get", "post"] as const) {
    const response = await request[method]("/api/cron");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  }
});
