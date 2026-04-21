import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;
  if (!sessionId) {
    redirect("/");
  }

  let paid = false;
  let email: string | null = null;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    paid = session.payment_status === "paid";
    email =
      session.customer_details?.email ||
      session.customer_email ||
      null;
  } catch {
    paid = false;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-28 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-400/90">Wrist Reserve</p>
      <h1 className="mt-6 font-display text-4xl text-white">
        {paid ? "Thank you" : "Payment pending"}
      </h1>
      <p className="mt-4 text-sm text-white/55">
        {paid
          ? "Your order is confirmed. A concierge will follow up with shipping details."
          : "We are confirming your payment. You will receive an email shortly."}
      </p>
      {email ? (
        <p className="mt-6 text-xs text-white/40">
          Confirmation sent to <span className="text-white/70">{email}</span>
        </p>
      ) : null}
      <Link
        href="/shop"
        className="mt-12 inline-flex rounded-sm bg-white px-10 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200"
      >
        Return to shop
      </Link>
    </div>
  );
}
