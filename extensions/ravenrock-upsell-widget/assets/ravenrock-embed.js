(function () {
  if (window.__RAVENROCK_UPSELL_LOADED__) return;
  window.__RAVENROCK_UPSELL_LOADED__ = true;

  const PROXY_PATH = "/apps/ravenrock";
  const LIMIT = 3;

  const root =
    (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : "/";

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
  modal.innerHTML = `
    <div class="rr-header">
      <div class="rr-title">RavenRock Upsell</div>
      <button class="rr-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="rr-body">
      <div class="rr-subtitle">Recommended add-ons:</div>
      <div class="rr-cards" id="rr-cards"></div>
    </div>
  `;

  document.body.append(btn, backdrop, modal);

  const cardsEl = modal.querySelector("#rr-cards");
  const closeBtn = modal.querySelector(".rr-close");

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
  closeBtn.addEventListener("click", closeModal);

  async function fetchUpsells() {
    const params = new URLSearchParams();
    params.set("current_variant", getCurrentVariantId());

    const handle = getProductHandle();
    if (handle) params.set("product_handle", handle);

    const shop = getShopDomain();
    if (shop) params.set("shop", shop);

    const url = PROXY_PATH + "/recommend?" + params.toString();

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

  cardsEl.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-variant]");
    if (!b) return;

    b.disabled = true;
    const original = b.textContent;
    b.textContent = "Adding…";

    try {
      await addToCart(b.getAttribute("data-variant"));
      b.textContent = "Added ✓";
      window.location.href = root + "cart"; // MVP: altijd correct op elk theme
    } catch (err) {
      console.error("[RavenRock] addToCart failed", err);
      alert(String(err.message || err));
      b.textContent = original;
      b.disabled = false;
    }
  });

  async function loadUpsells() {
    cardsEl.innerHTML = `
      <div class="rr-card">
        <div class="rr-left">
          <div class="rr-name">Loading…</div>
          <div class="rr-small">Fetching upsells</div>
        </div>
        <button type="button" disabled>—</button>
      </div>
    `;

    try {
      const data = await fetchUpsells();
      const items = Array.isArray(data.items) ? data.items.slice(0, LIMIT) : [];

      if (!items.length) {
        cardsEl.innerHTML = `
          <div class="rr-card">
            <div class="rr-left">
              <div class="rr-name">No recommendations yet</div>
              <div class="rr-small">Select variants in the app settings.</div>
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
            <button type="button" data-variant="${vid}">Add</button>
          </div>
        `;
      }).join("");
    } catch (err) {
      console.error("[RavenRock] fetchUpsells failed", err);
      cardsEl.innerHTML = `
        <div class="rr-card">
          <div class="rr-left">
            <div class="rr-name">Could not load upsells</div>
            <div class="rr-small">Open console for details</div>
          </div>
          <button type="button" disabled>—</button>
        </div>
      `;
    }
  }
})();
