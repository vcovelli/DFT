const labels: Record<string, string> = {
  UNPAID: "Awaiting payment",
  DEPOSIT_PAID: "Deposit paid",
  PAID_IN_FULL: "Paid in full",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  DISPUTED: "Payment disputed",
  AWAITING_DEPOSIT: "Awaiting deposit",
  NEW: "Ready to start",
  IN_PROGRESS: "In progress",
  READY_FOR_BALANCE: "Work complete",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  deposit: "Deposit confirmation",
  new_order: "New order notification",
  balance: "Balance request",
  paid: "Payment confirmation",
  delivered: "Delivery confirmation",
  failed: "Payment notification",
  cancelled: "Cancellation confirmation",
  review: "Payment review",
};
export function readableStatus(value: string) {
  return (
    labels[value] ||
    value.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase())
  );
}
export function statusTone(value: string) {
  if (["PAID_IN_FULL", "DELIVERED"].includes(value)) return "success";
  if (
    ["DISPUTED", "REFUNDED", "PARTIALLY_REFUNDED", "CANCELLED"].includes(value)
  )
    return "attention";
  return "neutral";
}
export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
