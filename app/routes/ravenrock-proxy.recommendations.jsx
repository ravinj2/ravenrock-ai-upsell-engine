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

function parseIds(csv) {
  return String(csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fallback IDs voor development/testing
const DEV_FALLBACK_IDS = ["42910497210458", "42910497243226", "42910497177690"];

export async function loader({ request }) {
  console.log("[RavenRock DEBUG] Request received:", request.url);

  const url = new URL(request.url);

  // Wat de widget meestuurt
  const queryLimitRaw = Number(url.searchParams.get("limit") || "");
  const current = (url.searchParams.get("current_variant") || "").trim();
  const productHandle = (url.searchParams.get("product_handle") || "").trim();

  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    const shop = session?.shop;

    if (!shop) {
      return jsonResponse({ items: [], meta: { error: "no_shop_context" } });
    }

    // Settings ophalen (en als ze nog niet bestaan: default record maken)
    const settings = shop
      ? await db.settings.upsert({
          where: { shop },
          update: {},
          create: {
            shop,
            upsellMode: "collection",
            manualVariantIds: "",
            fallbackVariantIds: "",
            limit: 3,
            excludeGiftCards: true,
            excludeOutOfStock: true,
            widgetLocale: null,
          },
        })
      : null;

    const widgetLocale = settings?.widgetLocale || session?.locale || "en";

    // ✅ Stap 2 wijziging: mode moet overschrijfbaar zijn (degrade naar fallback)
    let mode = String(settings?.upsellMode || "collection").toLowerCase();

    // ✅ Stap 2: AI ticks + maand-reset + degrade bij limiet
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const aiEnabled = settings?.aiEnabled === true;
    const aiMonthlyLimit = Number(settings?.aiMonthlyLimit || 1000) || 1000;

    let aiCallsThisMonth = Number(settings?.aiCallsThisMonth || 0) || 0;
    let aiAllowed = aiEnabled ? true : false;
    let aiDegraded = false;

    if (aiEnabled) {
      // maand-reset als de maand veranderd is
      if ((settings?.aiUsageMonth || "") !== monthKey) {
        const reset = await db.settings.update({
          where: { shop },
          data: { aiUsageMonth: monthKey, aiCallsThisMonth: 0 },
        });
        aiCallsThisMonth = Number(reset.aiCallsThisMonth || 0) || 0;
      }

      // limiet check + tick increment (1 request = 1 tick)
      aiAllowed = aiCallsThisMonth < aiMonthlyLimit;

      if (aiAllowed) {
        const inc = await db.settings.update({
          where: { shop },
          data: { aiCallsThisMonth: { increment: 1 } },
        });
        aiCallsThisMonth = Number(inc.aiCallsThisMonth || 0) || 0;
      } else {
        // degrade naar fallback mode als ticks op zijn
        const fallbackMode = String(settings?.aiFallbackMode || "collection").toLowerCase();
        mode = fallbackMode;
        aiDegraded = true;
      }
    }

    // Limit: als widget een limit meestuurt, zien we dat als "cap"
    const settingsLimit = Number(settings?.limit || 3);
    const effectiveLimit = Math.min(
      Number.isFinite(queryLimitRaw) && queryLimitRaw > 0 ? queryLimitRaw : settingsLimit,
      6
    );

    // Fallback IDs: eerst uit DB, anders DEV_FALLBACK_IDS
    const fallbackIdsFromDb = parseIds(settings?.fallbackVariantIds);
    const fallbackIds = fallbackIdsFromDb.length ? fallbackIdsFromDb : DEV_FALLBACK_IDS;

    // Manual IDs: uit DB
    const manualIdsFromDb = parseIds(settings?.manualVariantIds);

    // --- Helper: fetch variant details via Admin API ---
    async function fetchVariant(variantId) {
      const query = `#graphql
        query Variant($id: ID!) {
          productVariant(id: $id) {
            id
            title
            price
            availableForSale
            image { url }
            product { title handle }
          }
        }`;

      const resp = await admin.graphql(query, {
        variables: { id: `gid://shopify/ProductVariant/${variantId}` },
      });
      const json = await resp.json();
      const v = json?.data?.productVariant;
      if (!v) return null;

      const title =
        v?.product?.title && v?.title ? `${v.product.title} — ${v.title}` : v?.title || "Upsell";

      return {
        variantId: variantId,
        title,
        price: v?.price ? `${v.price} ${session?.currency || ""}`.trim() : "",
        imageUrl: v?.image?.url || null,
        available: v?.availableForSale !== false,
        productHandle: v?.product?.handle || null,
      };
    }

    // --- Choose IDs based on mode ---
    let chosenVariantIds = [];

    if (mode === "manual" && manualIdsFromDb.length) {
      chosenVariantIds = manualIdsFromDb;
    } else if (mode === "fallback") {
      chosenVariantIds = fallbackIds;
    } else {
      // collection mode (MVP): use fallback if no data yet (we keep it simple)
      chosenVariantIds = fallbackIds;
    }

    // exclude current variant if present
    if (current) {
      chosenVariantIds = chosenVariantIds.filter((id) => id !== current);
    }

    chosenVariantIds = shuffle(chosenVariantIds).slice(0, effectiveLimit);

    const itemsRaw = await Promise.all(chosenVariantIds.map(fetchVariant));
    let items = itemsRaw.filter(Boolean);

    // filter out-of-stock if enabled
    if (settings?.excludeOutOfStock) {
      items = items.filter((it) => it.available !== false);
    }

    // map to widget payload
    const widgetItems = items.slice(0, effectiveLimit).map((it, idx) => ({
      variantId: it.variantId,
      title: it.title,
      price: it.price,
      imageUrl: it.imageUrl,
      reasonKey: mode === "manual" ? "handpicked" : "same_collection",
      rank: idx + 1,
    }));

    return jsonResponse({
      locale: widgetLocale,
      items: widgetItems,
      meta: {
        mode,
        current,
        productHandle,
        effectiveLimit,
        redirectToCart: settings?.redirectToCart !== false,
        ai: {
          enabled: aiEnabled,
          allowed: aiAllowed,
          degraded: aiDegraded,
          used: aiCallsThisMonth,
          limit: aiMonthlyLimit,
        },
      },
    });
  } catch (err) {
    console.error("[RavenRock] /recommendations crashed:", err);
    return jsonResponse({ items: [], meta: { error: true, message: String(err) } });
  }
}
