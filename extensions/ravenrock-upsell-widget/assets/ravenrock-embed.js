(function () {
  if (window.__RAVENROCK_UPSELL_LOADED__) return;
  window.__RAVENROCK_UPSELL_LOADED__ = true;

  const PROXY_PATH = "/apps/ravenrock";
  const LIMIT = 3;
  let REDIRECT_TO_CART = true;
  let LOCALE = 'en';
  let TRANSLATIONS = {};

  const root =
    (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : "/";

  // Vertaalfunctie
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
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Laad vertalingen
 // Laad vertalingen
async function loadTranslations(locale) {
  const lang = locale?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
  
  try {
    const res = await fetch(`/apps/ravenrock/translations?locale=${lang}`);
    if (res.ok) {
      TRANSLATIONS = await res.json();
    }
  } catch (err) {
    console.warn('[RavenRock] Could not load translations:', err);
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
      close: "Close"
    };
  }
}


  // UI
  const btn = document.createElement("button");
  btn.id = "ravenrock-upsell-btn";
  btn.type = "button";
  btn.textContent = "RavenRock";

  const backdrop = document.createElement("div");
  backdrop.id = "ravenrock-upsell-backdrop";
  backdrop.hidden = true;

  const modal = document.createElement("div");
  modal.id = "ravenrock-upsell-modal";
  modal.hidden = true;

  document.body.append(btn, backdrop, modal);

  const closeBtn = document.createElement("button");
  closeBtn.className = "rr-close";
  closeBtn.type = "button";

  function renderModal() {
    modal.innerHTML = `
      <div class="rr-header">
        <div class="rr-title">${t('modal_title')}</div>
        <button class="rr-close" type="button" aria-label="${t('close')}">×</button>
      </div>
      <div class="rr-body">
        <div class="rr-subtitle">${t('recommended_addons')}</div>
        <div class="rr-cards" id="rr-cards"></div>
      </div>
    `;
    
    const newCloseBtn = modal.querySelector(".rr-close");
    newCloseBtn.addEventListener("click", closeModal);
  }

  function openModal() {
    backdrop.hidden = false;
    modal.hidden = false;
    loadUpsells();
  }
  
  function closeModal() {
    backdrop.hidden = true;
    modal.hidden = true;
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
    if (!res.ok) throw new Error(data?.description || data?.message || ("Cart add failed: " + res.status));
    return data;
  }

  async function loadUpsells() {
    const cardsEl = modal.querySelector("#rr-cards");
    if (!cardsEl) return;

    cardsEl.innerHTML = `
      <div class="rr-card">
        <div class="rr-left">
          <div class="rr-name">${t('loading')}</div>
          <div class="rr-small">${t('fetching')}</div>
        </div>
        <button type="button" disabled>—</button>
      </div>
    `;

    try {
      const data = await fetchUpsells();
      
      // Sla locale en redirect setting op
      if (data.locale) {
        LOCALE = data.locale;
        await loadTranslations(LOCALE);
        renderModal(); // Re-render met nieuwe vertalingen
      }
      
      if (data.meta && typeof data.meta.redirectToCart === 'boolean') {
        REDIRECT_TO_CART = data.meta.redirectToCart;
      }
      
      let items = Array.isArray(data.items) ? data.items : [];

      // Filter out-of-stock items
      const excludeOutOfStock = data.meta?.excludeOutOfStock;
      if (excludeOutOfStock) {
        items = items.filter(it => !it.isSoldOut);
      }

      items = items.slice(0, LIMIT);

      if (!items.length) {
        cardsEl.innerHTML = `
          <div class="rr-card">
            <div class="rr-left">
              <div class="rr-name">${t('no_recommendations')}</div>
              <div class="rr-small">${t('select_variants')}</div>
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
        return `
          <div class="rr-card">
            ${img}
            <div class="rr-left">
              <div class="rr-name">${title}</div>
              <div class="rr-small">${price}</div>
            </div>
            <button type="button" data-variant="${vid}">${t('add')}</button>
          </div>
        `;
      }).join("");

      // Event listener voor add buttons
      cardsEl.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-variant]");
        if (!b) return;

        b.disabled = true;
        const original = b.textContent;
        b.textContent = t('adding');

        try {
          await addToCart(b.getAttribute("data-variant"));
          b.textContent = t('added');
          
          if (REDIRECT_TO_CART) {
            window.location.href = root + "cart";
          } else {
            if (window.Shopify && window.Shopify.theme && window.Shopify.theme.cart) {
              window.Shopify.theme.cart.getState();
            }
            document.dispatchEvent(new CustomEvent('cart:updated'));
          }
        } catch (err) {
          console.error("[RavenRock] addToCart failed", err);
          alert(String(err.message || err));
          b.textContent = original;
          b.disabled = false;
        }
      });

    } catch (err) {
      console.error("[RavenRock] fetchUpsells failed", err);
      cardsEl.innerHTML = `
        <div class="rr-card">
          <div class="rr-left">
            <div class="rr-name">${t('load_failed')}</div>
            <div class="rr-small">${t('check_console')}</div>
          </div>
          <button type="button" disabled>—</button>
        </div>
      `;
    }
  }

  // Initialiseer
  (async function init() {
    await loadTranslations('en'); // Start met Engels
    renderModal();
  })();
})();
