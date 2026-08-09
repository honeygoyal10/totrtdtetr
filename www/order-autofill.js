/* Reads cached sales orders and fills an invoice without locking any fields. */

const OrderAutofill = (() => {

    // NOTE: Pehle yaha "OrderDashboardDB" naam hardcoded tha jo order-db.js
    // ke DB naam se ab match nahi karta (wahan ab server-scoped naam hai:
    // OrderDashboardDB_server1 / OrderDashboardDB_server2). Isliye ab
    // seedha window.DB.openDB() (order-db.js) reuse kar rahe hain, taaki
    // hamesha sahi/active server ka DB hi khule - ek jagah se control.
    async function getOrders() {

        if (!window.DB || typeof window.DB.openDB !== "function") {
            console.warn("window.DB not available - order-db.js load hua?");
            return [];
        }

        const db = await window.DB.openDB();

        if (!db.objectStoreNames.contains("sales")) {
            return [];
        }

        return new Promise((resolve, reject) => {

            const tx = db.transaction("sales", "readonly");
            const req = tx.objectStore("sales").getAll();

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);

        });

    }

    function clearPartyBlock(prefix) {

        const fields = ["Party", "GST", "POS", "Address", "State", "PIN", "Loc"];

        fields.forEach(function (f) {

            const el = document.getElementById(prefix + f);

            if (el) el.value = "";

        });

    }

    function getDatalistOptions(input) {

        if (!input) return [];

        const listId = input.getAttribute("list");

        const datalist = listId ? document.getElementById(listId) : null;

        return datalist ? [...datalist.options] : [];

    }

    async function selectParty(id, name, prefix) {

        const input = document.getElementById(id);

        if (!input || !name) return false;

        const search = String(name).trim().toLowerCase();

        const options = getDatalistOptions(input);

        let option = options.find(o =>
            o.value.trim().toLowerCase() === search
        );

        // Partial Match
        if (!option) {
            option = options.find(o => {
                const value = o.value.trim().toLowerCase();
                return value.includes(search) || search.includes(value);
            });
        }

        if (!option) {
            console.warn(id + " not matched :", name);
            return false;
        }

        input.value = option.value;

        if (prefix) {
            await fillParty(prefix);
        }

        return true;
    }

    async function fill(orderNo) {

        const orders = await getOrders();

        const order = orders.find(row =>
            String(row.PO_NUMBER).trim().toLowerCase() ===
            String(orderNo).trim().toLowerCase()
        );

        const note = document.getElementById("orderFillStatus");

        if (!order) {

            if (note)
                note.textContent =
                    "Order not found in cached sales orders.";

            return;
        }

        // Buyer
        await selectParty(
            "buyerParty",
            order.PARTY_NAME,
            "buyer"
        );

        // Dispatch (blank hai to blank hi rahega - no buyer fallback)
        if (order.DISPATCH_FROM_NAME) {

            await selectParty(
                "dispatchParty",
                order.DISPATCH_FROM_NAME,
                "dispatch"
            );

        } else {

            clearPartyBlock("dispatch");
        }

        // Ship (blank hai to blank hi rahega - no buyer fallback)
        if (order.SHIP_FROM_NAME) {

            await selectParty(
                "shipParty",
                order.SHIP_FROM_NAME,
                "ship"
            );

        } else {

            clearPartyBlock("ship");
        }

        // Locations
        const city = order.CITY_NAME || "";

        if (document.getElementById("buyerLoc"))
            document.getElementById("buyerLoc").value = city;

        if (order.DISPATCH_FROM_NAME && document.getElementById("dispatchLoc"))
            document.getElementById("dispatchLoc").value = city;

        if (order.SHIP_FROM_NAME && document.getElementById("shipLoc"))
            document.getElementById("shipLoc").value = city;

        // Remark
        if (document.getElementById("remark")) {
            document.getElementById("remark").value =
                order.REMARK || "";
        }

        // Freight / Order Term (soorder.FRT is the actual DB column). This
        // can be a numeric amount OR a term like "FOR" / "To Pay" - either
        // way it now goes straight into the Freight field as text (the
        // field feeds Tally's BASICORDERTERMS line 1 on export).
        if (document.getElementById("freight")) {
            document.getElementById("freight").value =
                order.FRT ?? order.Frt ?? order.frt ??
                order.FREIGHT ?? order.Freight ?? order.freight ?? "";
        }

        // Item
        let card = document.querySelector("#itemBody .itemCard");

        if (!card) {

            addItemRow();

            card = document.querySelector("#itemBody .itemCard");
        }

        const itemSelect = card.querySelector(".itemName");

        const itemOptions = getDatalistOptions(itemSelect);

        const itemOption = itemOptions.find(o =>
            o.value.trim().toLowerCase() ===
            String(order.ITEM_NAME || "").trim().toLowerCase()
        );

        if (itemOption) {

            itemSelect.value = itemOption.value;

            await loadItemDetails(itemSelect);
        }

        // Qty
        card.querySelector(".qty").value =
            order.PENDING_QTY ?? order.QTY ?? 0;

        // Rate
        card.querySelector(".rate").value =
            order.RATE ?? 0;

        calculateRow(card);
        calculateInvoice();

        if (note)
            note.textContent =
                "Order data filled successfully.";

    }

    function init() {

        const input = document.getElementById("orderNo");

        if (!input) return;

        input.addEventListener("change", () => {
            if (input.value.trim())
                fill(input.value);
        });

        input.addEventListener("blur", () => {
            if (input.value.trim())
                fill(input.value);
        });

    }

    return {
        init,
        fill
    };

})();
