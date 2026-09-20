import Link from "next/link";
export default function Policies() {
  return (
    <main className="owner-shell">
      <Link href="/">Done For Teachers</Link>
      <h1>Order terms & privacy</h1>
      <p>
        We collect your contact details, requested service, instructions, and
        optional PDF template to prepare educational materials and communicate
        about your order. Do not submit student records or other sensitive
        personal information.
      </p>
      <p>
        The final price and deposit are shown before Stripe Checkout.
        Preparation begins after payment verification and review of your
        details. The remaining balance is due before the owner emails your
        materials. Turnaround describes preparation, not automatic delivery.
      </p>
      <p>
        Contact doneforteachers@gmail.com before ordering to clarify scope,
        revisions, rush availability, cancellations, or refunds. Refunds require
        a separate review and are not automatically issued when an order is
        cancelled.
      </p>
      <p>
        Stripe processes payment information. We do not store card numbers.
        Vercel hosts this website, Supabase stores order information and private
        templates, and Resend sends order notifications. Private files are not
        attached to automated notifications.
      </p>
      <p>
        Abandoned unpaid templates are removed after seven days. Paid-order
        templates are removed 90 days after delivery or cancellation. Financial
        and order records are retained according to the business’s approved
        accounting and legal retention policy. Contact us to request access,
        correction, or deletion; some financial records may need to be retained.
      </p>
      <p>
        These operational notices require the business owner’s legal and policy
        review before ordering is enabled. No regulatory certification is
        claimed.
      </p>
      <p>
        Questions:{" "}
        <a href="mailto:doneforteachers@gmail.com">doneforteachers@gmail.com</a>
      </p>
    </main>
  );
}
