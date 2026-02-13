import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { useCallback, useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await db.upsellSettings.upsert({
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
  });

  return { settings };
}

function normalizeVariantIds(input) {
  const raw = String(input || "");
  const matches = raw.match(/\d{6,}/g) || [];
  const uniq = [];
  for (const m of matches) if (!uniq.includes(m)) uniq.push(m);
  return uniq.join(",");
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();

  const upsellMode = String(form.get("upsellMode") || "collection");
  const manualVariantIds = normalizeVariantIds(form.get("manualVariantIds"));
  const fallbackVariantIds = normalizeVariantIds(form.get("fallbackVariantIds"));
  const limit = Math.min(Math.max(Number(form.get("limit") || 3), 1), 6);

  const excludeGiftCards = form.get("excludeGiftCards") === "on";
  const excludeOutOfStock = form.get("excludeOutOfStock") === "on";

  await db.upsellSettings.upsert({
    where: { shop },
    update: {
      upsellMode,
      manualVariantIds,
      fallbackVariantIds,
      limit,
      excludeGiftCards,
      excludeOutOfStock,
    },
    create: {
      shop,
      upsellMode,
      manualVariantIds,
      fallbackVariantIds,
      limit,
      excludeGiftCards,
      excludeOutOfStock,
    },
  });

  return { ok: true };
}

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const shopify = useAppBridge();

  // Controlled state
  const [upsellMode, setUpsellMode] = useState(settings.upsellMode || "collection");
  const [manualVariantIds, setManualVariantIds] = useState(settings.manualVariantIds || "");
  const [fallbackVariantIds, setFallbackVariantIds] = useState(settings.fallbackVariantIds || "");
  const [limit, setLimit] = useState(Number(settings.limit || 3));
  const [excludeGiftCards, setExcludeGiftCards] = useState(!!settings.excludeGiftCards);
  const [excludeOutOfStock, setExcludeOutOfStock] = useState(!!settings.excludeOutOfStock);

  function toCsv(ids) {
    const uniq = Array.from(new Set(ids.map(String).map((s) => s.trim()).filter(Boolean)));
    return uniq.join(",");
  }

  function extractNumericId(maybeGid) {
    const s = String(maybeGid || "");
    const last = s.split("/").pop() || "";
    return last.replace(/\D/g, "");
  }

  function countCsv(csv) {
    return String(csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length;
  }

  async function pickVariants(setter) {
  try {
    // 1) Als jouw template resourcePicker al aanbiedt (werkt soms wel)
    if (shopify && typeof shopify.resourcePicker === "function") {
      const selected = await shopify.resourcePicker({
        type: "variant",
        multiple: true,
        action: "select",
      });

      if (!selected) return;

      const arr = Array.isArray(selected)
        ? selected
        : Array.isArray(selected?.selection)
          ? selected.selection
          : [];

      const ids = arr.map((r) => extractNumericId(r?.id)).filter(Boolean);
      if (ids.length) setter(toCsv(ids));
      return;
    }

    // 2) Fallback: App Bridge actions ResourcePicker (werkt in embedded apps)
    const mod = await import("@shopify/app-bridge/actions");
    const ResourcePicker = mod.ResourcePicker;

    if (!ResourcePicker || !shopify) {
      throw new Error("ResourcePicker or App Bridge instance missing");
    }

    // Probeer juiste resourceType (verschilt per versie)
    const resourceType =
      (ResourcePicker.ResourceType && (ResourcePicker.ResourceType.ProductVariant || ResourcePicker.ResourceType.Variant)) ||
      "ProductVariant";

    const picker = ResourcePicker.create(shopify, {
      resourceType,
      options: { selectMultiple: true },
    });

    let handled = false;

    picker.subscribe(ResourcePicker.Action.CANCEL, () => {
      handled = true;
    });

    picker.subscribe(ResourcePicker.Action.SELECT, (payload) => {
      if (handled) return;
      handled = true;

      const selection = payload?.selection || [];
      const ids = (Array.isArray(selection) ? selection : [])
        .map((r) => extractNumericId(r?.id))
        .filter(Boolean);

      if (ids.length) setter(toCsv(ids));

      // netjes sluiten
      try {
        picker.dispatch(ResourcePicker.Action.CLOSE);
      } catch {}
    });

    picker.dispatch(ResourcePicker.Action.OPEN);
  } catch (err) {
    console.error("[RavenRock] pickVariants failed:", err);
    alert("Variant picker failed. Check console (F12) for details.");
  }
}


  return (
    <div className="rr-admin">
      <style>{`
        :root{
          --rr-bg:#f6f6f7;
          --rr-card:#ffffff;
          --rr-border:#e1e3e5;
          --rr-text:#202223;
          --rr-muted:#6d7175;
          --rr-primary:#008060;
          --rr-primary-dark:#006e52;
          --rr-danger:#d72c0d;
          --rr-radius:14px;
        }

        .rr-admin{
          background:var(--rr-bg);
          color:var(--rr-text);
          min-height:100vh;
          padding:24px 18px;
          font-family: -apple-system,BlinkMacSystemFont,"San Francisco","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        }

        .rr-wrap{
          max-width: 980px;
          margin: 0 auto;
        }

        .rr-top{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:16px;
          margin-bottom:16px;
        }

        .rr-title{
          font-size:22px;
          font-weight:700;
          margin:0;
          line-height:1.2;
        }

        .rr-sub{
          margin:6px 0 0;
          color:var(--rr-muted);
          font-size:14px;
          line-height:1.35;
        }

        .rr-actions{
          display:flex;
          gap:10px;
          align-items:center;
        }

        .rr-btn{
          border:1px solid var(--rr-border);
          background:#fff;
          color:var(--rr-text);
          padding:10px 14px;
          border-radius:12px;
          font-weight:600;
          cursor:pointer;
          font-size:14px;
        }
        .rr-btn:hover{ filter:brightness(0.98); }

        .rr-btn-primary{
          background:var(--rr-primary);
          border-color:var(--rr-primary);
          color:#fff;
        }
        .rr-btn-primary:hover{ background:var(--rr-primary-dark); }

        .rr-btn-danger{
          border-color:rgba(215,44,13,.25);
          color:var(--rr-danger);
          background:#fff;
        }

        .rr-grid{
          display:grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap:16px;
        }
        @media (max-width: 920px){
          .rr-grid{ grid-template-columns: 1fr; }
        }

        .rr-card{
          background:var(--rr-card);
          border:1px solid var(--rr-border);
          border-radius: var(--rr-radius);
          padding:16px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.02);
        }

        .rr-card h3{
          margin:0 0 12px;
          font-size:16px;
          font-weight:700;
        }

        .rr-field{ margin-bottom:14px; }
        .rr-label{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          font-weight:600;
          font-size:14px;
          margin-bottom:6px;
        }
        .rr-help{
          color:var(--rr-muted);
          font-size:12.5px;
          line-height:1.35;
          margin-top:6px;
        }

        .rr-input, .rr-select, .rr-textarea{
          width:100%;
          border:1px solid var(--rr-border);
          border-radius:12px;
          padding:10px 12px;
          font-size:14px;
          background:#fff;
          outline:none;
        }
        .rr-textarea{ min-height:92px; resize:vertical; }
        .rr-input:focus, .rr-select:focus, .rr-textarea:focus{
          border-color: rgba(0,128,96,.6);
          box-shadow: 0 0 0 3px rgba(0,128,96,.12);
        }

        .rr-row{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
        }

        .rr-pill{
          font-size:12px;
          color:var(--rr-muted);
          background:#f1f2f3;
          border:1px solid var(--rr-border);
          padding:6px 10px;
          border-radius:999px;
        }

        .rr-toggle{
          display:flex;
          align-items:flex-start;
          gap:10px;
          padding:10px 12px;
          border:1px solid var(--rr-border);
          border-radius:12px;
          background:#fff;
        }
        .rr-toggle input{ margin-top:3px; }
        .rr-toggle-title{ font-weight:650; font-size:14px; margin:0; }
        .rr-toggle-sub{ margin:4px 0 0; color:var(--rr-muted); font-size:12.5px; line-height:1.35; }
        
        .rr-footer{
          display:flex;
          justify-content:flex-end;
          margin-top:14px;
        }

        .rr-note{
          border-left:4px solid rgba(0,128,96,.5);
          background: rgba(0,128,96,.06);
          padding:10px 12px;
          border-radius:12px;
          color:var(--rr-text);
          font-size:13px;
          line-height:1.35;
        }
      `}</style>

      <div className="rr-wrap">
        <div className="rr-top">
          <div>
            <h1 className="rr-title">RavenRock Upsell — Settings</h1>
            <p className="rr-sub">
              Configureer hoe upsells worden gekozen. Gebruik de “Pick” knoppen om varianten te selecteren zonder IDs te plakken.
            </p>
          </div>

          <div className="rr-actions">
            <button
              type="button"
              className="rr-btn"
              onClick={() => {
                // reset UI naar opgeslagen defaults (snelle rescue)
                setUpsellMode(settings.upsellMode || "collection");
                setManualVariantIds(settings.manualVariantIds || "");
                setFallbackVariantIds(settings.fallbackVariantIds || "");
                setLimit(Number(settings.limit || 3));
                setExcludeGiftCards(!!settings.excludeGiftCards);
                setExcludeOutOfStock(!!settings.excludeOutOfStock);
              }}
            >
              Reset (UI)
            </button>
            <button type="submit" form="rr-settings-form" className="rr-btn rr-btn-primary">
              Save
            </button>
          </div>
        </div>

        <Form id="rr-settings-form" method="post">
          <div className="rr-grid">
            <div className="rr-card">
              <h3>Upsell selection</h3>

              <div className="rr-field">
                <div className="rr-label">
                  <span>Upsell mode</span>
                  <span className="rr-pill">{upsellMode === "manual" ? "Manual" : "Collection"}</span>
                </div>

                <select
                  className="rr-select"
                  name="upsellMode"
                  value={upsellMode}
                  onChange={(e) => setUpsellMode(e.target.value)}
                >
                  <option value="collection">collection</option>
                  <option value="manual">manual</option>
                </select>

                <div className="rr-help">
                  <b>collection</b> = probeer dezelfde collectie als het product. <b>manual</b> = gebruik jouw gekozen variant lijst.
                </div>
              </div>

              <div className="rr-field">
                <div className="rr-label">
                  <span>Manual variant IDs (csv)</span>
                  <span className="rr-pill">{countCsv(manualVariantIds)} selected</span>
                </div>

                <div className="rr-row" style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className="rr-btn rr-btn-primary"
                    onClick={() => pickVariants(setManualVariantIds)}
                  >
                    Pick manual variants
                  </button>
                  <button
                    type="button"
                    className="rr-btn rr-btn-danger"
                    onClick={() => setManualVariantIds("")}
                  >
                    Clear
                  </button>
                </div>

                <textarea
                  className="rr-textarea"
                  name="manualVariantIds"
                  rows={3}
                  value={manualVariantIds}
                  onChange={(e) => setManualVariantIds(e.target.value)}
                  placeholder="Klik op ‘Pick manual variants’ (geen IDs plakken)"
                />

                <div className="rr-help">
                  Tip: zet <b>Upsell mode = manual</b> om deze lijst te gebruiken.
                </div>
              </div>

              <div className="rr-field">
                <div className="rr-label">
                  <span>Fallback variant IDs (csv)</span>
                  <span className="rr-pill">{countCsv(fallbackVariantIds)} selected</span>
                </div>

                <div className="rr-row" style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className="rr-btn rr-btn-primary"
                    onClick={() => pickVariants(setFallbackVariantIds)}
                  >
                    Pick fallback variants
                  </button>
                  <button
                    type="button"
                    className="rr-btn rr-btn-danger"
                    onClick={() => setFallbackVariantIds("")}
                  >
                    Clear
                  </button>
                </div>

                <textarea
                  className="rr-textarea"
                  name="fallbackVariantIds"
                  rows={3}
                  value={fallbackVariantIds}
                  onChange={(e) => setFallbackVariantIds(e.target.value)}
                  placeholder="Klik op ‘Pick fallback variants’"
                />

                <div className="rr-help">
                  Fallback wordt gebruikt als de collection flow niets oplevert (MVP-safe).
                </div>
              </div>
            </div>

            <div>
              <div className="rr-card" style={{ marginBottom: 16 }}>
                <h3>Rules</h3>

                <div className="rr-field">
                  <div className="rr-label">
                    <span>Limit (1–6)</span>
                    <span className="rr-pill">{limit}</span>
                  </div>
                  <input
                    className="rr-input"
                    name="limit"
                    type="number"
                    min={1}
                    max={6}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  />
                  <div className="rr-help">Maximaal aantal upsells dat je widget toont.</div>
                </div>

                <label className="rr-toggle">
                  <input
                    name="excludeGiftCards"
                    type="checkbox"
                    checked={excludeGiftCards}
                    onChange={(e) => setExcludeGiftCards(e.target.checked)}
                  />
                  <div>
                    <p className="rr-toggle-title">Exclude gift cards</p>
                    <p className="rr-toggle-sub">Filter gift cards uit de aanbevelingen.</p>
                  </div>
                </label>

                <div style={{ height: 10 }} />

                <label className="rr-toggle">
                  <input
                    name="excludeOutOfStock"
                    type="checkbox"
                    checked={excludeOutOfStock}
                    onChange={(e) => setExcludeOutOfStock(e.target.checked)}
                  />
                  <div>
                    <p className="rr-toggle-title">Exclude out of stock</p>
                    <p className="rr-toggle-sub">Toon alleen varianten die op voorraad zijn.</p>
                  </div>
                </label>

                <div className="rr-footer">
                  <button type="submit" className="rr-btn rr-btn-primary">
                    Save
                  </button>
                </div>
              </div>

              <div className="rr-note">
                <b>Smoke test (1 minuut):</b><br />
                1) Kies <b>manual</b> → Pick 2 varianten → Save<br />
                2) Ga naar een productpagina → open RavenRock widget → Add to cart
              </div>
            </div>
          </div>
        </Form>
      </div>
    </div>
  );
}


