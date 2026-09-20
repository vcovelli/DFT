import { z } from "zod";

export const services = {
  lessonPlans: "Lesson plans",
  doNows: "Do Nows",
  exitTickets: "Exit tickets",
  doNowExitTicket: "Do Now + Exit Ticket",
  completeUnit: "Complete unit",
  assessment: "State-aligned assessment + answer key",
} as const;
export type Service = keyof typeof services;
export const serviceKeys = Object.keys(services) as [Service, ...Service[]];
export const durations = ["daily", "weekly", "monthly", "unit"] as const;
const cents = z.number().int().min(1).max(1000000);
const rates = z
  .object({ daily: cents, weekly: cents, monthly: cents })
  .strict();
export const settingsSchema = z
  .object({
    paused: z.boolean(),
    policyApproved: z.boolean(),
    depositPercent: z.number().int().min(1).max(99),
    turnaroundHours: z.number().int().min(1).max(2160),
    rushHours: z.number().int().min(1).max(2160),
    turnaroundMessage: z.string().trim().min(1).max(300),
    available: z.array(z.enum(serviceKeys)).min(1),
    rushAvailable: z.boolean(),
    prices: z
      .object({
        lessonPlans: rates,
        doNows: rates,
        exitTickets: rates,
        doNowExitTicket: rates,
        completeUnit: cents,
        assessment: cents,
        rush: z.number().int().min(0).max(100000),
      })
      .strict(),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  paused: true,
  policyApproved: false,
  depositPercent: 50,
  turnaroundHours: 48,
  rushHours: 24,
  turnaroundMessage:
    "Materials are prepared within 24–48 hours after deposit and details are approved. Delivery follows final payment.",
  available: serviceKeys,
  rushAvailable: true,
  prices: {
    lessonPlans: { daily: 250, weekly: 1000, monthly: 3500 },
    doNows: { daily: 200, weekly: 500, monthly: 2000 },
    exitTickets: { daily: 200, weekly: 500, monthly: 2000 },
    doNowExitTicket: { daily: 300, weekly: 700, monthly: 3500 },
    completeUnit: 7500,
    assessment: 700,
    rush: 1000,
  },
};
export const orderSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    subject: z.enum([
      "Math",
      "English",
      "Reading",
      "Social Studies",
      "Spelling",
      "Writing",
      "Other",
    ]),
    grade: z.enum(["Grade 1–2", "Grade 3–5", "Grade 6–8", "Grade 9–12"]),
    state: z.string().trim().min(2).max(80),
    service: z.enum(serviceKeys),
    duration: z.enum(durations),
    topic: z.string().trim().min(2).max(300),
    instructions: z.string().trim().min(5).max(6000),
    rush: z.boolean(),
    website: z.literal("").default(""),
    termsAccepted: z.literal(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.service === "completeUnit" || v.service === "assessment") !==
      (v.duration === "unit")
    )
      ctx.addIssue({
        code: "custom",
        message: "Unsupported service duration",
        path: ["duration"],
      });
  });
export type OrderInput = z.infer<typeof orderSchema>;
export function quote(input: OrderInput, config: Settings) {
  if (
    !config.available.includes(input.service) ||
    (input.rush && !config.rushAvailable)
  )
    throw new Error("Service unavailable");
  const price = config.prices[input.service];
  const base =
    typeof price === "number"
      ? price
      : price[input.duration as keyof typeof price];
  if (!Number.isSafeInteger(base)) throw new Error("Unsupported duration");
  const rush = input.rush ? config.prices.rush : 0;
  const total = base + rush;
  const deposit = Number(
    (BigInt(total) * BigInt(config.depositPercent) + BigInt(99)) / BigInt(100),
  );
  return {
    version: 1,
    service: services[input.service],
    duration: input.duration,
    items: [
      { label: services[input.service], cents: base },
      ...(rush ? [{ label: "Rush service", cents: rush }] : []),
    ],
    total,
    deposit,
    balance: total - deposit,
    currency: "usd",
    depositPercent: config.depositPercent,
    turnaroundHours: input.rush ? config.rushHours : config.turnaroundHours,
  };
}
export type Snapshot = ReturnType<typeof quote>;
export type Fulfillment =
  | "AWAITING_DEPOSIT"
  | "NEW"
  | "IN_PROGRESS"
  | "READY_FOR_BALANCE"
  | "DELIVERED"
  | "CANCELLED";
export type PaymentStatus =
  | "UNPAID"
  | "DEPOSIT_PAID"
  | "PAID_IN_FULL"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "DISPUTED";
export type Ledger = { received: number; refunded: number; disputed: number };
export function paymentSummary(total: number, deposit: number, rows: Ledger[]) {
  const received = rows.reduce((n, p) => n + p.received, 0);
  const refunded = rows.reduce((n, p) => n + p.refunded, 0);
  const disputed = rows.reduce((n, p) => n + p.disputed, 0);
  const net = received - refunded - disputed;
  const status: PaymentStatus =
    disputed > 0
      ? "DISPUTED"
      : refunded > 0
        ? net <= 0
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED"
        : net >= total
          ? "PAID_IN_FULL"
          : net >= deposit
            ? "DEPOSIT_PAID"
            : "UNPAID";
  return {
    received,
    refunded,
    disputed,
    net,
    outstanding: Math.max(0, total - net),
    status,
  };
}
export function canTransition(
  from: Fulfillment,
  to: Fulfillment,
  paid: boolean,
) {
  if (from === to) return true;
  if (to === "CANCELLED") return from !== "DELIVERED";
  return (
    (from === "NEW" && to === "IN_PROGRESS") ||
    (from === "IN_PROGRESS" && to === "READY_FOR_BALANCE") ||
    (from === "READY_FOR_BALANCE" && to === "DELIVERED" && paid)
  );
}
export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
export const MAX_FILE = 3 * 1024 * 1024;
export function validatePdf(name: string, type: string, data: Uint8Array) {
  if (
    !/^[^/\\\x00-\x1f]{1,150}\.pdf$/i.test(name) ||
    type !== "application/pdf" ||
    data.length > MAX_FILE ||
    data.length < 12 ||
    new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-" ||
    !new TextDecoder().decode(data.slice(-1024)).includes("%%EOF")
  )
    throw new Error(
      "Use one PDF file up to 3 MB. The file must be a valid PDF.",
    );
}
