import "@supabase/functions-js/edge-runtime.d.ts"

type JsonRecord = Record<string, unknown>;

function getRootCI(body: JsonRecord, name: string): unknown {
  const want = name.toLowerCase();
  for (const [k, val] of Object.entries(body)) {
    if (k.toLowerCase() === want) return val;
  }
  return undefined;
}

function parseUrlEncodedToRecord(s: string): JsonRecord {
  const params = new URLSearchParams(s);
  const out: JsonRecord = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

async function readBody(req: Request): Promise<JsonRecord> {
  const text = (await req.text()).trim();
  if (!text) return {};
  try {
    const o = JSON.parse(text) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
  } catch {
    return parseUrlEncodedToRecord(text);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function notificationToken(body: JsonRecord, password: string): Promise<string> {
  const pairs: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (key === "Token") continue;
    if (val === undefined || val === null) continue;
    if (typeof val === "object") continue;
    pairs.push({ key, value: String(val) });
  }
  pairs.push({ key: "Password", value: password });
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  return sha256Hex(pairs.map((p) => p.value).join(""));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const password = Deno.env.get("TBANK_PASSWORD")?.trim() || Deno.env.get("TINKOFF_PASSWORD")?.trim();
  const terminalKey = Deno.env.get("TBANK_TERMINAL_KEY")?.trim() || Deno.env.get("TINKOFF_TERMINAL_KEY")?.trim();
  if (!password || !terminalKey) {
    return new Response("CONFIG", { status: 500 });
  }

  const body = await readBody(req);
  const receivedToken = typeof body.Token === "string" ? body.Token : "";
  const expected = await notificationToken(body, password);
  if (!receivedToken || receivedToken !== expected) {
    return new Response("FORBIDDEN", { status: 403 });
  }

  const tk = typeof body.TerminalKey === "string" ? body.TerminalKey : "";
  if (tk && tk !== terminalKey) {
    return new Response("FORBIDDEN", { status: 403 });
  }

  console.log("[tbank-notification] ok", {
    OrderId: getRootCI(body, "OrderId"),
    PaymentId: getRootCI(body, "PaymentId"),
    Status: getRootCI(body, "Status"),
    Success: getRootCI(body, "Success"),
    Amount: getRootCI(body, "Amount"),
    NotificationType: getRootCI(body, "NotificationType"),
  });
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
