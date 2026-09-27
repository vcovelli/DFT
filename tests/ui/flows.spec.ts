import { test, expect, type Page } from "@playwright/test";
import { defaultSettings, quote, type OrderInput } from "../../lib/domain";
async function fillOrder(page: Page) {
  await page.getByLabel("Full name").fill("Test Teacher");
  await page.getByLabel("Email address").fill("teacher@example.test");
  await page.getByLabel("Subject", { exact: true }).selectOption("Math");
  await page.getByLabel("Grade band").selectOption("Grade 3–5");
  await page.getByLabel("State or territory").fill("Ohio");
  await page.getByLabel("Topic or unit focus").fill("Fractions");
  await page
    .getByLabel("Detailed instructions")
    .fill("Use visual examples and include an answer key.");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  page.on("dialog", (dialog) => void dialog.accept());
});
test("service selection keeps entered details and prepares the selected request", async ({
  page,
}) => {
  await page.goto("/");
  await fillOrder(page);
  await page
    .getByRole("link", { name: "Choose Complete unit", exact: true })
    .click();
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue(
    "completeUnit",
  );
  await expect(page.getByLabel("Full name")).toHaveValue("Test Teacher");
  await expect(page.getByLabel("Duration", { exact: true })).toHaveCount(0);
  await page.route("**/api/orders", async (route) => {
    const input = route.request().postDataJSON() as OrderInput;
    expect(input.service).toBe("completeUnit");
    expect(input.duration).toBe("unit");
    await route.fulfill({
      json: {
        id: "fixture",
        reference: "DFT-FIXTURE",
        token: "fixture",
        hasTemplate: false,
        pricing: quote(input, defaultSettings),
      },
    });
  });
  await page.getByRole("button", { name: "Review final price" }).click();
  await expect(page.getByRole("status")).toContainText("DFT-FIXTURE");
  await expect(page.locator("#order-review")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Pay $37.50 deposit" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeDisabled();
});
test("a failed save is retryable with the same key even when browser storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
  });
  const keys: string[] = [];
  await page.route("**/api/orders", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<h1>Provider unavailable</h1>",
    });
  });
  await page.goto("/");
  await fillOrder(page);
  await page.getByRole("button", { name: "Review final price" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Review final price" }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page.getByLabel("Full name")).toHaveValue("Test Teacher");
});
test("owner login supports code entry, resend cooldown, and email correction", async ({
  page,
}) => {
  await page.route("**/api/owner/auth", (route) =>
    route.fulfill({ json: { sent: true } }),
  );
  await page.goto("/?screen=login");
  await page.getByLabel("Owner email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send a sign-in code" }).click();
  await expect(page.getByLabel("Email code")).toBeFocused();
  await expect(
    page.getByRole("button", { name: /Resend available/ }),
  ).toBeDisabled();
  await page.getByLabel("Email code").fill("123 456");
  await expect(page.getByLabel("Email code")).toHaveValue("123456");
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Owner email")).toBeEditable();
  await expect(page.getByLabel("Email code")).toHaveCount(0);
});
test("owner dashboard has readable statuses and no horizontal page overflow", async ({
  page,
}) => {
  await page.goto("/?screen=owner");
  await expect(
    page.getByRole("heading", { name: "Owner workspace" }),
  ).toBeVisible();
  await expect(page.getByText("Deposit paid", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Accepting orders", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/?screen=owner&empty=1");
  await expect(
    page.getByRole("heading", { name: "Your first order starts here" }),
  ).toBeVisible();
});
test("balance action keeps the hosted invoice link available and reports success", async ({
  page,
}) => {
  await page.route("**/api/owner/orders/*", (route) =>
    route.fulfill({
      json: { url: "https://invoice.stripe.com/i/fixture", status: "open" },
    }),
  );
  await page.goto("/?screen=order");
  await page.getByRole("button", { name: "Get balance payment link" }).click();
  await expect(
    page.getByRole("link", { name: "Open balance payment page" }),
  ).toHaveAttribute("href", "https://invoice.stripe.com/i/fixture");
  await expect(page.getByRole("status")).toContainText("Invoice ready");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("settings prevent disabling every service without losing edits", async ({
  page,
}) => {
  await page.goto("/?screen=owner");
  for (const checkbox of await page.locator('input[name="available"]').all())
    await checkbox.uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Keep at least one service selected",
  );
  await expect(
    page.getByRole("button", { name: "Save settings" }),
  ).toBeEnabled();
});
test("sign-out errors keep the owner on the current page", async ({ page }) => {
  await page.route("**/api/owner/auth", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "unavailable",
    }),
  );
  await page.goto("/?screen=owner");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-navigation",
    /.+/,
  );
});

test("fully paid orders offer delivery instead of requesting the balance again", async ({
  page,
}) => {
  await page.goto("/?screen=order&paid=1");
  await expect(
    page.getByRole("button", { name: "Mark delivered" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Request balance|Get balance payment link/,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("Paid in full", { exact: true })).toBeVisible();
});
