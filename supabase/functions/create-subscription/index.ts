// Starts a Razorpay monthly subscription for the signed-in reader and returns what the
// Razorpay Checkout on the website needs. The membership itself is only switched on by
// razorpay-webhook once Razorpay confirms the payment.
import { createClient } from "npm:@supabase/supabase-js@2";

const PLANS = {
  fan:  { name: "Dharma Fan (monthly)",   amount: 39900 }, // paise: ₹399
  hero: { name: "Patriot Hero (monthly)", amount: 79900 }, // ₹799
} as const;
type Tier = keyof typeof PLANS;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const keyId = Deno.env.get("RAZORPAY_KEY_ID"), keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "payments_not_ready" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "sign_in_required" }, 401);

  const { tier } = await req.json().catch(() => ({}));
  if (!(tier in PLANS)) return json({ error: "unknown_plan" }, 400);

  const rzp = async (path: string, body: unknown) => {
    const r = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.description || `Razorpay ${path} failed`);
    return data;
  };

  try {
    // Razorpay plans are created once and remembered (per key, so test and live keys don't mix).
    const settingKey = `plan_${tier}_${keyId}`;
    let { data: row } = await admin.from("app_settings").select("value").eq("key", settingKey).maybeSingle();
    let planId = row?.value;
    if (!planId) {
      const p = PLANS[tier as Tier];
      planId = (await rzp("plans", { period: "monthly", interval: 1,
        item: { name: p.name, amount: p.amount, currency: "INR" } })).id;
      await admin.from("app_settings").upsert({ key: settingKey, value: planId });
    }
    const sub = await rzp("subscriptions", {
      plan_id: planId, total_count: 120, customer_notify: 1,
      notes: { user_id: user.id, tier },
    });
    await admin.from("profiles").update({ razorpay_subscription_id: sub.id }).eq("id", user.id);
    return json({ subscription_id: sub.id, key_id: keyId, email: user.email });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
