// ==========================================
// GST Helper
// ==========================================

function getPOSFromGST(gstin) {

    if (!gstin || gstin.length < 2)
        return "";

    return gstin.substring(0, 2);

}

function attachManualGSTListener(prefix) {

    const gst = document.getElementById(prefix + "GST");

    if (!gst) return;

    gst.addEventListener("input", function () {

        const pos = document.getElementById(prefix + "POS");

        if (pos)
            pos.value = getPOSFromGST(this.value.trim());

    });

}

async function loadSellerParties() {

    const parties = await getPartyMaster();

    const sel = document.getElementById("sellerParty");

    sel.innerHTML = "<option value=''>Select Seller</option>";

    parties.forEach(function (p) {

        const opt = document.createElement("option");

        opt.value = p.name;

        opt.textContent = p.name;

        sel.appendChild(opt);

    });

    sel.onchange = function () {

        loadPartyDetails(this.value);

    };

}

// ==========================================
// Seller Party Details (Offline)
// ==========================================

async function loadPartyDetails(name) {

    if (!name) return;

    const data = await getParty(name);

    if (!data) {

        alert("Party Not Found");

        return;

    }

    const gstin = data.gstin || "";

    document.getElementById("sellerGST").value = gstin;

    document.getElementById("sellerPOS").value =
        getPOSFromGST(gstin);

    document.getElementById("sellerState").value =
        data.state || "";

    document.getElementById("sellerPIN").value =
        data.pin || "";

    document.getElementById("sellerPIN").readOnly = false;

    document.getElementById("sellerAddress").value =
        data.address || "";

}

// ==========================================
// Party Dropdown (Offline)
// ==========================================

async function loadPartyDropdown(inputId) {

    const parties = await getPartyMaster();

    const datalist = document.getElementById("partyMasterList");

    const input = document.getElementById(inputId);

    if (input) input.setAttribute("list", "partyMasterList");

    if (!datalist) return;

    datalist.innerHTML = "";

    parties
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(function (p) {

            const option = document.createElement("option");

            option.value = p.name;

            datalist.appendChild(option);

        });

}

// ==========================================
// Transporter Dropdown (Offline)
// ==========================================

async function loadTransporterDropdown() {

    const parties = await getTransporterMaster();

    const datalist = document.getElementById("transporterMasterList");

    const input = document.getElementById("transporterName");

    if (input)
        input.setAttribute("list", "transporterMasterList");

    if (!datalist)
        return;

    datalist.innerHTML = "";

    parties.forEach(function (p) {

        const option = document.createElement("option");

        option.value = p.name;

        datalist.appendChild(option);

    });

}

// ==========================================
// Fill Transporter
// ==========================================

async function fillTransporter() {

    const partyName = document.getElementById("transporterName").value.trim();

    if (!partyName) {

        document.getElementById("transporterId").value = "";
        return;

    }

    const data = await getTransporter(partyName);

    if (!data) {

        // Manual Transporter
        document.getElementById("transporterId").value = "";
        return;

    }

    document.getElementById("transporterId").value =
        data.partygstin ||
        data.Transporterid ||
        data.transporterid ||
        "";

}



// ==========================================
// Fill Party (Offline)
// ==========================================

async function fillParty(prefix) {

    const partyName = document.getElementById(prefix + "Party").value.trim();

    if (!partyName) return;

    const data = await getParty(partyName);

    if (!data) {

        // User is still typing / typo - just clear dependent fields quietly,
        // no alert (this field is now a free-text input with suggestions).
        ["GST", "POS", "State", "PIN", "Address"].forEach(function (f) {

            const el = document.getElementById(prefix + f);

            if (el) el.value = "";

        });

        return;

    }

    const gstin = data.gstin || "";

    document.getElementById(prefix + "GST").value = gstin;

    document.getElementById(prefix + "POS").value =
        getPOSFromGST(gstin);

    document.getElementById(prefix + "State").value =
        data.state || "";

    document.getElementById(prefix + "PIN").value =
        data.pin || "";

    document.getElementById(prefix + "PIN").readOnly = false;

    document.getElementById(prefix + "Address").value =
        data.address || "";

}

// ==========================================
// Item Dropdown (Offline)
// ==========================================

async function loadItemList(input) {

    const items = await getItemMaster();

    const datalist = document.getElementById("itemMasterList");

    if (input) input.setAttribute("list", "itemMasterList");

    if (!datalist) return;

    datalist.innerHTML = "";

    items
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(function (item) {

            const option = document.createElement("option");

            option.value = item.name;

            datalist.appendChild(option);

        });

}

// ==========================================
// Item Details (Offline)
// ==========================================

async function loadItemDetails(select) {

    const card = select.closest(".itemCard");

    if (!card) return;

    const itemName = select.value.trim();

    if (!itemName) return;

    const item = await getItem(itemName);

    if (!item) {

        // Still typing / typo - clear dependent fields quietly, no alert
        card.querySelector(".hsn").value = "";
        card.querySelector(".gst").value = "";

        return;

    }

    card.querySelector(".hsn").value =
        item.hsn || "";

    card.querySelector(".unit").value =
        item.unit || "MTS";

    card.querySelector(".gst").value =
        item.gst || 18;

    calculateRow(card);

}