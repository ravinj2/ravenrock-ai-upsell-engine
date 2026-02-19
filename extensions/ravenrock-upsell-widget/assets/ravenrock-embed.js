(function () {
  if (window.__RAVENROCK_UPSELL_LOADED__) return;
  window.__RAVENROCK_UPSELL_LOADED__ = true;

  const PROXY_PATH = "/apps/ravenrock";
  const DEBUG = new URLSearchParams(location.search).has("rr_debug");
  const RESET = new URLSearchParams(location.search).has("rr_reset");
  const log = (...a) => DEBUG && console.log("[RavenRock]", ...a);

  // Storage helpers
  const STORAGE = (() => {
    try {
      localStorage.setItem("__rr_test", "1");
      localStorage.removeItem("__rr_test");
      return localStorage;
    } catch {
      return null;
    }
  })();

  const SESSION = (() => {
    try {
      sessionStorage.setItem("__rr_test", "1");
      sessionStorage.removeItem("__rr_test");
      return sessionStorage;
    } catch {
      return STORAGE;
    }
  })();

  const NEXT_ALLOWED_KEY = "rr_next_allowed_at";
  const SEEN_KEY = "rr_seen_product";
  const SELECTED_KEY = "rr_selected_at";

  if (RESET) {
    STORAGE?.removeItem(NEXT_ALLOWED_KEY);
    SESSION?.removeItem(SEEN_KEY);
    SESSION?.removeItem(SELECTED_KEY);
    log("Reset done");
  }

  function now() { return Date.now(); }

  function isAllowed() {
    const raw = STORAGE?.getItem(NEXT_ALLOWED_KEY);
    const next = raw ? Number(raw) : 0;
    return now() >= next;
  }

  function snooze(hours) {
    const next = now() + hours * 60 * 60 * 1000;
    STORAGE?.setItem(NEXT_ALLOWED_KEY, next);
  }

  function markSeen() {
    SESSION?.setItem(SEEN_KEY, "1");
  }

  function hasSeen() {
    return SESSION?.getItem(SEEN_KEY) === "1";
  }

  function markSelected() {
    SESSION?.setItem(SELECTED_KEY, now());
  }

  function selectedAt() {
    const raw = SESSION?.getItem(SELECTED_KEY);
    return raw ? Number(raw) : 0;
  }

  function getVariant() {
    const fromUrl = new URLSearchParams(location.search).get("variant");
    if (fromUrl) return fromUrl;
    return document.querySelector('form[action*="/cart/add"] input[name="id"]')?.value || "";
  }

  function getHandle() {
    const p = location.pathname;
    return p.startsWith("/products/") ? p.split("/products/")[1].split("/")[0] : "";
  }

  // Create UI elements
  const btn = document.createElement("button");
  btn.id = "ravenrock-upsell-btn";
  btn.textContent = "✨ Aanbevolen";
  btn.hidden = true;

  const backdrop = document.createElement("div");
  backdrop.id = "ravenrock-upsell-backdrop";
  backdrop.hidden = true;

  const modal = document.createElement("div");
  modal.id = "ravenrock-upsell-modal";
  modal.hidden = true;

  document.body.append(btn, backdrop, modal);

  backdrop.addEventListener("click", close);
  btn.addEventListener("click", open);

  function open() {
    log("Opening modal");
    backdrop.hidden = false;
    modal.hidden = false;
    snooze(24);
    loadUpsells();
  }

  function close() {
    log("Closing modal");
    backdrop.hidden = true;
    modal.hidden = true;
  }

  async function loadUpsells() {
    modal.innerHTML = `
      <div class="rr-header">
        <div class="rr-title">Aanbevolen voor jou</div>
        <button class="rr-close">×</button>
      </div>
      <div class="rr-body">
        <p class="rr-subtitle">Laden...</p>
      </div>
    `;

    modal.querySelector('.rr-close').addEventListener('click', close);

    await new Promise(r => setTimeout(r, 500));

    try {
      const params = new URLSearchParams();
      params.set("current_variant", getVariant());
      params.set("product_handle", getHandle());

      log("Fetching recommendations:", params.toString());

      const res = await fetch(PROXY_PATH + "/recommendations?" + params.toString(), {
        credentials: "same-origin"
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      log("Recommendations loaded:", data);

      if (!data.items?.length) {
        modal.querySelector('.rr-body').innerHTML = "<p>Geen aanbevelingen beschikbaar</p>";
        return;
      }

      const cardsHtml = data.items.map(it => `
        <div class="rr-card">
          ${it.imageUrl ? `<img class="rr-img" src="${it.imageUrl}" alt="${it.title}">` : ''}
          <div class="rr-left">
            <div class="rr-name">${it.title}</div>
            <div class="rr-small">${it.price}</div>
          </div>
          <button data-vid="${it.variantId}">Toevoegen</button>
        </div>
      `).join("");

      modal.innerHTML = `
        <div class="rr-header">
          <div class="rr-title">Aanbevolen voor jou</div>
          <button class="rr-close">×</button>
        </div>
        <div class="rr-body">
          <p class="rr-subtitle">Speciaal voor jou geselecteerd</p>
          <div class="rr-cards">${cardsHtml}</div>
        </div>
      `;

      modal.querySelector('.rr-close').addEventListener('click', close);

      modal.querySelectorAll('button[data-vid]').forEach(addBtn => {
        addBtn.addEventListener('click', async (e) => {
          const vid = e.target.dataset.vid;
          e.target.disabled = true;
          e.target.textContent = '...';
          
          log("Adding to cart:", vid);
          const success = await addToCart(vid);
          
          if (success) {
            e.target.textContent = '✓';
            setTimeout(close, 800);
          } else {
            e.target.textContent = '✗';
            e.target.disabled = false;
          }
        });
      });

    } catch (e) {
      console.error("[RavenRock] Load failed:", e);
      modal.querySelector('.rr-body').innerHTML = `<p>Fout: ${e.message}</p>`;
    }
  }

  async function addToCart(variantId) {
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: 1 })
      });
      
      if (res.ok) {
        log('Added to cart:', variantId);
        document.dispatchEvent(new CustomEvent('cart:refresh'));
        window.dispatchEvent(new Event('cart:updated'));
        return true;
      }
      return false;
    } catch (e) {
      console.error('[RavenRock] Add to cart failed:', e);
      return false;
    }
  }

  // Trigger logic
  let timer = null;

  function armTrigger() {
    if (!isAllowed()) {
      log("Not allowed (snoozed)");
      return;
    }
    if (!hasSeen()) {
      log("Not seen yet");
      return;
    }

    const delay = 20000;
    const base = selectedAt() || now();
    const remaining = Math.max(0, delay - (now() - base));

    log("Trigger armed, remaining:", remaining);

    clearTimeout(timer);
    timer = setTimeout(() => {
      log("Showing button");
      btn.hidden = false;
      open();
    }, remaining);
  }

  function watchVariant() {
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form) {
      log("No cart form found");
      return;
    }

    let last = getVariant();

    const detect = () => {
      const cur = getVariant();
      if (cur && cur !== last) {
        log("Variant changed:", last, "→", cur);
        last = cur;
        markSelected();
        armTrigger();
      }
    };

    const observer = new MutationObserver(detect);
    observer.observe(form, { childList: true, subtree: true });
    form.addEventListener('change', detect);
    detect();
  }

  function init() {
    log("Init", { handle: getHandle(), variant: getVariant() });
    
    if (!getHandle()) {
      log("Not a product page");
      return;
    }

    markSeen();
    watchVariant();
    armTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log("Loaded");
})();
