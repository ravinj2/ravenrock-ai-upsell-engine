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

export async function loader({ request }) {
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


if (!shop) {
  // Store heeft app niet geïnstalleerd of request is niet geldig via proxy
  return jsonResponse({ items: [], meta: { error: "no_shop_context" } });
}

    // Settings ophalen (en als ze nog niet bestaan: default record maken)
    const settings = shop
      ? await db.upsellSettings.upsert({
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
          },
        })
      : null;

    const mode = String(settings?.upsellMode || "collection").toLowerCase();

    // Limit: als widget een limit meestuurt, zien we dat als "cap"
    const settingsLimit = Number(settings?.limit || 3);
    const effectiveLimit = Math.min(
      Number.isFinite(queryLimitRaw) && queryLimitRaw > 0 ? queryLimitRaw : settingsLimit,
      6
    );

    // Fallback IDs: eerst uit DB, anders DEV_FALLBACK_IDS
    const fallbackIdsFromDb = parseIds(settings?.fallbackVariantIds);
    const fallbackIds = fallbackIdsFromDb.length ? fallbackIdsFromDb : DEV_FALLBACK_IDS;

    // Manual IDs: eerst query override (legacy), anders uit DB
    const manualIdsFromDb = parseIds(settings?.manualVariantIds);
    const manualIds = manualIdsFromDb;

// Als merchant nog niets heeft ingesteld, geen "magische" upsells tonen
if (mode === "manual" && manualIds.length === 0) {
  return jsonResponse({ items: [], meta: { mode, source: "no_manual_config" } });
}
if (mode !== "manual" && fallbackIds.length === 0 && !productHandle) {
  return jsonResponse({ items: [], meta: { mode, source: "no_fallback_config" } });
}


    // -------- Kandidaten bepalen op basis van mode --------
    let candidateIds = [];

    if (mode === "manual") {
      candidateIds = manualIds.length ? manualIds : fallbackIds;
    } else {
      // default: collection mode
      candidateIds = fallbackIds;

      // Als we product handle hebben: probeer dezelfde collectie te gebruiken
      if (productHandle) {
        const q1 = `
          query ByHandle($handle: String!) {
            productByHandle(handle: $handle) {
              id
              collections(first: 1) { nodes { id } }
            }
          }
        `;

        const r1 = await admin.graphql(q1, { variables: { handle: productHandle } });
        const j1 = await r1.json();

        const currentProductId = j1.data?.productByHandle?.id;
        const colId = j1.data?.productByHandle?.collections?.nodes?.[0]?.id;

        if (colId) {
          const q2 = `
            query FromCollection($id: ID!) {
              collection(id: $id) {
                products(first: 10) {
                  nodes {
                    id
                    variants(first: 10) { nodes { id } }
                  }
                }
              }
            }
          `;

          const r2 = await admin.graphql(q2, { variables: { id: colId } });
          const j2 = await r2.json();

          const ids = (j2.data?.collection?.products?.nodes || [])
            .filter((p) => p.id !== currentProductId)
            .flatMap((p) => (p.variants?.nodes || []).map((v) => v.id))
            .filter(Boolean)
            .map((gid) => gid.split("/").pop());

          if (ids.length) candidateIds = ids;
        }
      }
    }

    // -------- Overfetch pool (zodat filters niet alles weggooien) --------
    const uniqueCandidates = Array.from(new Set(candidateIds)).filter(Boolean);
    const pool = shuffle(uniqueCandidates).filter((id) => id !== current);

    const TARGET = Math.min(effectiveLimit * 5, 30);
    let useIds = pool.slice(0, TARGET);

    // Vul aan met fallback als pool te klein is
    if (useIds.length < TARGET) {
      const extra = fallbackIds
        .filter((id) => id !== current && !useIds.includes(id))
        .slice(0, TARGET - useIds.length);
      useIds = useIds.concat(extra);
    }

    useIds = Array.from(new Set(useIds)).filter(Boolean);
    if (!useIds.length) return jsonResponse({ items: [], meta: { mode, source: "empty" } });

    // Shopify GIDs
    const gids = useIds.map((id) => `gid://shopify/ProductVariant/${id}`);

    const query = `
      query VariantCards($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            price
            availableForSale
            image { url altText }
            product { title isGiftCard featuredImage { url altText } }
          }
        }
      }
    `;

    const resp = await admin.graphql(query, { variables: { ids: gids } });
    const payload = await resp.json();

    const nodesAll = (payload.data?.nodes || []).filter(Boolean);

    // Respecteer je settings:
    const excludeOutOfStock = settings?.excludeOutOfStock !== false; // default true
    const excludeGiftCards = settings?.excludeGiftCards !== false;   // default true

    const nodesFiltered = nodesAll.filter((v) => {
      if (excludeOutOfStock && !v.availableForSale) return false;
      if (excludeGiftCards && v.product?.isGiftCard) return false;
      return true;
    });

    const nodesFinal = nodesFiltered.slice(0, effectiveLimit);

    const items = nodesFinal.map((v) => {
      const variantId = v.id.split("/").pop();
      const variantTitle = (v.title || "").trim();
      const niceVariant =
        variantTitle && variantTitle !== "Default Title" ? ` — ${variantTitle}` : "";

      const title = `${v.product?.title || ""}${niceVariant}`.trim();

      return {
        variantId,
        title,
        price: v.price ? String(v.price) : "",
        imageUrl: v.image?.url || v.product?.featuredImage?.url || null,
      };
    });

    // meta is alleen voor jouw debug/test (widget negeert dit)
    return jsonResponse({
      items,
      meta: {
        mode,
        limit: effectiveLimit,
        usedCandidates: candidateIds.length,
        source:
          mode === "manual"
            ? (manualIds.length ? "manual_db_or_query" : "fallback")
            : (productHandle ? "collection_or_fallback" : "fallback"),
      },
    });
  } catch (err) {
    console.error("[RavenRock] /recommend crashed:", err);
    return jsonResponse({ items: [], meta: { error: true, message: String(err) } });
  }
}
