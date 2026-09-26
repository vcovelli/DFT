import Link from "next/link";
export default async function OrderResult({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  return (
    <main className="owner-shell">
      <Link href="/">Done For Teachers</Link>
      <h1>
        {result === "cancelled"
          ? "Payment was not completed"
          : "Thank you for your request"}
      </h1>
      <p>
        {result === "cancelled"
          ? "Returning here does not cancel the saved order. Contact us to resume payment or cancel your request."
          : "We are checking your payment with Stripe. This page is not proof of payment. A confirmation email follows once your deposit is verified."}
      </p>
      <p>
        The owner prepares your materials and requests the balance before
        emailing the finished work.
      </p>
      <a href="mailto:orders@doneforteachers.com">Contact Done For Teachers</a>
    </main>
  );
}
