/* db.js
 * Thin IndexedDB wrapper for the Order Dashboard PWA.
 * Stores:
 *   sales       - cached "pending sales" rows        (keyPath: PO_NUMBER)
 *   purchase    - cached "pending purchase" rows      (keyPath: PO_NUMBER)
 *   lookups     - cached dropdown data (parties/items/status/destination) (keyPath: name)
 *   meta        - small key/value store (last sync time, etc.)           (keyPath: key)
 *   outbox      - queued writes made while offline, replayed on reconnect (autoIncrement)
 *
 * Everything here is plain callback-free promise code, no external deps.
 *
 * NOTE: Ab DB EK HI hai ("OrderDashboardDB") - server-suffix hata diya.
 * Jis bhi server se sync hoga uska data isi DB me overwrite hoke baithega
 * aur offline usी ka data available rahega. Pehle server1/server2 ka alag
 * DB hota tha ("OrderDashboardDB_server1" / "_server2") - us purane DB se
 * data migrate karne ke liye niche migrateOldScopedOrderDbIfNeeded() hai.
 */

// NOTE: Poora file ab ek IIFE mein wrap hai. Wajah: invoice.html apna
// storage.js bhi load karta hai, jiske globals (DB_VERSION, openDB, db,
// dbName, getDBName) is file ke naam se clash karte the - jo bhi file
// baad me load hoti thi wo dusre ki openDB() ko silently overwrite kar
// deti thi, aur invoice ka apna IndexedDB (InvoicePWA_*) tootne laga tha.
// Ab sirf window.DB expose hota hai, andar ka kuch bhi global scope me
// leak nahi hota - isliye order.html aur invoice.html dono me safely
// saath-saath load ho sakti hai.
(function () {

// NOTE: Bumped 4 -> 5. itemSummary / purchasePartySummary / salesPartySummary
// stores were added to onupgradeneeded below WITHOUT bumping this number at
// the time. Result: any device that had already opened this DB at version 4
// (before these stores existed) never re-ran onupgradeneeded, so those 3
// stores were silently missing on their machine. Every write to them
// (replaceAll -> clearStore/bulkPut) threw a NotFoundError, which - since
// syncItemSummary/syncPurchasePartySummary/syncSalesPartySummary have no
// try/catch of their own - rejected the whole Promise.all in syncAll().
// That's why item summary (and party summaries) looked "stuck"/never
// synced even though sales/purchase orders kept updating fine.
const DB_VERSION = 5;

let _dbPromise = null;

function getDBName() {
    return "OrderDashboardDB";
}

function openDB() {

    const currentDBName = getDBName();

    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(currentDBName, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            if (!db.objectStoreNames.contains("sales")) {
                db.createObjectStore("sales", { keyPath: "PO_NUMBER" });
            }
            if (!db.objectStoreNames.contains("purchase")) {
                db.createObjectStore("purchase", { keyPath: "PO_NUMBER" });
            }
            if (!db.objectStoreNames.contains("lookups")) {
                db.createObjectStore("lookups", { keyPath: "name" });
            }
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("outbox")) {
                db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
            }
            if (!db.objectStoreNames.contains("itemSummary")) {
                db.createObjectStore("itemSummary", { keyPath: "ITEM_NAME" });
            }
            if (!db.objectStoreNames.contains("purchasePartySummary")) {
                db.createObjectStore("purchasePartySummary", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("salesPartySummary")) {
                db.createObjectStore("salesPartySummary", { keyPath: "id" });
            }
        };

        // NOTE: Without this handler, if this DB is already open in another
        // tab/window (same origin - e.g. app left open in background), a
        // version-bump open() request (4 -> 5) gets silently stuck: neither
        // onupgradeneeded nor onerror nor onsuccess fires until that other
        // connection closes. openDB() (and therefore every sync/read/write
        // that depends on it, including the itemSummary sync) would just
        // hang forever with no console error - it LOOKS like "sync never
        // completes" but really the upgrade is blocked. Logging it here at
        // least surfaces the real cause instead of a silent hang, and other
        // tabs' onversionchange (below) proactively close so this resolves
        // itself the moment they get a chance to.
        req.onblocked = () => {
            console.warn(
                "OrderDashboardDB upgrade blocked - close other open tabs/" +
                "windows of this app (order.html/invoice.html) and reload."
            );
        };

        req.onsuccess = (e) => {
            const db = e.target.result;

            // If another tab requests a version upgrade while THIS tab's
            // connection is the one open, this fires. Close our connection
            // so that other tab's open() can proceed instead of blocking -
            // this is what prevents the onblocked scenario above from
            // deadlocking two tabs against each other indefinitely.
            db.onversionchange = () => {
                db.close();
                _dbPromise = null;
                _dbPromiseName = null;
            };

            resolve(db);
        };

        req.onerror = (e) => reject(e.target.error);
    });

    return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

// ---------- generic helpers ----------

async function getAll(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function bulkPut(storeName, records) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    records.forEach((r) => store.put(r));
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

async function putOne(storeName, record) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Replace the entire contents of a store with a fresh dataset (used after a server sync)
async function replaceAll(storeName, records) {
  await clearStore(storeName);
  if (records && records.length) await bulkPut(storeName, records);
}

// ---------- meta (key/value) ----------

async function getMeta(key) {
  const store = await tx("meta", "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key, value) {
  return putOne("meta", { key, value });
}

// ---------- lookups (parties / items / status / destination) ----------

async function saveLookup(name, data) {
  return putOne("lookups", { name, data });
}

async function getLookup(name) {
  const store = await tx("lookups", "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(name);
    req.onsuccess = () => resolve(req.result ? req.result.data : []);
    req.onerror = () => reject(req.error);
  });
}

// ---------- outbox (queued offline writes) ----------

async function addToOutbox(item) {
  // item: { url, method, body, createdAt }
  const store = await tx("outbox", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add({ ...item, createdAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOutbox() {
  return getAll("outbox");
}

async function removeFromOutbox(id) {
  const store = await tx("outbox", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- purchase / sales party summary ----------

async function savePurchasePartySummary(rows) {
  return replaceAll("purchasePartySummary", rows);
}

async function getPurchasePartySummary() {
  return getAll("purchasePartySummary");
}

async function saveSalesPartySummary(rows) {
  return replaceAll("salesPartySummary", rows);
}

async function getSalesPartySummary() {
  return getAll("salesPartySummary");
}

window.DB = {
  openDB,
  getAll,
  clearStore,
  bulkPut,
  putOne,
  replaceAll,
  getMeta,
  setMeta,
  saveLookup,
  getLookup,
  addToOutbox,
  getOutbox,
  removeFromOutbox,
  savePurchasePartySummary,
  getPurchasePartySummary,
  saveSalesPartySummary,
  getSalesPartySummary,
  migrateOldScopedOrderDbIfNeeded,
};

// ================= ONE-TIME MIGRATION (old per-server DB -> single DB) =================
// Purane version me har server ka apna DB tha: "OrderDashboardDB_server1" /
// "OrderDashboardDB_server2". Update ke baad pehli baar khulne par, jo
// server pehle active tha uska scoped-DB data naye unified DB
// ("OrderDashboardDB") me copy kar dete hain taaki existing users ka
// offline data achanak khaali na dikhe. Sirf ek baar chalta hai.
async function migrateOldScopedOrderDbIfNeeded() {
  try {
    const already = await getMeta("migrated_from_scoped_db");
    if (already) return;

    const legacyKey = (function () {
      try {
        const stored = localStorage.getItem("activeServerKey");
        return (stored === "server1" || stored === "server2") ? stored : "server1";
      } catch (e) {
        return "server1";
      }
    })();

    const oldDbName = "OrderDashboardDB_" + legacyKey;

    const hasOldDb = await new Promise((resolve) => {
      if (!indexedDB.databases) { resolve(true); return; }
      indexedDB.databases()
        .then((list) => resolve((list || []).some((d) => d.name === oldDbName)))
        .catch(() => resolve(false));
    });

    if (!hasOldDb) { await setMeta("migrated_from_scoped_db", true); return; }

    const oldDb = await new Promise((resolve) => {
      const req = indexedDB.open(oldDbName);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });

    if (!oldDb) { await setMeta("migrated_from_scoped_db", true); return; }

    const stores = ["sales", "purchase", "lookups", "meta", "outbox", "itemSummary", "purchasePartySummary", "salesPartySummary"];

    for (const storeName of stores) {
      if (!oldDb.objectStoreNames.contains(storeName)) continue;
      const rows = await new Promise((resolve) => {
        const tx = oldDb.transaction(storeName, "readonly");
        const r = tx.objectStore(storeName).getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      });
      for (const row of rows) {
        if (storeName === "meta" && row.key === "migrated_from_scoped_db") continue;
        await putOne(storeName, row);
      }
    }

    oldDb.close();
    await setMeta("migrated_from_scoped_db", true);
  } catch (e) {
    console.warn("Old Order DB migration skipped/failed (not fatal)", e);
  }
}

})();
