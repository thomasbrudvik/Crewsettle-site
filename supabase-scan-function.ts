// CrewSettle: read a fish ticket or receipt photo with Claude.
// The API key is stored as the secret ANTHROPIC_API_KEY, never in the app.
const CORS = {
  "Access-Control-Allow-Origin": "https://crewsettle.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TICKET = `The image(s) show one US commercial fishing fish ticket (a landing receipt, an ADF&G fish ticket or eLandings ticket, or a settlement from a seafood buyer). Several images are pages of the same ticket.
Read it and reply with only this JSON:
{"ticket_number": string or null, "buyer": string or null, "date": string or null,
 "lines": [{"species": string, "pounds": number, "price_per_lb": number or null}],
 "deductions": [{"description": string, "amount": number}],
 "readable": true or false, "note": string or null}
Rules: one entry in "lines" per species/grade line that was sold. "species" is the plain species name without the numeric species code, with the product condition in brackets when it is not whole/round, for example "Sablefish (cut)" for "710 Sablefish, 08 Est cut", or "Longnose skate (wings)". "pounds" is the weight on that line that the buyer pays on (the scale, sold or landed weight on the line), not a round-weight figure from a summary elsewhere on the ticket; if the ticket shows kilograms, convert to pounds (1 kg = 2.20462 lb). "price_per_lb" is the price paid per pound in US dollars; if only a line amount is shown, divide it by the pounds. Many ADF&G tickets have no prices because the buyer pays later: then set "price_per_lb" to null and keep the line. Leave out lines that were not sold (discards, personal use, confiscated, research). Put amounts the buyer took off the ticket (taxes, assessments, ice, bait, fuel, advances) in "deductions" as positive numbers; leave out empty tax boxes. Never guess a number you cannot read: leave that line out and say so in "note". If this is not a fish ticket, set "readable" to false and explain in "note".`;
const RECEIPT = `The image(s) show one receipt or invoice for a commercial fishing trip. Several images are pages of the same document.
Read it and reply with only this JSON:
{"vendor": string or null, "date": string or null, "total": number or null,
 "lines": [{"category": one of "Fuel","Bait","Ice","Groceries","Lube oil","Observer fee","Landing fees","Gear & supplies","Repairs","Other",
   "description": short plain description, e.g. "Diesel #2",
   "quantity": number or null, "unit": string or null, "unit_price": number or null, "amount": number}],
 "readable": true or false, "note": string or null}
Rules: one entry in "lines" per item or charge on the receipt, in US dollars. "amount" is what that line costs. "quantity", "unit" and "unit_price" are for example 2350, "gal" and 4.29 for diesel; null if not shown. If the receipt has many small items of the same kind (for example a grocery bill), give one line per category with the summed amount and quantity null. Put tax, delivery or other surcharges in their own line with category "Other", unless they clearly belong to one item. "total" is the final amount due; the line amounts must add up to it. If they do not, say so in "note". Never guess a number you cannot read: set it to null and say so in "note". If this is not a receipt or invoice, set "readable" to false and explain in "note".`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });

  // Only signed-in CrewSettle users may scan.
  const auth = req.headers.get("Authorization") ?? "";
  const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  if (!who.ok) return json(401, { error: "session_expired" });

  let body: { kind?: string; images?: { media_type: string; data: string }[] };
  try { body = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const kind = body.kind === "ticket" ? "ticket" : body.kind === "receipt" ? "receipt" : null;
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  if (!kind || !images.length) return json(400, { error: "bad_request" });
  for (const im of images) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(im.media_type) || typeof im.data !== "string" || im.data.length > 6_000_000)
      return json(413, { error: "image_rejected" });
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json(500, { error: "not_configured" });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: [
          ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
          { type: "text", text: kind === "ticket" ? TICKET : RECEIPT },
        ],
      }],
    }),
  });
  if (r.status === 429) return json(429, { error: "rate_limited" });
  if (!r.ok) return json(502, { error: "upstream", status: r.status, detail: (await r.text()).slice(0, 300) });
  const out = await r.json();
  const text = (out.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return json(422, { error: "invalid_json" });
  try { return json(200, { result: JSON.parse(m[0]) }); } catch { return json(422, { error: "invalid_json" }); }
});
