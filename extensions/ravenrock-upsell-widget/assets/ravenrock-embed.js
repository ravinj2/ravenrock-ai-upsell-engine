(function () {
  if (window.__RAVENROCK_UPSELL_LOADED__) return;
  window.__RAVENROCK_UPSELL_LOADED__ = true;

  const PROXY_PATH = "/apps/ravenrock";
  const LIMIT = 3;

  let REDIRECT_TO_CART = true;
  let LOCALE = "en";
  let TRANSLATIONS = {};

  // --- MVP 1.1 Stap 4: 24h cap + snooze ---
  const RR_NEXT_ALLOWED_KEY = "rr_next_allowed_at";
  const RR_FREQUENCY_HOURS_DEFAULT = 24;

  let RR_CONFIG = {
    triggerType: "scroll",
    triggerDelaySec: 20,
    frequencyHours: RR_FREQUENCY_HOURS_DEFAULT,
    locale: "en",
    redirectToCart: true,
  };

  function nowMs() {
    return Date.now();
  }

  function getNextAllowedAt() {
    const raw = localStorage.getItem(RR_NEXT_ALLOWED_KEY);
    const ms = raw ? Number(raw) : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  function setSnoozeHours(hours) {
    const h = Number(hours) || RR_FREQUENCY_HOURS_DEFAULT;
    const ms = nowMs() + h * 60 * 60 * 1000;
    localStorage.setItem(RR_NEXT_ALLOWED_KEY, String(ms));
    return ms;
  }

  function isAllowedNow() {
    return nowMs() >= getNextAllowedAt();
  }

  async function fetchRRConfig() {
    try {
      const res = await fetch("/apps/ravenrock/config", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`config ${res.status}`);
      const cfg = await res.json();

      return {
        triggerType: (cfg?.triggerType || "scroll").toLowerCase(),
        triggerDelaySec: Number(cfg?.triggerDelaySec ?? 20) || 20,
        frequencyHours:
          Number(cfg?.frequencyHours ?? RR_FREQUENCY_HOURS_DEFAULT) || RR_FREQUENCY_HOURS_DEFAULT,
        locale: cfg?.locale || "en",
        redirectToCart: typeof cfg?.redirectToCart === "boolean" ? cfg.redirectToCart : true,
      };
    } catch (e) {
      console.warn("[RavenRock] config fetch failed, using defaults", e);
      return { ...RR_CONFIG };
    }
  }

  // --- Session gating: pas triggeren nadat shopper minimaal 1 product heeft bekeken ---
  const RR_SEEN_PRODUCT_KEY = "rr_seen_product";
  const RR_FIRST_PRODUCT_AT_KEY = "rr_first_product_at";

  function markProductSeen() {
    try {
      sessionStorage.setItem(RR_SEEN_PRODUCT_KEY, "1");
      if (!sessionStorage.getItem(RR_FIRST_PRODUCT_AT_KEY)) {
        sessionStorage.setItem(RR_FIRST_PRODUCT_AT_KEY, String(Date.now()));
      }
    } catch (_) {}
  }

  function hasSeenProduct() {
    try {
      return sessionStorage.getItem(RR_SEEN_PRODUCT_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function getFirstProductAtMs() {
    try {
      const raw = sessionStorage.getItem(RR_FIRST_PRODUCT_AT_KEY);
      const ms = raw ? Number(raw) : 0;
      return Number.isFinite(ms) ? ms : 0;
    } catch (_) {
      return 0;
    }
  }

  const root =
    window.Shopify && Shopify.routes && Shopify.routes.root ? Shopify.routes.root : "/";

  function t(key) {
    return TRANSLATIONS[key] || key;
  }

  function getProductHandle() {
    const p = window.location.pathname || "";
    return p.startsWith("/products/") ? (p.split("/products/")[1] || "").split("/")[0] : "";
  }

  function getCurrentVariantId() {
    return new URLSearchParams(window.location.search).get("variant") || "";
  }

  function getShopDomain() {
    const cfg = document.getElementById("ravenrock-config");
    return (cfg?.dataset?.shop || (window.Shopify && Shopify.shop) || "").trim();
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  async function loadTranslations(locale) {
    const lang = locale?.toLowerCase().startsWith("nl") ? "nl" : "en";

    try {
      const res = await fetch(`/apps/ravenrock/translations?locale=${lang}`);
      if (res.ok) {
        TRANSLATIONS = await res.json();
        return;
      }
    } catch (err) {
      console.warn("[RavenRock] Could not load translations:", err);
    }

    // Fallback vertalingen
    TRANSLATIONS = {
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
  }

  // UI
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

  document.body.append(btn, backdrop, modal);

  function closeModal() {
    setSnoozeHours(RR_CONFIG.frequencyHours || RR_FREQUENCY_HOURS_DEFAULT);
    backdrop.hidden = true;
    modal.hidden = true;
  }

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

    const newCloseBtn = modal.querySelector(".rr-close");
    if (newCloseBtn) newCloseBtn.addEventListener("click", closeModal);

    // bind 1x
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
            // Best-effort cart refresh
            fetch(root + "cart.js", {
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            })
              .then((r) => r.json())
              .then((cart) => {
                document.documentElement.dispatchEvent(
                  new CustomEvent("cart:refresh", { bubbles: true, detail: { cart } })
                );
                document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart } }));
                console.log("[RavenRock] Cart updated, item count:", cart.item_count);
              })
              .catch((err) => console.warn("[RavenRock] Cart refresh failed:", err));
          }
        } catch (err) {
          console.error("[RavenRock] addToCart failed", err);
          alert(String(err.message || err));
          b.textContent = original;
          b.disabled = false;
        }
      });
    }
  }

  function openModal() {
    backdrop.hidden = false;
    modal.hidden = false;
    loadUpsells();
  }

  function showButtonOnce() {
    if (!isAllowedNow()) return;
    btn.hidden = false;
    setSnoozeHours(RR_CONFIG.frequencyHours || RR_FREQUENCY_HOURS_DEFAULT);
  }

  function setupTrigger() {
    if (!isAllowedNow()) return;

    if (!hasSeenProduct()) {
      console.log("[RavenRock] Trigger not armed yet: no product viewed in session");
      return;
    }

    const delaySec = Number(RR_CONFIG.triggerDelaySec || 20) || 20;
    const firstAt = getFirstProductAtMs() || Date.now();
    const elapsed = Date.now() - firstAt;
    const remaining = Math.max(0, delaySec * 1000 - elapsed);

    console.log("[RavenRock] Trigger armed (product+timer)", {
      delaySec,
      elapsedMs: elapsed,
      remainingMs: remaining,
      path: location.pathname,
    });

    setTimeout(() => {
      if (!isAllowedNow()) return;
      showButtonOnce();
    }, remaining);
  }

  btn.addEventListener("click", openModal);
  backdrop.addEventListener("click", closeModal);

  async function fetchUpsells() {
    const params = new URLSearchParams();
    params.set("current_variant", getCurrentVariantId());

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
    if (!res.ok) {
      throw new Error(data?.description || data?.message || "Cart add failed: " + res.status);
    }
    return data;
  }

  function reasonText(reasonKey) {
    const key = String(reasonKey || "").toLowerCase();
    if (key === "handpicked") return t("reason_handpicked");
    if (key === "same_collection") return t("reason_same_collection");
    if (key === "store_picks") return t("reason_store_picks");
    return "";
  }

  async function loadUpsells() {
    const cardsEl = modal.querySelector("#rr-cards");
    if (!cardsEl) return;

    // Loading placeholder
    cardsEl.innerHTML = `
      <div class="rr-card">
        <div class="rr-left">
          <div class="rr-name">${t("loading")}</div>
          <div class="rr-small">${t("fetching")}</div>
        </div>
        <button type="button" disabled>—</button>
      </div>
    `;

    try {
      const data = await fetchUpsells();

      if (data.locale) {
        LOCALE = data.locale;
        await loadTranslations(LOCALE);
      }

      if (data.meta && typeof data.meta.redirectToCart === "boolean") {
        REDIRECT_TO_CART = data.meta.redirectToCart;
      }

      let items = Array.isArray(data.items) ? data.items : [];
      items = items.slice(0, LIMIT);

      const titleEl = modal.querySelector(".rr-title");
      const subtitleEl = modal.querySelector(".rr-subtitle");
      if (titleEl) titleEl.textContent = t("modal_title");
      if (subtitleEl) subtitleEl.textContent = t("recommended_addons");

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

      cardsEl.innerHTML = items
        .map((it) => {
          const title = esc(it.title || "Upsell");
          const price = esc(it.price || "");
          const vid = esc(it.variantId || "");
          const img = it.imageUrl
            ? `<img class="rr-img" src="${esc(it.imageUrl)}" alt="" loading="lazy" />`
            : "";
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
        })
        .join("");
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

  // Initialiseer
  (async function init() {
    const path = location.pathname || "";

    if (path.startsWith("/cart") || path.includes("/checkout") || path.startsWith("/checkouts/")) {
      btn.hidden = true;
      return;
    }

    if (path.startsWith("/products/")) {
      markProductSeen();
    }

    RR_CONFIG = await fetchRRConfig();

    if (RR_CONFIG.locale) LOCALE = RR_CONFIG.locale;
    if (typeof RR_CONFIG.redirectToCart === "boolean") {
      REDIRECT_TO_CART = RR_CONFIG.redirectToCart;
    }

    await loadTranslations(LOCALE || "en");
    renderModal();
    setupTrigger();

    console.log("[RavenRock] Init", {
      path,
      nextAllowedAt: getNextAllowedAt(),
      seenProduct: hasSeenProduct(),
      triggerDelaySec: RR_CONFIG.triggerDelaySec,
    });
  })();
})();
