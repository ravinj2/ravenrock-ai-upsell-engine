import { authenticate } from "../shopify.server";
import db from "../db.server";

function ok(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200, // ✅ altijd 200, anders geeft Shopify vaak HTML terug
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function clampString(v, max = 255) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function clampInt(v, min = 0, max = 999999) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

const ALLOWED_TYPES = new Set([
  "rr_widget_open",
  "rr_upsells_shown",
  "rr_add_to_cart",
  "rr_widget_close",
  "rr_fetch_error",
]);

// ✅ Handig: GET ping om te checken dat route “live” is
export async function loader({ request }) {
  try {
    const { session } = await authenticate.public.appProxy(request);
    return ok({ ok: true, method: "GET", shop: session?.shop || null });
  } catch (err) {
    console.error("[RavenRock] /events GET auth failed:", err);
    return ok({ ok: false, method: "GET", error: "unauthorized", message: String(err?.message || err) });
  }
}

export async function action({ request }) {
  try {
    if (request.method !== "POST") {
      return ok({ ok: false, method: request.method, error: "method_not_allowed" });
    }

    // 1) App Proxy auth
    let session;
    try {
      const auth = await authenticate.public.appProxy(request);
      session = auth?.session;
    } catch (err) {
      console.error("[RavenRock] /events POST auth failed:", err);
      return ok({ ok: false, method: "POST", error: "unauthorized", message: String(err?.message || err) });
    }

    const shop = session?.shop;
    if (!shop) return ok({ ok: false, error: "no_shop_context" });

    // 2) Parse JSON body (supports sendBeacon)
    let body = {};
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return ok({ ok: false, error: "invalid_json" });
    }

    const type = clampString(body?.type, 64);
    if (!type || !ALLOWED_TYPES.has(type)) {
      return ok({ ok: false, error: "invalid_type", type });
    }

    // 3) Minimal safe event payload (no PII)
    const data = {
      shop,
      type,
      sessionId: clampString(body?.sessionId, 64),
      path: clampString(body?.path, 255),
      productHandle: clampString(body?.productHandle, 255),
      currentVariant: clampString(body?.currentVariant, 64),
      upsellVariant: clampString(body?.upsellVariant, 64),
      count: clampInt(body?.count, 0, 100),
      trigger: clampString(body?.trigger, 32),
      analyticsAllowed: typeof body?.analyticsAllowed === "boolean" ? body.analyticsAllowed : null,
      meta: (() => {
        try {
          const m = body?.meta ?? {};
          const s = JSON.stringify(m);
          return s.length > 2000 ? s.slice(0, 2000) : s;
        } catch {
          return "{}";
        }
      })(),
    };

    // 4) Prisma model check (scheelt “undefined.create” crashes)
    if (!db?.widgetEvent?.create) {
      return ok({
        ok: false,
        error: "db_model_missing",
        hint: "WidgetEvent model not generated/migrated yet. Run prisma migrate + generate.",
      });
    }

    try {
      await db.widgetEvent.create({ data });
      return ok({ ok: true });
    } catch (err) {
      console.error("[RavenRock] /events db write failed:", err);
      return ok({
        ok: false,
        error: "db_error",
        message: String(err?.message || err),
      });
    }
  } catch (err) {
    console.error("[RavenRock] /events crashed:", err);
    return ok({ ok: false, error: "server_error", message: String(err?.message || err) });
  }
}
