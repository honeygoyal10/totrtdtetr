/* app.js
 * UI layer for the Order Dashboard PWA.
 * Reads/writes through db.js (IndexedDB) and sync.js (network + outbox).
 * Card-based, mobile-first, works fully offline once the first sync has run.
 */

const App = (() => {

  let currentTab = "sales";     // "sales" | "purchase"
  let currentSummaryTab = "item";
  let searchTerm = "";
  let lookups = { parties: [], items: [], status: [], destination: [] };

  // ---------- helpers ----------

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  // ---------- boot ----------

  async function init() {
    if (window.DB && typeof window.DB.migrateOldScopedOrderDbIfNeeded === "function") {
      await window.DB.migrateOldScopedOrderDbIfNeeded();
    }

    window.Sync.init();
    window.Sync.onChange(handleSyncEvent);

    bindStaticUI();
    updateNetworkBadge();

    await loadLookupsFromCache();
    await renderFromCache();
    await updateSyncBadge();

    // Kick a background sync; UI already has cached data to show meanwhile.
    window.Sync.syncAll();
  }

  function bindStaticUI() {
    document.getElementById("tab-sales").addEventListener("click", () => switchTab("sales"));
    document.getElementById("tab-purchase").addEventListener("click", () => switchTab("purchase"));
    document.getElementById("tab-summary").addEventListener("click", () => switchTab("summary"));

    document.getElementById("sum-tab-item").addEventListener("click", () => {
      showSummaryTab("item");
    });

    document.getElementById("sum-tab-po").addEventListener("click", () => {
      showSummaryTab("purchase");
    });

    document.getElementById("sum-tab-so").addEventListener("click", () => {
      showSummaryTab("sales");
    });

    document.getElementById("searchBox").addEventListener("input", (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderFromCache();
    });

    document.getElementById("refreshBtn").addEventListener("click", () => window.Sync.syncAll());
    document.getElementById("fab").addEventListener("click", () => openForm());
    document.getElementById("formClose").addEventListener("click", closeForm);
    document.getElementById("orderForm").addEventListener("submit", onSubmitOrder);

    document.getElementById("f_statusFilter").addEventListener("change", () => {
      renderFromCache();
    });

    document.getElementById("f_item").addEventListener("change", () => {
      renderFromCache();
    });

    window.addEventListener("online", updateNetworkBadge);
    window.addEventListener("offline", updateNetworkBadge);
  }

  function switchTab(tab) {
    currentTab = tab;
    document.getElementById("tab-sales").classList.toggle("active", tab === "sales");
    document.getElementById("tab-purchase").classList.toggle("active", tab === "purchase");
    document.getElementById("tab-summary").classList.toggle("active", tab === "summary");

    const isSummary = tab === "summary";

    document.querySelector(".toolbar").style.display = isSummary ? "none" : "flex";
    document.getElementById("cardList").style.display = isSummary ? "none" : "flex";
    document.getElementById("fab").style.display = isSummary ? "none" : "flex";
    document.getElementById("summaryContainer").style.display = isSummary ? "block" : "none";

    if (isSummary) {
      showSummaryTab(currentSummaryTab);
    } else {
      renderFromCache();
    }
    updateSyncBadge();
  }

  // ---------- status badges ----------

  function updateNetworkBadge() {
    const badge = document.getElementById("netBadge");
    const online = navigator.onLine;
    badge.textContent = online ? "Online" : "Offline";
    badge.className = "badge " + (online ? "badge-online" : "badge-offline");
  }

  async function updateSyncBadge() {
    const last = await window.Sync.getLastSync();
    const key = currentTab === "summary" ? "itemSummary" : currentTab;
    const ts = last[key];
    const el = document.getElementById("syncBadge");
    if (!ts) { el.textContent = "Never synced"; return; }
    const mins = Math.round((Date.now() - ts) / 60000);
    el.textContent = mins < 1 ? "Synced just now" : `Synced ${mins} min ago`;
  }

  function handleSyncEvent(evt) {
    if (evt.type === "sync-start") setStatusMsg("Syncing…");
    if (evt.type === "sync-done") setStatusMsg(evt.ok ? "" : "Sync failed, showing cached data");
    if (evt.type === "offline-skip") setStatusMsg("Offline — showing cached data");
    if (evt.type === "orders" || evt.type === "lookups") {
      loadLookupsFromCache();
      renderFromCache();
      updateSyncBadge();
    }
    if (evt.type === "itemSummary" || evt.type === "purchasePartySummary" || evt.type === "salesPartySummary") {
      if (currentTab === "summary") {
        showSummaryTab(currentSummaryTab);
      }
      updateSyncBadge();
    }
    if (evt.type === "write-queued") setStatusMsg("Saved offline — will sync later");
    if (evt.type === "outbox-flushed") setStatusMsg("Queued changes synced");
  }

  function setStatusMsg(msg) {
    const el = document.getElementById("statusMsg");
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
    if (msg) setTimeout(() => { if (el.textContent === msg) el.style.display = "none"; }, 4000);
  }

  // ---------- lookups ----------

  async function loadLookupsFromCache() {
    lookups.parties = await window.DB.getLookup("parties");
    lookups.items = await window.DB.getLookup("items");
    lookups.status = await window.DB.getLookup("status");
    lookups.destination = await window.DB.getLookup("destination");

    const itemSel = document.getElementById("f_item");

    itemSel.innerHTML =
      '<option value="">All Items</option>' +
      lookups.items.map(x =>
        `<option value="${escapeHtml(x.NAME)}">${escapeHtml(x.NAME)}</option>`
      ).join("");

    const statusSel = document.getElementById("f_statusFilter");

    statusSel.innerHTML = `
      <option value="OPEN" selected>Open</option>
      <option value="">All Status</option>
    ` + lookups.status
      .filter(s => (s.STATUS_NAME || "").toUpperCase() !== "OPEN")
      .map(s =>
        `<option value="${escapeHtml(s.STATUS_NAME)}">${escapeHtml(s.STATUS_NAME)}</option>`
      )
      .join("");
  }

  // ---------- rendering ----------

async function renderFromCache() {

    const store = currentTab === "sales" ? "sales" : "purchase";
    let rows = await window.DB.getAll(store);

    const itemFilter =
        document.getElementById("f_item").value.toLowerCase();

    const statusFilter =
        document.getElementById("f_statusFilter").value.toLowerCase();

    if (statusFilter) {
        rows = rows.filter(r =>
            (r.STATUS || "").toLowerCase() === statusFilter
        );
    }

    if (searchTerm) {
        rows = rows.filter(r =>
            String(r.PARTY_NAME || "").toLowerCase().includes(searchTerm) ||
            String(r.ITEM_NAME || "").toLowerCase().includes(searchTerm) ||
            String(r.PO_NUMBER || "").toLowerCase().includes(searchTerm)
        );
    }

    if (itemFilter) {
        rows = rows.filter(r =>
            (r.ITEM_NAME || "").toLowerCase() === itemFilter
        );
    }

    rows.sort((a, b) => new Date(b.ORDER_DATE) - new Date(a.ORDER_DATE));

    const container = document.getElementById("cardList");

    if (!rows.length) {
        container.innerHTML = `
            <div class="empty">
                No ${escapeHtml(currentTab)} orders to show yet.
                Pull to refresh once you're online.
            </div>`;
        return;
    }

    container.innerHTML = rows.map(cardHTML).join("");

    // ===============================
    // Card Click -> Open Invoice Page
    // ===============================
    container.querySelectorAll(".order-card").forEach(card => {

        card.addEventListener("click", () => {

            const orderNo = card.dataset.po;

            // Save Order No
            sessionStorage.setItem("selectedOrderNo", orderNo);

            // Open Invoice Tab
            if (window.parent && window.parent !== window) {

                const invoiceBtn =
                    window.parent.document.querySelector(
                        'button[data-page="invoice.html"]'
                    );

                if (invoiceBtn) {
                    invoiceBtn.click();
                } else {
                    console.error("Invoice button not found.");
                }

            } else {

                // Direct open if iframe is not used
                window.location.href =
                    "invoice.html?orderno=" +
                    encodeURIComponent(orderNo);

            }

        });

    });

}
  










  function daysAgo(dateStr) {
    if (!dateStr) return "";
    const d = Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    return d;
  }

  function cardHTML(r) {
    const pending = r.PENDING_QTY ?? "";
    const delay = daysAgo(r.ORDER_DATE);
    const delayClass = delay > 15 ? "chip-red" : delay > 7 ? "chip-amber" : "chip-green";

    // Backend/view column casing (and even the column name itself) has varied -
    // the actual DB column is FRT (soorder.FRT), so check that too along with
    // the FREIGHT variants, otherwise a valid value silently disappears.
    const remark = r.REMARK ?? r.Remark ?? r.remark ?? "";
    const freight = r.FRT ?? r.Frt ?? r.frt ?? r.FREIGHT ?? r.Freight ?? r.freight ?? "";

    return `
      <div class="order-card" data-po="${escapeHtml(r.PO_NUMBER)}">
        <div class="card-top">
          <span class="po-number">${escapeHtml(r.PO_NUMBER)}</span>
          <span class="chip ${delayClass}">${escapeHtml(delay)}d</span>
        </div>
        <div class="party-name">${escapeHtml(r.PARTY_NAME)}</div>
        <div class="item-line">${escapeHtml(r.ITEM_NAME)} · Qty ${escapeHtml(r.QTY)}</div>
        ${(remark || freight) ? `<div class="remark-line" style="display:flex;justify-content:space-between;gap:8px;">
          <span>${remark ? "📝 " + escapeHtml(remark) : ""}</span>
          <span>${freight ? "🚚 Frt: " + escapeHtml(freight) : ""}</span>
        </div>` : ""}
        <div class="card-bottom">
          <span>Rate ₹${escapeHtml(r.RATE)}</span>
          <span>Pending ${escapeHtml(pending)}</span>
          <span class="status-tag">${escapeHtml(r.STATUS)}</span>
        </div>
      </div>`;
  }

  // ---------- item summary ----------

  function showSummaryTab(tab) {
    currentSummaryTab = tab;

    document.getElementById("sum-tab-item").classList.toggle("active", tab === "item");
    document.getElementById("sum-tab-po").classList.toggle("active", tab === "purchase");
    document.getElementById("sum-tab-so").classList.toggle("active", tab === "sales");

    document.getElementById("itemSummaryContainer").style.display =
      tab === "item" ? "block" : "none";

    document.getElementById("purchaseSummaryContainer").style.display =
      tab === "purchase" ? "block" : "none";

    document.getElementById("salesSummaryContainer").style.display =
      tab === "sales" ? "block" : "none";

    if (tab === "item") {
      renderItemSummary();
    }

    if (tab === "purchase") {
      renderPurchasePartySummary();
    }

    if (tab === "sales") {
      renderSalesPartySummary();
    }
  }

  async function renderItemSummary() {
    const rows = await window.DB.getAll("itemSummary");
    const container = document.getElementById("itemSummaryContainer");

    if (!rows.length) {
      container.innerHTML = `<div class="empty">No item summary yet. Pull to refresh once you're online.</div>`;
      return;
    }

    container.innerHTML = rows.map(itemSummaryCardHTML).join("");
  }

  function partySummaryCardHTML(r) {
    return `
      <div class="summary-card">
        <div class="summary-card-title">📌 ${escapeHtml(r.party_name)}</div>
        <div class="summary-row">
          <span class="label">📦 ITEM</span>
          <span class="value">${escapeHtml(r.item_name)}</span>
        </div>
        <div class="summary-row">
          <span class="label">⏳ PENDING QTY</span>
          <span class="value">${Number(r.total_pending_qty || 0).toFixed(3)}</span>
        </div>
        <div class="summary-row">
          <span class="label">💰 AVG RATE</span>
          <span class="value">${Number(r.avg_rate || 0).toFixed(2)}</span>
        </div>
      </div>`;
  }

  async function renderPurchasePartySummary() {
    const container = document.getElementById("purchaseSummaryContainer");
    const rows = await window.DB.getPurchasePartySummary();

    if (!rows.length) {
      container.innerHTML = `<div class="empty">No purchase party summary yet. Pull to refresh once you're online.</div>`;
      return;
    }

    container.innerHTML = rows.map(partySummaryCardHTML).join("");
  }

  async function renderSalesPartySummary() {
    const container = document.getElementById("salesSummaryContainer");
    const rows = await window.DB.getSalesPartySummary();

    if (!rows.length) {
      container.innerHTML = `<div class="empty">No sales party summary yet. Pull to refresh once you're online.</div>`;
      return;
    }

    container.innerHTML = rows.map(partySummaryCardHTML).join("");
  }

  function itemSummaryCardHTML(r) {
    const balance = r.BALANCE ?? "";
    const balanceClass = Number(balance) < 0 ? "balance-neg" : "balance-pos";

    const rows = [
      { icon: "📥", label: "PO OPEN QTY", value: r.PO_OPEN_QTY },
      { icon: "📤", label: "SO OPEN QTY", value: r.SO_OPEN_QTY },
      { icon: "🏬", label: "STOCK QTY", value: r.STOCK_QTY },
      { icon: "⚖️", label: "BALANCE", value: balance, cls: balanceClass, isBalance: true },
      { icon: "💰", label: "PURCHASE RATE", value: r.AVG_PURCHASE_RATE },
      { icon: "💸", label: "SALES RATE", value: r.AVG_SALES_RATE },
    ];

    return `
      <div class="summary-card">
        <div class="summary-card-title">📌 ${escapeHtml(r.ITEM_NAME)}</div>
        ${rows.map(row => `
          <div class="summary-row${row.isBalance ? " balance" : ""}">
            <span class="label">${row.icon} ${escapeHtml(row.label)}</span>
            <span class="value${row.cls ? " " + row.cls : ""}">${escapeHtml(row.value ?? "")}</span>
          </div>`).join("")}
      </div>`;
  }

  // ---------- add / edit form ----------

  function partyOptionsHTML() {
    return lookups.parties.map(p => `<option value="${escapeHtml(p.GUID)}">${escapeHtml(p.NAME)}</option>`).join("");
  }
  function itemOptionsHTML() {
    return lookups.items.map(i => `<option value="${escapeHtml(i.GUID)}">${escapeHtml(i.NAME)}</option>`).join("");
  }
  function statusOptionsHTML() {
    return lookups.status.map(s => `<option value="${escapeHtml(s.ID)}">${escapeHtml(s.STATUS_NAME)}</option>`).join("");
  }
  function destOptionsHTML() {
    return lookups.destination.map(d => `<option value="${escapeHtml(d.ID)}">${escapeHtml(d.CITY_NAME)}</option>`).join("");
  }

  async function openForm(poNumber) {
    document.getElementById("f_party").innerHTML = partyOptionsHTML();
    document.getElementById("f_itemGuid").innerHTML = itemOptionsHTML();
    document.getElementById("f_status").innerHTML = statusOptionsHTML();
    document.getElementById("f_dest").innerHTML = destOptionsHTML();

    const form = document.getElementById("orderForm");
    form.reset();
    document.getElementById("f_editingPO").value = "";
    document.getElementById("formTitle").textContent = "New Order";

    if (poNumber) {
      const store = currentTab === "sales" ? "sales" : "purchase";
      const all = await window.DB.getAll(store);
      const row = all.find(r => r.PO_NUMBER === poNumber);
      if (row) {
        document.getElementById("formTitle").textContent = "Edit Order " + row.PO_NUMBER;
        document.getElementById("f_editingPO").value = poNumber;
        document.getElementById("f_po").value = row.PO_NUMBER || "";
        document.getElementById("f_qty").value = row.QTY || "";
        document.getElementById("f_rate").value = row.RATE || "";
        document.getElementById("f_remark").value = row.REMARK || "";
        document.getElementById("f_freight").value = row.FRT ?? row.Frt ?? row.frt ?? row.FREIGHT ?? "";
      }
    }

    document.getElementById("formOverlay").style.display = "flex";
  }

  function closeForm() {
    document.getElementById("formOverlay").style.display = "none";
  }

  async function onSubmitOrder(e) {
    e.preventDefault();

    const editingPO = document.getElementById("f_editingPO").value;

    const payload = {
      po_number: document.getElementById("f_po").value,
      original_po: editingPO || null, // needed so backend knows which record to update
      party_guid: document.getElementById("f_party").value,
      item_guid: document.getElementById("f_itemGuid").value,
      qty: document.getElementById("f_qty").value,
      rate: document.getElementById("f_rate").value,
      remark: document.getElementById("f_remark").value,
      freight: document.getElementById("f_freight").value,
      status_id: parseInt(document.getElementById("f_status").value || "0", 10),
      destination_id: document.getElementById("f_dest").value ? parseInt(document.getElementById("f_dest").value, 10) : null,
      type: currentTab,
    };

    const url = editingPO ? "/update-order" : (currentTab === "sales" ? "/save-sales" : "/save-purchase");

    const result = await window.Sync.queueWrite(url, payload);

    closeForm();

    if (result.queued) {
      setStatusMsg("No connection — order saved locally and will sync automatically");
    } else {
      setStatusMsg("Order saved");
      window.Sync.syncOrders(currentTab);
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);