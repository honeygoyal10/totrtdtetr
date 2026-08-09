async function syncMasters() {

    try {

        const btn = document.getElementById("btnSync");

        btn.disabled = true;
        btn.innerHTML = "Syncing...";

        // Party
        const partyUrl = APP_CONFIG.BASE_URL + "/api/master/party";
        let res = await fetch(partyUrl);

        if (!res.ok) {
            throw new Error(
                `Party endpoint returned ${res.status} (${partyUrl}) - check it's deployed & Flask restarted`
            );
        }

        if (!(res.headers.get("content-type") || "").includes("application/json")) {
            throw new Error(
                `Party endpoint returned non-JSON (${partyUrl}) - likely a Cloudflare/proxy error page`
            );
        }

        let parties = await res.json();

        await savePartyMaster(parties);

        // Item
        const itemUrl = APP_CONFIG.BASE_URL + "/api/master/item";
        res = await fetch(itemUrl);

        if (!res.ok) {
            throw new Error(
                `Item endpoint returned ${res.status} (${itemUrl}) - check it's deployed & Flask restarted`
            );
        }

        if (!(res.headers.get("content-type") || "").includes("application/json")) {
            throw new Error(
                `Item endpoint returned non-JSON (${itemUrl}) - likely a Cloudflare/proxy error page`
            );
        }

        let items = await res.json();

        await saveItemMaster(items);

        btn.disabled = false;
        btn.innerHTML = "Sync";

        alert("Master Sync Completed");

        await updateSyncStatus();
        await refreshAllDropdowns();

    } catch (e) {

        console.log(e);

        const btn = document.getElementById("btnSync");
        btn.disabled = false;
        btn.innerHTML = "Sync";

        alert("Sync Failed - " + e.message);

        await updateSyncStatus();
        await refreshAllDropdowns();

    }

}


//======================================================
// Refresh dropdowns that were already rendered before
// sync finished (buyer/dispatch/ship party selects, and
// every item row's item select) so newly synced data
// shows up immediately without a page reload.
//======================================================
async function refreshAllDropdowns() {

    // Party dropdowns - preserve current selection if still valid
    for (const id of ["buyerParty", "dispatchParty", "shipParty"]) {

        const sel = document.getElementById(id);
        if (!sel) continue;

        const current = sel.value;

        await loadPartyDropdown(id);

        if (current) sel.value = current;

    }

    // ==============================
    // Transporter Dropdown
    // ==============================
    const transporter = document.getElementById("transporterName");

    if (transporter) {

        const current = transporter.value;

        await loadTransporterDropdown();

        if (current)
            transporter.value = current;

    }

    // Item dropdowns - one per item row
    document.querySelectorAll("#itemBody .itemCard .itemName").forEach(async function (sel) {

        const current = sel.value;

        await loadItemList(sel);

        if (current)
            sel.value = current;

    });

}
//======================================================
// Show how much offline data is available, without
// needing to open DevTools. Runs on page load and
// again right after every sync attempt.
//======================================================
async function updateSyncStatus() {

    const el = document.getElementById("syncStatus");

    if (!el) return;

    try {

        const parties = await getPartyMaster();
        const items = await getItemMaster();

        if (parties.length === 0 && items.length === 0) {

            el.textContent = "⚠️ No offline data yet — press Sync while online first.";
            el.className = "text-danger d-block mt-2";

        } else {

            el.textContent =
                `✅ Offline ready: ${parties.length} parties, ${items.length} items loaded`;
            el.className = "text-success d-block mt-2";

        }

    } catch (e) {

        el.textContent = "Could not read offline data (" + e.message + ")";
        el.className = "text-danger d-block mt-2";

    }

}
