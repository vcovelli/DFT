import { describe, it, expect } from "vitest";
import {
  defaultSettings,
  orderSchema,
  quote,
  paymentSummary,
  canTransition,
  validatePdf,
  MAX_FILE,
} from "../lib/domain";
export const input = {
  name: "Test Teacher",
  email: "teacher@example.com",
  subject: "Math",
  grade: "Grade 3–5",
  state: "Ohio",
  service: "lessonPlans",
  duration: "weekly",
  topic: "Fractions",
  instructions: "Please use visual examples.",
  rush: false,
  termsAccepted: true,
} as const;
describe("pricing and validation", () => {
  it("uses integer cents and preserves exact odd-cent totals", () => {
    const c = structuredClone(defaultSettings);
    c.prices.lessonPlans.weekly = 1001;
    const p = quote(orderSchema.parse(input), c);
    expect(p.deposit).toBe(501);
    expect(p.balance).toBe(500);
    expect(p.deposit + p.balance).toBe(p.total);
  });
  it("prices every service and rush", () => {
    for (const service of defaultSettings.available) {
      for (const duration of ["daily", "weekly", "monthly", "unit"] as const) {
        const parsed = orderSchema.safeParse({
          ...input,
          service,
          duration,
          rush: true,
        });
        if (parsed.success) {
          const p = quote(parsed.data, defaultSettings);
          expect(p.total).toBe(p.items.reduce((n, i) => n + i.cents, 0));
          expect(Number.isInteger(p.deposit)).toBe(true);
        }
      }
    }
  });
  it.each([
    { total: 1 },
    { email: "bad" },
    { service: "rush" },
    { duration: "unit" },
    { instructions: "" },
    { termsAccepted: false },
    { service: "completeUnit", duration: "weekly" },
  ])("rejects invalid or tampered input %j", (patch) =>
    expect(orderSchema.safeParse({ ...input, ...patch }).success).toBe(false),
  );
  it("rejects unavailable services", () =>
    expect(() =>
      quote(orderSchema.parse(input), {
        ...defaultSettings,
        available: ["assessment"],
      }),
    ).toThrow());
});
describe("ledger and fulfillment", () => {
  it("does not count failed payments", () =>
    expect(paymentSummary(1000, 500, []).status).toBe("UNPAID"));
  it("tracks deposits and final payments separately", () => {
    expect(
      paymentSummary(1000, 500, [{ received: 500, refunded: 0, disputed: 0 }])
        .status,
    ).toBe("DEPOSIT_PAID");
    expect(
      paymentSummary(1000, 500, [{ received: 1000, refunded: 0, disputed: 0 }])
        .status,
    ).toBe("PAID_IN_FULL");
  });
  it("refunds and disputes reduce actual credit", () => {
    expect(
      paymentSummary(1000, 500, [
        { received: 1000, refunded: 200, disputed: 0 },
      ]).outstanding,
    ).toBe(200);
    expect(
      paymentSummary(1000, 500, [
        { received: 1000, refunded: 0, disputed: 500 },
      ]).status,
    ).toBe("DISPUTED");
  });
  it("requires verified full payment for delivery", () => {
    expect(canTransition("READY_FOR_BALANCE", "DELIVERED", false)).toBe(false);
    expect(canTransition("READY_FOR_BALANCE", "DELIVERED", true)).toBe(true);
    expect(canTransition("CANCELLED", "NEW", true)).toBe(false);
    expect(canTransition("AWAITING_DEPOSIT", "IN_PROGRESS", false)).toBe(false);
  });
});
describe("PDF validation", () => {
  const pdf = Buffer.from("%PDF-1.4\nexample\n%%EOF");
  it("accepts a bounded PDF signature", () =>
    expect(() =>
      validatePdf("lesson.pdf", "application/pdf", pdf),
    ).not.toThrow());
  it.each([
    ["../a.pdf", "application/pdf", pdf],
    ["a.html", "text/html", pdf],
    ["a.pdf", "application/pdf", Buffer.from("<script>hello</script>")],
    ["a.pdf", "application/pdf", Buffer.alloc(MAX_FILE + 1)],
  ])("rejects unsafe files", (name, type, bytes) =>
    expect(() =>
      validatePdf(name as string, type as string, bytes as Buffer),
    ).toThrow(),
  );
});
