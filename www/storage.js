// storage.js

// ----------------------
// Unified DB name (server-suffix hataya)
// ----------------------
// Pehle har server ka alag DB tha: "InvoicePWA_server1" / "InvoicePWA_server2".
// Ab DB EK HI hai ("InvoicePWA") - jis server se sync hoga uska data isi
// DB me overwrite hoke baithega, offline usी ka data available rahega.

const DB_VERSION = 3; // bumped from 2 -> 3 to force creation of party_master / item_master stores

let db = null;

function getDBName() {
    return "InvoicePWA";
}


// ----------------------
// Open Database
// ----------------------
function openDB() {

    const currentDBName = getDBName();

    return new Promise((resolve, reject) => {

        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(currentDBName, DB_VERSION);

        request.onupgradeneeded = function (event) {

            db = event.target.result;

            // Invoice Store
            if (!db.objectStoreNames.contains("invoices")) {

                const store = db.createObjectStore("invoices", {
                    keyPath: "id"
                });

                store.createIndex("invoiceNo", "invoiceNo", {
                    unique: true
                });

                store.createIndex("invoiceDate", "invoiceDate");
                store.createIndex("buyerName", "buyerName");
                store.createIndex("status", "status");
            }

            // Party Master
            if (!db.objectStoreNames.contains("party_master")) {

                const party = db.createObjectStore("party_master", {
                    keyPath: "name"
                });

                party.createIndex("gstin", "gstin");
                party.createIndex("updated_at", "updated_at");
            }

            // Item Master
            if (!db.objectStoreNames.contains("item_master")) {

                const item = db.createObjectStore("item_master", {
                    keyPath: "name"
                });

                item.createIndex("hsn", "hsn");
                item.createIndex("updated_at", "updated_at");
            }

        };

        request.onsuccess = function (event) {

            db = event.target.result;
            resolve(db);

        };

        request.onerror = function () {

            reject(request.error);

        };

    });

}


function generateUUID() {

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {

        const r = Math.random() * 16 | 0;

        const v = c === 'x' ? r : (r & 0x3 | 0x8);

        return v.toString(16);

    });

}


//======================================================
// Invoice CRUD
//======================================================

async function saveInvoice(invoice) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("invoices", "readwrite");

        const store = tx.objectStore("invoices");

        if (!invoice.id) {
            invoice.id = generateUUID();
        }

        invoice.createdAt = invoice.createdAt || new Date().toISOString();
        invoice.updatedAt = new Date().toISOString();

        store.put(invoice);

        tx.oncomplete = () => resolve(invoice);
        tx.onerror = () => reject(tx.error);

    });

}

async function getInvoice(id) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("invoices");
        const store = tx.objectStore("invoices");
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}

async function getAllInvoices() {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("invoices");
        const store = tx.objectStore("invoices");
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}

async function deleteInvoice(id) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("invoices", "readwrite");
        const store = tx.objectStore("invoices");

        store.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}

async function searchInvoices(keyword = "") {

    const list = await getAllInvoices();

    keyword = keyword.toLowerCase().trim();

    if (!keyword) return list;

    return list.filter(inv => {
        return (
            (inv.invoiceNo || "").toLowerCase().includes(keyword) ||
            (inv.buyerName || "").toLowerCase().includes(keyword)
        );
    });

}

async function getLatestInvoices() {

    const list = await getAllInvoices();

    list.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;

}


//======================================================
// Party Master
//======================================================

async function savePartyMaster(list) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("party_master", "readwrite");
        const store = tx.objectStore("party_master");

        if (Array.isArray(list)) {
            list.forEach(p => store.put(p));
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}

async function getPartyMaster() {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("party_master");
        const store = tx.objectStore("party_master");
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}

async function getParty(name) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("party_master");
        const store = tx.objectStore("party_master");
        const req = store.get(name);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}
// ==========================================
// Transporter Master
// ==========================================

