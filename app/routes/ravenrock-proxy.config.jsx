import { authenticate } from "../shopify.server";
import db from "../db.server";

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function loader({ request }) {
  try {
    const { session } = await authenticate.public.appProxy(request);
    const shop = session?.shop;

    if (!shop) {
      return jsonResponse({ error: "no_shop_context" });
    }

    const settings = await db.Settings.findFirst({ where: { shop } });

    // Defaults (MVP 1.1 Pakket A)
    const triggerType = (settings?.triggerType || "scroll").toLowerCase(); // "scroll" | "time"
    const triggerDelaySec = Number(settings?.triggerDelaySec ?? 20) || 20;

    const locale = settings?.widgetLocale || session?.locale || "en";

    return jsonResponse({
      triggerType,
      triggerDelaySec,
      frequencyHours: 24,
      locale,
      redirectToCart: settings?.redirectToCart !== false,
      ai: {
        enabled: settings?.aiEnabled === true,
        used: Number(settings?.aiCallsThisMonth || 0) || 0,
        limit: Number(settings?.aiMonthlyLimit || 0) || 0,
      },
    });
  } catch (err) {
    console.error("[RavenRock] /config crashed:", err);
    return jsonResponse({ error: true, message: String(err) });
  }
}
