(function () {
  // Prevent double-load
  if (window.__RAVENROCK_UPSELL_LOADED__) return;
  window.__RAVENROCK_UPSELL_LOADED__ = true;

  const PROXY_PATH = "/apps/ravenrock";
  const LIMIT = 3;

  // Debug helpers
  const QS = new URLSearchParams(location.search);
  const DEBUG = QS.has("rr_debug");
  const RESET = QS.has("rr_reset");
  const rrLog = (...args) => DEBUG && console.log("[RavenRock DEBUG]", ...args);

  // --- Safe storage (avoid Safari/private quirks) ---
  function safeStorage(type) {
    try {
      const s = window[type];
      if (!s) return null;
      const k = "__rr_test__";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }
  const PERSIST = safeStorage("localStorage");
  const SESSION = safeStorage("sessionStorage") || PERSIST;

  function pGet(key) { try { return PERSIST ? PERSIST.getItem(key) : null; } catch { return null; } }
  function pSet(key, val) { try { if (PERSIST) PERSIST.setItem(key, String(val)); } catch {} }
  function pDel(key) { try { if (PERSIST) PERSIST.removeItem(key); } catch {} }

  function sGet(key) { try { return SESSION ? SESSION.getItem(key) : null; } catch { return null; } }
  function sSet(key, val) { try { if (SESSION) SESSION.setItem(key, String(val)); } catch {} }
  function sDel(key) { try { if (SESSION) SESSION.removeItem(key); } catch {} }

  // --- Frequency cap (24h default) ---
  const RR_NEXT_ALLOWED_KEY = "rr_next_allowed_at";
  const RR_FREQ_HOURS_DEFAULT = 24;

  // --- Product session keys ---
  const RR_SEEN_PRODUCT_KEY = "rr_seen_product";
  const RR_FIRST_PRODUCT_AT_KEY = "rr_first_product_at";
  const RR_SELECTED_AT_KEY = "rr_selected_at";

  // Defaults (works even if proxy/config is down)
  let RR_CONFIG = {
    triggerType: "time",
    triggerDelaySec: 20,
    upsellDelaySec: 2,
    autoOpen: true,
    frequencyHours: RR_FREQ_HOURS_DEFAULT,
    locale: "en",
    redirectToCart: true,
  };

  let REDIRECT_TO_CART = true;
  let LOCALE = "en";
  let TRANSLATIONS = {
    modal_title: "RavenRock Upsell",
    recommended_addons: "Recommended add-ons:",
    add: "Add",
    added: "Added ✓",
    adding: "Adding…",
    loading: "Loading…",
    fetching: "Fetching upsells",
    no_recommendations: "No recommendations yet",
    select_variants: "Select variants in the app settings.",
    load_failed: "Could not load upsells",
    check_console: "Open console for details",
    close: "Close",
    reason_handpicked: "Handpicked by the store",
    reason_same_collection: "From the same collection",
    reason_store_picks: "Store picks",
  };

  function nowMs() { return Date.now(); }

  function getNextAllowedAt() {
    const raw = pGet(RR_NEXT_ALLOWED_KEY);
    const ms = raw ? Number(raw) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }
  function isAllowedNow() { return nowMs() >= getNextAllowedAt(); }

  function setSnoozeHours(hours) {
    const h = Number(hours) || RR_FREQ_HOURS_DEFAULT;
    const ms = nowMs() + h * 60 * 60 * 1000;
    pSet(RR_NEXT_ALLOWED_KEY, ms);
    return ms;
  }

  // Reset helper for fast testing
  if (RESET) {
    rrLog("Resetting gating keys");
    pDel(RR_NEXT_ALLOWED_KEY);
    sDel(RR_SEEN_PRODUCT_KEY);
    sDel(RR_FIRST_PRODUCT_AT_KEY);
    sDel(RR_SELECTED_AT_KEY);
  }

  function t(key) { return TRANSLATIONS[key] || key; }

  // Shopify root
  const root =
    window.Shopify && Shopify.routes && Shopify.routes.root ? Shopify.routes.root : "/";

  function getProductHandle() {
    const p = window.location.pathname || "";
    return p.startsWith("/products/") ? (p.split("/products/")[1] || "").split("/")[0] : "";
  }

  function getCurrentVariantId() {
    const fromUrl = new URLSearchParams(window.location.search).get("variant");
    if (fromUrl) return fromUrl;
    const fromForm = document.querySelector('form[action*="/cart/add"] input[name="id"]')?.value;
    return fromForm || "";
  }

  function getShopDomain() {
    const cfg = document.getElementById("ravenrock-config");
    return (cfg?.dataset?.shop || (window.Shopify && Shopify.shop) || "").trim();
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---- Network helpers with timeout (don’t block widget) ----
  async function fetchWithTimeout(url, options = {}, timeoutMs = 2000) {
    const controller = ("AbortController" in window) ? new AbortController() : null;
    const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetch(url, { ...options, signal: controller?.signal });
      return res;
    } finally {
      if (id) clearTimeout(id);
    }
  }

  async function fetchRRConfigBg() {
    try {
      const res = await fetchWithTimeout(PROXY_PATH + "/config", { credentials: "same-origin" }, 2000);
      if (!res.ok) throw new Error(`config ${res.status}`);
      const cfg = await res.json();

      RR_CONFIG = {
        triggerType: (cfg?.triggerType || "time").toLowerCase(),
        triggerDelaySec: Number(cfg?.triggerDelaySec ?? 20) || 20,
        upsellDelaySec: Number(cfg?.upsellDelaySec ?? 2) || 2,
        autoOpen: typeof cfg?.autoOpen === "boolean" ? cfg.autoOpen : true,
        frequencyHours: Number(cfg?.frequencyHours ?? RR_FREQ_HOURS_DEFAULT) || RR_FREQ_HOURS_DEFAULT,
        locale: cfg?.locale || "en",
        redirectToCart: typeof cfg?.redirectToCart === "boolean" ? cfg.redirectToCart : true,
      };

      LOCALE = RR_CONFIG.locale || "en";
      REDIRECT_TO_CART = RR_CONFIG.redirectToCart !== false;

      rrLog("Config loaded", RR_CONFIG);

      // Re-arm trigger if delay changed
      setupTrigger();
    } catch (e) {
      rrLog("Config fetch failed (using defaults)", e?.message || e);
    }
  }

  async function loadTranslationsBg(locale) {
    const lang = locale?.toLowerCase().startsWith("nl") ? "nl" : "en";
    try {
      const res = await fetchWithTimeout(`${PROXY_PATH}/translations?locale=${lang}`, {}, 2000);
      if (res.ok) {
        TRANSLATIONS = await res.json();
        rrLog("Translations loaded", lang);
        renderModal(); // refresh texts
      }
    } catch (e) {
      rrLog("Translations fetch failed (fallback stays)", e?.message || e);
    }
  }

  // ---- Product marking ----
  function markProductSeen() {
    sSet(RR_SEEN_PRODUCT_KEY, "1");
    if (!sGet(RR_FIRST_PRODUCT_AT_KEY)) sSet(RR_FIRST_PRODUCT_AT_KEY, String(nowMs()));
  }
  function hasSeenProduct() { return sGet(RR_SEEN_PRODUCT_KEY) === "1"; }
  function getFirstProductAtMs() {
    const raw = sGet(RR_FIRST_PRODUCT_AT_KEY);
    const ms = raw ? Number(raw) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  function markProductSelected() { sSet(RR_SELECTED_AT_KEY, String(nowMs())); }
  function getSelectedAtMs() {
    const raw = sGet(RR_SELECTED_AT_KEY);
    const ms = raw ? Number(raw) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  // ---- UI ----
  const btn = document.createElement("button");
  btn.id = "ravenrock-upsell-btn";
  btn.type = "button";
  btn.textContent = "RavenRock";
  btn.hidden = true;

  const backdrop = document.createElement("div");
  backdrop.id = "ravenrock-upsell-backdrop";
  backdrop.hidden = true;

  const modal = document.createElement("div");
  modal.id = "ravenrock-upsell-modal";
  modal.hidden = true;

  function mountUI() {
    if (document.getElementById("ravenrock-upsell-btn")) return true;
    if (!document.body) return false;
    document.body.append(btn, backdrop, modal);
    return true;
  }
  if (!mountUI()) document.addEventListener("DOMContentLoaded", mountUI, { once: true });

  function closeModal() {
    backdrop.hidden = true;
    modal.hidden = true;
    // Apply cap when user closes (MVP: show max once per period)
    setSnoozeHours(RR_CONFIG.frequencyHours || RR_FREQ_HOURS_DEFAULT);
  }

  backdrop.addEventListener("click", closeModal);

  function renderModal() {
    modal.innerHTML = `
      <div class="rr-header">
        <div class="rr-title">${t("modal_title")}</div>
        <button class="rr-close" type="button" aria-label="${t("close")}">×</button>
      </div>
      <div class="rr-body">
        <div class="rr-subtitle">${t("recommended_addons")}</div>
        <div class="rr-cards" id="rr-cards"></div>
      </div>
    `;

    modal.querySelector(".rr-close")?.addEventListener("click", closeModal);

    const cardsEl = modal.querySelector("#rr-cards");
    if (cardsEl && !cardsEl.dataset.rrBound) {
      cardsEl.dataset.rrBound = "1";
      cardsEl.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-variant]");
        if (!b) return;

        b.disabled = true;
        const original = b.textContent;
        b.textContent = t("adding");

        try {
          await addToCart(b.getAttribute("data-variant"));
          b.textContent = t("added");

          if (REDIRECT_TO_CART) {
            window.location.href = root + "cart";
          } else {
            await refreshCartUI();
          }
        } catch (err) {
          console.error("[RavenRock] addToCart failed", err);
          b.textContent = original;
          b.disabled = false;
        }
      });
    }
  }

  async function refreshCartUI() {
    try {
      const cart = await fetch(root + "cart.js", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }).then(r => r.json());

      document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart } }));
      rrLog("Cart UI refreshed", cart?.item_count);
    } catch (e) {
      rrLog("refreshCartUI failed", e?.message || e);
    }
  }

  function openModal({ delayUpsellsMs = 0 } = {}) {
    // Apply cap once modal is actually shown
    setSnoozeHours(RR_CONFIG.frequencyHours || RR_FREQ_HOURS_DEFAULT);

    backdrop.hidden = false;
    modal.hidden = false;
    loadUpsells(delayUpsellsMs);
  }

  function showButton() {
    btn.hidden = false;
  }

  // Manual open
  btn.addEventListener("click", () => {
    openModal({ delayUpsellsMs: (Number(RR_CONFIG.upsellDelaySec || 2) * 1000) });
  });

  // ---- Upsells ----
  async function fetchUpsells() {
    const params = new URLSearchParams();
    const variant = getCurrentVariantId();
    if (variant) params.set("current_variant", variant);

    const handle = getProductHandle();
    if (handle) params.set("product_handle", handle);

    const shop = getShopDomain();
    if (shop) params.set("shop", shop);

    const url = PROXY_PATH + "/recommendations?" + params.toString();

    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Upsell fetch failed: " + res.status);
    return res.json();
  }

  async function addToCart(variantId) {
    const id = String(variantId || "").trim();
    if (!id) throw new Error("Missing variantId");

    const res = await fetch(root + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: new URLSearchParams({ id, quantity: "1" }).toString(),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.description || data?.message || ("Cart add failed: " + res.status));
    return data;
  }

  function reasonText(reasonKey) {
    const key = String(reasonKey || "").toLowerCase();
    if (key === "handpicked") return t("reason_handpicked");
    if (key === "same_collection") return t("reason_same_collection");
    if (key === "store_picks") return t("reason_store_picks");
    return "";
  }

  async function loadUpsells(delayMs = 0) {
    const cardsEl = modal.querySelector("#rr-cards");
    if (!cardsEl) return;

    cardsEl.innerHTML = `
      <div class="rr-card">
        <div class="rr-left">
          <div class="rr-name">${t("loading")}</div>
          <div class="rr-small">${t("fetching")}</div>
        </div>
        <button type="button" disabled>—</button>
      </div>
    `;

    const d = Number(delayMs) || 0;
    if (d > 0) await new Promise((r) => setTimeout(r, d));

    try {
      const data = await fetchUpsells();
      if (data?.locale) {
        LOCALE = data.locale;
        loadTranslationsBg(LOCALE);
      }
      if (data?.meta && typeof data.meta.redirectToCart === "boolean") {
        REDIRECT_TO_CART = data.meta.redirectToCart;
      }

      let items = Array.isArray(data.items) ? data.items.slice(0, LIMIT) : [];
      if (!items.length) {
        cardsEl.innerHTML = `
          <div class="rr-card">
            <div class="rr-left">
              <div class="rr-name">${t("no_recommendations")}</div>
              <div class="rr-small">${t("select_variants")}</div>
            </div>
            <button type="button" disabled>—</button>
          </div>
        `;
        return;
      }

      cardsEl.innerHTML = items.map((it) => {
        const title = esc(it.title || "Upsell");
        const price = esc(it.price || "");
        const vid = esc(it.variantId || "");
        const img = it.imageUrl ? `<img class="rr-img" src="${esc(it.imageUrl)}" alt="" loading="lazy" />` : "";
        const reason = it.reasonKey ? esc(reasonText(it.reasonKey)) : "";

        return `
          <div class="rr-card">
            ${img}
            <div class="rr-left">
              <div class="rr-name">${title}</div>
              ${reason ? `<div class="rr-small rr-reason">${reason}</div>` : ""}
              <div class="rr-small">${price}</div>
            </div>
            <button type="button" data-variant="${vid}">${t("add")}</button>
          </div>
        `;
      }).join("");
    } catch (err) {
      console.error("[RavenRock] fetchUpsells failed", err);
      cardsEl.innerHTML = `
        <div class="rr-card">
          <div class="rr-left">
            <div class="rr-name">${t("load_failed")}</div>
            <div class="rr-small">${t("check_console")}</div>
          </div>
          <button type="button" disabled>—</button>
        </div>
      `;
    }
  }

  // ---- Trigger logic (20s after selection) ----
  let rrTriggerTimeoutId = null;

  function clearTriggerTimeout() {
    if (rrTriggerTimeoutId) {
      clearTimeout(rrTriggerTimeoutId);
      rrTriggerTimeoutId = null;
    }
  }

  function setupTrigger() {
    clearTriggerTimeout();

    // Only on product pages + allowed
    if (!location.pathname.startsWith("/products/")) return;
    if (!isAllowedNow()) return;
    if (!hasSeenProduct()) return;

    const delaySec = Number(RR_CONFIG.triggerDelaySec || 20) || 20;
    const baseAt = getSelectedAtMs() || getFirstProductAtMs() || nowMs();
    const elapsed = nowMs() - baseAt;
    const remaining = Math.max(0, delaySec * 1000 - elapsed);

    rrLog("Trigger armed", { delaySec, elapsed, remaining, baseAt, variant: getCurrentVariantId() });

    rrTriggerTimeoutId = setTimeout(() => {
      rrTriggerTimeoutId = null;
      if (!isAllowedNow()) return;

      showButton();

      if (RR_CONFIG.autoOpen !== false) {
        openModal({ delayUpsellsMs: (Number(RR_CONFIG.upsellDelaySec || 2) * 1000) });
      }
    }, remaining);
  }

  function watchVariantSelection() {
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form) return;

    let last = String(getCurrentVariantId() || "").trim();

    const detect = () => {
      const cur = String(getCurrentVariantId() || "").trim();
      if (!cur || cur === last) return;
      last = cur;

      markProductSelected();
      setupTrigger();

      rrLog("Variant changed -> timer reset", cur);
    };

    form.addEventListener("change", () => setTimeout(detect, 0), true);
    form.addEventListener("click", () => setTimeout(detect, 0), true);

    // Poll fallback for themes that update variant silently
    let ticks = 0;
    const poll = setInterval(() => {
      ticks += 1;
      detect();
      if (ticks > 240) clearInterval(poll); // ~60s (250ms * 240)
    }, 250);
  }

  // ---- Boot ----
  (function init() {
    // Don’t run on cart/checkout
    const path = location.pathname || "";
    if (path.startsWith("/cart") || path.includes("/checkout") || path.startsWith("/checkouts/")) {
      rrLog("Skipping on cart/checkout");
      return;
    }

    renderModal(); // render immediately with fallback translations
    mountUI();

    // Start background fetches (don’t block trigger)
    fetchRRConfigBg();
    loadTranslationsBg(LOCALE);

    if (path.startsWith("/products/")) {
      markProductSeen();
      markProductSelected();
      watchVariantSelection();
      setupTrigger();
    }

    rrLog("Init snapshot", {
      path,
      scriptLoaded: true,
      btnExists: !!document.getElementById("ravenrock-upsell-btn"),
      allowedNow: isAllowedNow(),
      nextAllowedAt: getNextAllowedAt(),
      seenProduct: sGet(RR_SEEN_PRODUCT_KEY),
      selectedAt: sGet(RR_SELECTED_AT_KEY),
      cfg: RR_CONFIG,
    });

export async function loader({ request }) {
  const timestamp = new Date().toISOString();
  console.log(`🔥 [${timestamp}] RECOMMENDATIONS HIT:`, request.url);
  
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    console.log(`✅ [${timestamp}] Auth OK, shop:`, session?.shop);
    
    // ... rest van je code
    
  } catch (err) {
    console.error(`❌ [${timestamp}] Auth FAILED:`, err.message);
    // Return een response ipv crash
    return jsonResponse({ 
      items: [], 
      meta: { 
        error: true, 
        message: err.message,
        timestamp 
      } 
    });
  }
}


  })();
})();
