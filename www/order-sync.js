/* sync.js
 * Handles all communication with the Flask backend and keeps IndexedDB
 * (via db.js) as the local source of truth for offline use.
 *
 * Public API (window.Sync):
 *   init()                 - call once on app start
 *   syncAll()               - full refresh: master sync + sales + purchase + lookups
 *   syncOrders(type)         - refresh just "sales" or "purchase"
 *   syncLookups()            - refresh parties/items/status/destination
 *   queueWrite(url, body)    - save-sales / save-purchase / update-order, offline-safe
 *   flushOutbox()            - replay queued writes once back online
 *   isOnline()
 *   getLastSync()
 */

const Sync = (() => {

  // Change this to match wherever the Flask API is actually reachable.
  const BASE_URL = window.APP_CONFIG?.BASE_URL || "https://server.hamaridunia.in";

  const AUTO_SYNC_MS = 3 * 60 * 1000; // 3 minutes, same cadence as the old dashboard

  let listeners = []; // callbacks fired after any sync so the UI can re-render

  function onChange(cb) {
    listeners.push(cb);
  }

  function notify(event) {
    listeners.forEach((cb) => {
      try { cb(event); } catch (e) { console.error(e); }
    });
  }

  function isOnline() {
    return navigator.onLine;
  }

  async function safeFetchJSON(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);

    // Cloudflare/proxy error pages can occasionally come back with a 200
    // but an HTML body instead of the JSON the caller expects. res.ok
    // alone doesn't catch that - check content-type too so a bad page
    // never gets treated as valid data.
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Non-JSON response from ${url} (likely a proxy/error page)`);
    }

    return res.json();
  }

  // ---------- pulling data down ----------

  async function syncOrders(type) {
    // type: "sales" | "purchase"
    const endpoint = type === "sales" ? "/pending-sales" : "/pending-purchase";
    const store = type === "sales" ? "sales" : "purchase";

    const data = await safeFetchJSON(BASE_URL + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        party_name: "", item_name: "", status_name: "",
        destination: "", from: "", to: "",
        sortField: "ORDER_DATE", sortOrder: "DESC",
      }),
    });

    await window.DB.replaceAll(store, Array.isArray(data) ? data : []);
    await window.DB.setMeta(`lastSync_${store}`, Date.now());
    notify({ type: "orders", store });
    return data;
  }

  async function syncItemSummary() {
    const data = await safeFetchJSON(BASE_URL + "/item-summary");
    await window.DB.replaceAll("itemSummary", Array.isArray(data) ? data : []);
    await window.DB.setMeta("lastSync_itemSummary", Date.now());
    notify({ type: "itemSummary" });
    return data;
  }

  async function syncPurchasePartySummary() {
    const data = await safeFetchJSON(BASE_URL + "/party-average", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "purchase" }),
    });

    const rows = Array.isArray(data) ? data.map((r, i) => ({
      id: i + 1,
      party_name: r.PARTY_NAME,
      item_name: r.ITEM_NAME,
      total_pending_qty: r.TOTAL_PENDING_QTY,
      avg_rate: r.AVG_RATE,
    })) : [];

    await window.DB.replaceAll("purchasePartySummary", rows);
    await window.DB.setMeta("lastSync_purchasePartySummary", Date.now());
    notify({ type: "purchasePartySummary" });
    return rows;
  }

  async function syncSalesPartySummary() {
    const data = await safeFetchJSON(BASE_URL + "/party-average", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sales" }),
    });

    const rows = Array.isArray(data) ? data.map((r, i) => ({
      id: i + 1,
      party_name: r.PARTY_NAME,
      item_name: r.ITEM_NAME,
      total_pending_qty: r.TOTAL_PENDING_QTY,
      avg_rate: r.AVG_RATE,
    })) : [];

    await window.DB.replaceAll("salesPartySummary", rows);
    await window.DB.setMeta("lastSync_salesPartySummary", Date.now());
    notify({ type: "salesPartySummary" });
    return rows;
  }

  async function syncLookups() {
    const jobs = [
      ["parties", "/get-parties"],
      ["items", "/get-items"],
      ["status", "/get-status"],
      ["destination", "/get-destination"],
    ];

    for (const [name, endpoint] of jobs) {
      try {
        const data = await safeFetchJSON(BASE_URL + endpoint);
        await window.DB.saveLookup(name, data);
      } catch (e) {
        console.warn(`Lookup sync failed for ${name} (using cached copy):`, e.message);
      }
    }

    await window.DB.setMeta("lastSync_lookups", Date.now());
    notify({ type: "lookups" });
  }

  async function syncAll() {
    if (!isOnline()) {
      notify({ type: "offline-skip" });
      return { skipped: true };
    }

    notify({ type: "sync-start" });

    try {
      // Trigger the server-side "Update Master" job (Tally -> MySQL), same as the old dashboard.
      await fetch(BASE_URL + "/sync-all").catch(() => {});

      // Har summary sync ko alag try/catch mein rakha hai (syncLookups jaisa
      // pattern) - taaki agar in teeno me se koi ek fail ho (store missing,
      // server error, etc.) to sirf wahi summary purani/cached dikhe, aur
      // sales/purchase/lookups ka sync fail hone ka galat status na dikhe.
      await Promise.all([
        syncOrders("sales"),
        syncOrders("purchase"),
        syncLookups(),
        syncItemSummary().catch(e =>
          console.warn("Item summary sync failed (using cached copy):", e.message)),
        syncPurchasePartySummary().catch(e =>
          console.warn("Purchase party summary sync failed (using cached copy):", e.message)),
        syncSalesPartySummary().catch(e =>
          console.warn("Sales party summary sync failed (using cached copy):", e.message)),
      ]);

      await flushOutbox();

      notify({ type: "sync-done", ok: true });
      return { ok: true };
    } catch (err) {
      console.error("syncAll failed:", err);
      notify({ type: "sync-done", ok: false, error: err.message });
      return { ok: false, error: err.message };
    }
  }

  // ---------- pushing data up (offline-safe writes) ----------

  async function queueWrite(url, body) {
    const item = { url, method: "POST", body };

    if (isOnline()) {
      try {
        const res = await fetch(BASE_URL + url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        // IMPORTANT: fetch() resolves fine for Cloudflare/proxy "origin
        // down" error pages too (502/522/523 etc, or even a 200 HTML
        // page) - it does NOT throw. Without this res.ok check, a save
        // that actually failed server-side would be reported as
        // successful here, and the entry would never get queued for
        // retry - silent data loss. Treat non-ok / non-JSON as a
        // failure so it falls through to the offline queue below.
        if (!res.ok) {
          throw new Error(`Save failed (${res.status})`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Non-JSON response (likely a proxy/error page)");
        }

        const data = await res.json();
        notify({ type: "write-done", url, ok: true });
        return { queued: false, ok: true, data };
      } catch (err) {
        // fall through to queueing if the network call itself failed
        console.warn("Write failed, queueing for later:", err.message);
      }
    }

    await window.DB.addToOutbox(item);
    notify({ type: "write-queued", url });
    return { queued: true, ok: true };
  }

  async function flushOutbox() {
    if (!isOnline()) return;

    const queue = await window.DB.getOutbox();
    if (!queue.length) return;

    for (const item of queue) {
      try {
        const res = await fetch(BASE_URL + item.url, {
          method: item.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });

        // Same reasoning as queueWrite(): a resolved fetch is NOT proof
        // of success when Cloudflare/the origin can return an error
        // page as a normal HTTP response. Without this check, a queued
        // order/edit could get silently deleted from the outbox here
        // even though it was never actually saved on the server -
        // permanent data loss with no error shown to the user.
        if (!res.ok) {
          throw new Error(`Outbox item save failed (${res.status})`);
        }

        await window.DB.removeFromOutbox(item.id);
      } catch (err) {
        console.warn("Outbox item still failing, will retry later:", err.message);
        break; // stop on first failure, keep order, try again next time
      }
    }

    notify({ type: "outbox-flushed" });
  }

  async function getLastSync() {
    return {
      sales: await window.DB.getMeta("lastSync_sales"),
      purchase: await window.DB.getMeta("lastSync_purchase"),
      lookups: await window.DB.getMeta("lastSync_lookups"),
      itemSummary: await window.DB.getMeta("lastSync_itemSummary"),
      purchasePartySummary: await window.DB.getMeta("lastSync_purchasePartySummary"),
      salesPartySummary: await window.DB.getMeta("lastSync_salesPartySummary"),
    };
  }

  function init() {
    window.addEventListener("online", () => {
      notify({ type: "online" });
      syncAll();
    });
    window.addEventListener("offline", () => notify({ type: "offline" }));

    // periodic background refresh, same cadence as the original dashboard
    setInterval(() => { if (isOnline()) syncAll(); }, AUTO_SYNC_MS);
  }

  return {
    init, syncAll, syncOrders, syncLookups, syncItemSummary,
    syncPurchasePartySummary, syncSalesPartySummary,
    queueWrite, flushOutbox, isOnline, getLastSync, onChange,
    BASE_URL,
  };
})();

window.Sync = Sync;
