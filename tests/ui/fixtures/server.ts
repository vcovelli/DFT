import { defaultSettings } from "../../../lib/domain";
const config = { ...defaultSettings, paused: false, policyApproved: true };
export const order = {
  id: "00000000-0000-4000-8000-000000000001",
  reference: "DFT-TEST123456",
  customer_name: "Test Teacher",
  customer_email: "teacher@example.test",
  total: 8500,
  deposit: 4250,
  net: 4250,
  credit: 0,
  payment_status: "DEPOSIT_PAID",
  fulfillment: "READY_FOR_BALANCE",
  invoice_id: "in_fixture",
  invoice_status: "open",
  template_key: "fixture.pdf",
  template_name: "Classroom-template.pdf",
  pricing: { service: "Complete unit", duration: "unit" },
  details: {
    subject: "Math",
    grade: "Grade 3–5",
    state: "Ohio",
    topic: "Fractions in everyday life",
    instructions:
      "Use visual examples and hands-on activities.\nInclude a short assessment with an answer key.",
  },
  delivery_deadline: "2026-10-01T15:00:00Z",
};
export async function requireOwner() {
  return { id: "owner-fixture" };
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function settings() {
  return config;
}
export async function getOrder() {
  return order;
}
export async function summary() {
  return {
    status: new URLSearchParams(location.search).has("paid")
      ? "PAID_IN_FULL"
      : "DEPOSIT_PAID",
    received: 4250,
    credit: 0,
    refunded: 0,
    disputed: 0,
    outstanding: 4250,
  };
}
export function orderingEnabled() {
  return true;
}
export function testEmailFailuresAllowed() {
  return false;
}
export async function requireOrderingAvailable() {}
export const db = {
  async query(sql: string) {
    if (sql.includes("FROM orders o"))
      return {
        rows: new URLSearchParams(location.search).has("empty") ? [] : [order],
      };
    if (sql.includes("FROM maintenance_state"))
      return { rows: [{ last_success_at: "2026-09-27T15:00:00Z" }] };
    if (sql.includes("FROM activity"))
      return {
        rows: [
          { action: "deposit_verified", created_at: "2026-09-27T15:00:00Z" },
        ],
      };
    return { rows: [] };
  },
};