async function getTransporterMaster() {

    const parties = await getPartyMaster();

    return parties
        .filter(p =>
            (p.parent || "").trim().toUpperCase() ===
            "SUNDRY CREDITORS FOR TRANSPORTION"
        )
        .sort((a, b) => a.name.localeCompare(b.name));

}

// ==========================================
// Get Transporter By Name
// ==========================================

async function getTransporter(name) {

    const transporters = await getTransporterMaster();

    return transporters.find(p => p.name === name);

}



async function deleteParty(name) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("party_master", "readwrite");
        const store = tx.objectStore("party_master");

        store.delete(name);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}


//======================================================
// Item Master
//======================================================

async function saveItemMaster(list) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("item_master", "readwrite");
        const store = tx.objectStore("item_master");

        if (Array.isArray(list)) {
            list.forEach(i => store.put(i));
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}

async function getItemMaster() {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("item_master");
        const store = tx.objectStore("item_master");
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}

async function getItem(name) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("item_master");
        const store = tx.objectStore("item_master");
        const req = store.get(name);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);

    });

}

async function deleteItem(name) {

    const database = await openDB();

    return new Promise((resolve, reject) => {

        const tx = database.transaction("item_master", "readwrite");
        const store = tx.objectStore("item_master");

        store.delete(name);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

    });

}

// ================= ONE-TIME MIGRATION (old per-server DB -> single DB) =================
// Purane version me "InvoicePWA_server1" / "InvoicePWA_server2" alag DB
// the. Ek baar naya unified "InvoicePWA" khulne par, jo server pehle
// active tha uska data isme copy kar dete hain taaki purana invoice data
// achanak khaali na dikhe.
async function migrateOldScopedInvoiceDbIfNeeded() {
    try {
        const marker = await getMetaFlag("migrated_from_scoped_db");
        if (marker) return;

        const legacyKey = (function () {
            try {
                const stored = localStorage.getItem("activeServerKey");
                return (stored === "server1" || stored === "server2") ? stored : "server1";
            } catch (e) {
                return "server1";
            }
        })();

        const oldDbName = "InvoicePWA_" + legacyKey;

        const hasOldDb = await new Promise((resolve) => {
            if (!indexedDB.databases) { resolve(true); return; }
            indexedDB.databases()
                .then((list) => resolve((list || []).some((d) => d.name === oldDbName)))
                .catch(() => resolve(false));
        });

        if (!hasOldDb) { await setMetaFlag("migrated_from_scoped_db"); return; }

        const oldDb = await new Promise((resolve) => {
            const req = indexedDB.open(oldDbName);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        });

        if (!oldDb) { await setMetaFlag("migrated_from_scoped_db"); return; }

        const database = await openDB();
        const stores = ["invoices", "party_master", "item_master"];

        for (const storeName of stores) {
            if (!oldDb.objectStoreNames.contains(storeName)) continue;
            const rows = await new Promise((resolve) => {
                const tx = oldDb.transaction(storeName, "readonly");
                const r = tx.objectStore(storeName).getAll();
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = () => resolve([]);
            });
            await new Promise((resolve) => {
                const tx = database.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                rows.forEach((r) => store.put(r));
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        }

        oldDb.close();
        await setMetaFlag("migrated_from_scoped_db");
    } catch (e) {
        console.warn("Old Invoice DB migration skipped/failed (not fatal)", e);
    }
}

// Small key/value marker stored inside the "invoices" store's neighbouring
// IndexedDB (reuse party_master keyed by a reserved name, safe + simple).
async function getMetaFlag(key) {
    try {
        const database = await openDB();
        return await new Promise((resolve) => {
            if (!database.objectStoreNames.contains("item_master")) { resolve(null); return; }
            const tx = database.transaction("item_master", "readonly");
            const req = tx.objectStore("item_master").get("__meta_" + key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function setMetaFlag(key) {
    try {
        const database = await openDB();
        await new Promise((resolve) => {
            const tx = database.transaction("item_master", "readwrite");
            tx.objectStore("item_master").put({ name: "__meta_" + key, value: true });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (e) {}
}
