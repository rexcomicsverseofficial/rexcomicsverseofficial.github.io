// Razorpay calls this after subscription events. It checks Razorpay's signature, then turns the
// reader's membership on (or extends it) until the end of the paid period.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRACE_SECONDS = 24 * 3600; // a day's slack for renewals that land a little late

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const body = await req.text();
  const given = req.headers.get("X-Razorpay-Signature") || "";
  if (given !== await hmacHex(secret, body)) return new Response("bad signature", { status: 401 });

  const event = JSON.parse(body);
  const sub = event?.payload?.subscription?.entity;
  const userId = sub?.notes?.user_id, tier = sub?.notes?.tier;
  if (!sub || !userId || !["fan", "hero"].includes(tier)) return new Response("ignored");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (["subscription.activated", "subscription.charged", "subscription.resumed"].includes(event.event)) {
    const until = new Date(((sub.current_end ?? 0) + GRACE_SECONDS) * 1000).toISOString();
    await admin.from("profiles").update({ tier, paid_until: until, razorpay_subscription_id: sub.id }).eq("id", userId);
  }
  // cancelled / halted / completed: nothing to do — access simply ends at paid_until.
  return new Response("ok");
});
