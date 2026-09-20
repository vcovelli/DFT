# Operating Done For Teachers

Bookmark `https://doneforteachers.com/owner`. Use your configured owner email and the
one-time code sent to your mailbox. You may need a new code after an hour.

## Daily order workflow

1. A new paid-order notification arrives at doneforteachers@gmail.com. Sign in and
   open the order reference. Check the payment column: **DEPOSIT_PAID** is the
   normal starting point. A customer returning from Checkout is not proof of payment.
2. Read the subject, grade, state, topic, instructions, and preparation deadline
   (shown in UTC). Download a template using the private download link if present.
   Treat uploaded documents as untrusted; scan before opening, keep your PDF reader
   current, and do not enable scripts, links, macros, or embedded content.
3. Choose **Start work**. Clarify unclear requirements directly with the customer.
4. Prepare the materials. Choose **Work complete**. This sets READY_FOR_BALANCE;
   it does not email materials or record final payment.
5. Choose **Request balance** and confirm the amount. The customer receives a secure
   Stripe invoice link. Repeating this action reuses the same invoice.
6. When the final payment arrives, the order shows **PAID_IN_FULL**. If needed choose
   **Refresh payment status**. A screenshot, redirect page, or manually marked-paid
   invoice is not accepted as verified payment by the system.
7. Email the finished materials from the business mailbox to the address shown on
   the order. Verify the recipient and attachments. Then choose **Mark delivered**
   and confirm you sent them. The system sends a delivery notice but does **not**
   attach or automatically deliver files.

Payment and fulfillment are separate. A delivered order can later have a refund or
dispute without losing its delivery history. Pause fulfillment when payment needs
review. The deadline describes preparation; unpaid balances can delay delivery.

## Business controls

In **Business settings**, pause/unpause orders, enable services, edit dollar prices,
turnaround hours/message, rush availability, and the deposit percentage. Read the
confirmation before saving. Existing orders keep their original prices and deposit
policy. Website prices and new orders use the saved settings without redeployment.
Keep the policies approval box unchecked until all launch review items are complete.
The default is 50% deposit with any odd cent in the deposit, and no minimum order.

## Credits, refunds, cancellation, disputes

A **credit** reduces the amount still owed. Before requesting an invoice, use
**Record a credit**, enter the amount and reason, and confirm. It does not refund
money already collected or edit the original price snapshot. Credits cannot exceed
the outstanding balance. For already invoiced orders, use the financial review
workflow below; the app will not issue an overlapping replacement invoice.

A **refund** sends collected money back through Stripe. Open the matching payment
in the owner Stripe dashboard, review the customer, order metadata, and amount,
and use Stripe's confirmation flow. Refresh the order afterward. Refunds and
disputes reduce recorded net payments and can reopen a balance, but the system does
not automatically bill a refunded amount again. A refund/dispute status blocks
delivery until resolved. Resolve disputes in Stripe within its deadlines.

**Cancel order** closes any open Checkout Session or unpaid invoice and records
cancellation. It does not refund automatically. Refund separately if required by
your approved policy. Check for late payments after cancellation and contact the
customer. Never delete payment records to make a balance disappear.

Exceptional invoice corrections after invoicing require owner review in Stripe:
void an unpaid invoice to stop collection; decide whether to cancel/refund and
create a genuinely new order. The application intentionally supports one balance
invoice per order and does not automatically reissue after refunds or voiding.

## Notifications and interrupted actions

The dashboard lists pending emails and interrupted payment operations. **Retry
notifications & run cleanup** retries safe sends and performs approved retention
cleanup. Repeated webhooks do not duplicate confirmation messages. Provider failures
do not remove a successful payment.

An email marked **Review required** is older than the safe retry window. Open the
order, check Resend using its order reference, then choose the verified outcome:
accepted (no resend), or not accepted (explicitly authorize a new send). If the
outcome is uncertain, contact the customer directly and do not authorize duplicate
mail. A Resend acceptance is not proof that a mailbox received the message.

For an interrupted Stripe action, find the existing Checkout Session or invoice in
Stripe using the order UUID stored in metadata. Copy its `cs_…` or `in_…` ID into
**Reconnect an interrupted Stripe action**. The application verifies its order,
customer, currency, and amounts before linking and reconciling it. For an unfinished
draft invoice, verify the exact outstanding amount and finalize it in Stripe first.
Do not create a second payment when the original outcome is uncertain. If no
Stripe object exists and the safe retry window has elapsed, cancel the unpaid
request and have the customer place a fresh request. Keep the old record for audit.

## Retention and owner responsibilities

Abandoned unpaid requests are anonymized after seven days when Stripe confirms no
payment; their files are deleted. Ambiguous interrupted operations are retained
for review. Templates are deleted 90 days after delivery or cancellation. Download
any materials needed for your approved business records before that deadline.
Order/payment/audit records remain until the approved accounting/legal retention
period expires; review deletion requests through the process in OPERATIONS.md.

Check pending notifications, disputes, provider service notices, backups, and cron
health regularly. Keep billing and recovery contacts current. Routine settings,
fulfillment, refunds, notification retries, and reconciliation are owner tasks;
provider outages, security incidents, or software upgrades may require qualified
technical support. The business owns the source and accounts so support need not
come from the original developer.
