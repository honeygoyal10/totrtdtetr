const SELLERS = {
    "SHRI JAIBABA CASTING PVT LTD": {
        gstin: "22AAMCS2023E1ZV",
        address: "PLOT NO 419/420 VILLAGE JARVAY H.I.A HATHKHOJ BHILAI",
        state: "CHHATTISGARH",
        pos: "22",
		LOC: "BHILAI",
        pin: "490024"
    },
    "SHRI JAIBABA DIVYA TRADING LLP": {
        gstin: "22AEYFS8700D1ZV",
        address: "PLOT NO 420 VILLAGE JARVAY H.I.A HATHKHOJ BHILAI",
        state: "CHHATTISGARH",
        pos: "22",
		LOC:  "BHILAI",
        pin: "490024"
    }
};

function fillSeller() {

    const company = document.getElementById("sellerParty").value;
    if (!company) return;

    const s = SELLERS[company];

    document.getElementById("sellerGST").value = s.gstin;
    document.getElementById("sellerPOS").value = s.pos;
    document.getElementById("sellerState").value = s.state;
    document.getElementById("sellerPIN").value = s.pin;
    document.getElementById("sellerAddress").value = s.address;

    // Always reset invoice prefix when seller changes
    const invoiceNo = document.getElementById("invoiceNo");

    if (company === "SHRI JAIBABA CASTING PVT LTD") {
        invoiceNo.value = "SA/SJBCPL/";
    }
    else if (company === "SHRI JAIBABA DIVYA TRADING LLP") {
        invoiceNo.value = "SA/SJBDTLLP/";
    }

    calculateInvoice();
}

window.onload = async function () {

    if (typeof migrateOldScopedInvoiceDbIfNeeded === "function") {
        await migrateOldScopedInvoiceDbIfNeeded();
    }

    document.getElementById("sellerParty").onchange = fillSeller;

    loadPartyDropdown("buyerParty");
    loadPartyDropdown("dispatchParty");
    loadPartyDropdown("shipParty");
	loadTransporterDropdown();   // <-- NEW

    document.getElementById("buyerParty").onchange = async function () {
        await fillParty("buyer");
        calculateInvoice();
    };

    document.getElementById("dispatchParty").onchange = async function () {
        await fillParty("dispatch");
    };

    document.getElementById("shipParty").onchange = async function () {
        await fillParty("ship");
    };

	document.getElementById("transporterName").onchange = async function () {

    await fillTransporter();

};
    document.getElementById("otherCharges").addEventListener("input", calculateInvoice);
    document.getElementById("roundOff").addEventListener("input", calculateInvoice);

    document.getElementById("btnSave").onclick = saveCurrentInvoice;
    document.getElementById("btnNew").onclick = newInvoice;
    document.getElementById("btnJSON").onclick = downloadCurrentJSON;
    document.getElementById("btnSync").onclick = syncMasters;
    document.getElementById("btnPrint").onclick = printInvoice;
    document.getElementById("btnTallyXML").onclick = handleDownloadTallyXML;
    document.getElementById("btnSendTally").onclick = handleSendToTally;
    document.getElementById("btnUploadJSON").onclick = handleEinvoiceJSON;

    loadInvoiceHistory();
    updateSyncStatus();

    // Start with one empty item row
    if (document.querySelectorAll("#itemBody .itemCard").length === 0) {
        addItemRow();
    }

    OrderAutofill.init();

    // Default Current Date
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("invoiceDate").value = today;
    document.getElementById("lrDate").value = today;

    // ===========================
    // Auto Fill From Order
    // ===========================
    const selectedOrder = sessionStorage.getItem("selectedOrderNo");

    if (selectedOrder) {

        // Order No Set
        document.getElementById("orderNo").value = selectedOrder;

        // Give page time to finish loading
        setTimeout(async () => {

            try {

                await OrderAutofill.fill(selectedOrder);

            } catch (e) {

                console.error("Order Autofill Error:", e);

            }

            sessionStorage.removeItem("selectedOrderNo");

        }, 300);

    }

};



let itemNo = 0;

function addItemRow() {

    itemNo++;

    const container = document.getElementById("itemBody");

    const col = document.createElement("div");
    col.className = "col-12 itemCard";

    col.innerHTML = `
        <div class="card border-secondary">
            <div class="card-body p-2">

                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="fw-bold small itemIndex">Item #${itemNo}</span>
                    <button type="button" class="btn-close removeRow"></button>
                </div>

                <div class="row g-2 align-items-end">

                    <div class="col-6 col-md-3">
                        <label class="form-label small mb-0">Item Name</label>
                        <input class="form-control form-control-sm itemName" list="itemMasterList" autocomplete="off" placeholder="Type Item">
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">HSN</label>
                        <input class="form-control form-control-sm hsn" readonly>
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">Unit</label>
                        <input class="form-control form-control-sm unit" value="MTS">
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">Qty</label>
                        <input class="form-control form-control-sm qty" type="number" step="0.001" value="0">
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">Rate</label>
                        <input class="form-control form-control-sm rate" type="number" step="0.01" value="0">
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">Amount</label>
                        <input class="form-control form-control-sm amount" readonly>
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">GST %</label>
                        <input class="form-control form-control-sm gst" type="number" step="0.01" value="18">
                    </div>

                    <div class="col-4 col-md-1">
                        <label class="form-label small mb-0">GST Amt</label>
                        <input class="form-control form-control-sm gstAmt" readonly>
                    </div>

                    <div class="col-4 col-md-2">
                        <label class="form-label small mb-0 fw-bold">Total</label>
                        <input class="form-control form-control-sm total fw-bold" readonly>
                    </div>

                </div>

            </div>
        </div>
    `;

    container.appendChild(col);

    const itemSelect = col.querySelector(".itemName");
    loadItemList(itemSelect);

    itemSelect.onchange = async function () {
        await loadItemDetails(this);
        calculateRow(col);
    };

    col.querySelector(".qty").addEventListener("input", function () {
        calculateRow(col);
    });

    col.querySelector(".rate").addEventListener("input", function () {
        calculateRow(col);
    });

    col.querySelector(".gst").addEventListener("input", function () {
        calculateRow(col);
    });

    col.querySelector(".removeRow").onclick = function () {
        col.remove();
        itemNo = 0;
        document.querySelectorAll("#itemBody .itemCard").forEach(function (c) {
            itemNo++;
            c.querySelector(".itemIndex").textContent = "Item #" + itemNo;
        });
        calculateInvoice();
    };
}

function collectInvoiceData() {

    const invoice = {

        // Unique ID (Edit होने पर वही ID रहेगी)
        id: window.currentInvoiceId || generateUUID(),

        // Invoice Details
        invoiceNo: document.getElementById("invoiceNo").value.trim(),
        invoiceDate: document.getElementById("invoiceDate").value,
        orderNo: document.getElementById("orderNo").value.trim(),
        referenceNo: document.getElementById("referenceNo").value.trim(),
        referenceDate: document.getElementById("referenceDate").value,

        // Seller
        seller: {
            company: document.getElementById("sellerParty").value,
            gst: document.getElementById("sellerGST").value,
            address: document.getElementById("sellerAddress").value,
            state: document.getElementById("sellerState").value,
            pin: document.getElementById("sellerPIN").value,
            pos: document.getElementById("sellerPOS").value,
            city: ""
        },

        // Buyer
        buyer: {
            company: document.getElementById("buyerParty").value,
            gst: document.getElementById("buyerGST").value,
            address: document.getElementById("buyerAddress").value,
            state: document.getElementById("buyerState").value,
            pin: document.getElementById("buyerPIN").value,
            pos: document.getElementById("buyerPOS").value,
            city: document.getElementById("buyerLoc").value.trim(),
        },

        // Dispatch
        dispatch: {
            company: document.getElementById("dispatchParty").value,
            gst: document.getElementById("dispatchGST").value,
            address: document.getElementById("dispatchAddress").value,
            state: document.getElementById("dispatchState").value,
            pin: document.getElementById("dispatchPIN").value,
            pos: document.getElementById("dispatchPOS").value,
            city: document.getElementById("dispatchLoc").value.trim(),
        },

        // Ship To
        ship: {
            company: document.getElementById("shipParty").value,
            gst: document.getElementById("shipGST").value,
            address: document.getElementById("shipAddress").value,
            state: document.getElementById("shipState").value,
            pin: document.getElementById("shipPIN").value,
            pos: document.getElementById("shipPOS").value,
            city: document.getElementById("shipLoc").value.trim(),
        },

        // Transport
        transport: {
            transporter: document.getElementById("transporterName").value.trim(),
            transporterId: document.getElementById("transporterId").value.trim(),
            vehicleNo: document.getElementById("vehicleNo").value.trim().toUpperCase(),
            lrNo: document.getElementById("lrNo").value.trim(),
            lrDate: document.getElementById("lrDate").value,
            distance: Number(document.getElementById("distance").value || 0),
            freight: document.getElementById("freight").value.trim(),
            remark: document.getElementById("remark").value.trim()
        },

        // Summary
        summary: {
            assVal: Number(document.getElementById("assVal").value || 0),
            cgstVal: Number(document.getElementById("cgstVal").value || 0),
            sgstVal: Number(document.getElementById("sgstVal").value || 0),
            igstVal: Number(document.getElementById("igstVal").value || 0),
            otherCharges: Number(document.getElementById("otherCharges").value || 0),
            roundOff: Number(document.getElementById("roundOff").value || 0),
            total: Number(document.getElementById("totInvVal").value || 0)
        },
		
		// e-Invoice Details
einvoice: {

    irnNo: document.getElementById("irnNo").value.trim(),

    ackNo: document.getElementById("ackNo").value.trim(),

    ackDate: document.getElementById("ackDate").value.trim(),

    ewayBillNo: document.getElementById("ewayBillNo").value.trim(),

    signedQRCode: document.getElementById("signedQRCode").value

},

        // Items
        items: [],

        buyerName: document.getElementById("buyerParty").value,

        status: "Draft",

        synced: false,

        createdAt: window.currentInvoiceCreatedAt || new Date().toISOString(),

        updatedAt: new Date().toISOString()

    };


    //=========================================
    // Dynamic Item Collection
    //=========================================

    document.querySelectorAll("#itemBody .itemCard").forEach(function (card, index) {

        const itemSelect = card.querySelector(".itemName");

        invoice.items.push({

            slNo: index + 1,

            itemCode: itemSelect.value,

            itemName: itemSelect.value,

            hsn: card.querySelector(".hsn").value,

            unit: card.querySelector(".unit").value,

            qty: Number(card.querySelector(".qty").value || 0),

            rate: Number(card.querySelector(".rate").value || 0),

            amount: Number(card.querySelector(".amount").value || 0),

            gst: Number(card.querySelector(".gst").value || 0),

            gstAmt: Number(card.querySelector(".gstAmt").value || 0),

            total: Number(card.querySelector(".total").value || 0)

        });

    });

    return invoice;

}

async function saveCurrentInvoice() {

    try {

        const invoice = collectInvoiceData();

        // Validation
        if (!invoice.invoiceNo) {
            alert("Enter Invoice Number");
            return;
        }

        if (!invoice.invoiceDate) {
            alert("Select Invoice Date");
            return;
        }

        if (!invoice.seller.company) {
            alert("Select Seller");
            return;
        }

        if (!invoice.buyer.company) {
            alert("Select Buyer");
            return;
        }

        if (invoice.items.length === 0) {
            alert("Add at least one Item");
            return;
        }

        // Save into IndexedDB
        await saveInvoice(invoice);

        // Remember current invoice id / createdAt (so re-saves update, not duplicate)
        window.currentInvoiceId = invoice.id;
        window.currentInvoiceCreatedAt = invoice.createdAt;

        // Refresh History
        if (typeof loadInvoiceHistory === "function") {
            await loadInvoiceHistory();
        }

        alert("Invoice Saved Successfully");

        // Post-save: ask user if they want the e-invoice JSON right away
        if (confirm("Download e-Invoice JSON now?")) {
            downloadInvoiceJSON(invoice);
        }

    }
    catch (err) {

        console.error(err);

        alert(err.message);

    }

}


//======================================================
// New Invoice (reset form)
//======================================================

function newInvoice() {

    if (!confirm("Start a new invoice? Unsaved changes will be lost."))
        return;

    window.currentInvoiceId = null;
    window.currentInvoiceCreatedAt = null;

    // Reset invoice detail fields
   ["invoiceNo", "orderNo", "referenceNo", "referenceDate", "distance", "freight", "remark"].forEach(function (id) {
    document.getElementById(id).value = "";
});

const today = new Date().toISOString().split("T")[0];
document.getElementById("invoiceDate").value = today;

    // Reset seller
    document.getElementById("sellerParty").value = "";
    ["sellerGST", "sellerPOS", "sellerState", "sellerPIN", "sellerAddress"].forEach(function (id) {
        document.getElementById(id).value = "";
    });

    // Reset buyer / dispatch / ship
["buyer", "dispatch", "ship"].forEach(function (prefix) {
    document.getElementById(prefix + "Party").value = "";
    document.getElementById(prefix + "GST").value = "";
    document.getElementById(prefix + "POS").value = "";
    document.getElementById(prefix + "State").value = "";
    document.getElementById(prefix + "PIN").value = "";
    document.getElementById(prefix + "Address").value = "";
});

document.getElementById("buyerLoc").value = "";
document.getElementById("dispatchLoc").value = "";
document.getElementById("shipLoc").value = "";
document.getElementById("irnNo").value = "";
document.getElementById("ackNo").value = "";
document.getElementById("ackDate").value = "";
document.getElementById("ewayBillNo").value = "";
document.getElementById("signedQRCode").value = "";
    // Reset transport
  ["transporterName", "transporterId", "vehicleNo", "lrNo"].forEach(function (id) {
    document.getElementById(id).value = "";
});

document.getElementById("lrDate").value = today;

    // Reset summary
    document.getElementById("otherCharges").value = 0;
    document.getElementById("roundOff").value = 0;
    document.getElementById("assVal").value = "";
    document.getElementById("cgstVal").value = "";
    document.getElementById("sgstVal").value = "";
    document.getElementById("igstVal").value = "";
    document.getElementById("totInvVal").value = "";

    // Clear item rows and add one blank row
    document.getElementById("itemBody").innerHTML = "";
    itemNo = 0;
    addItemRow();
}


//======================================================
// Download current form as e-Invoice JSON
//======================================================

//======================================================
// Download current form as Tally-import XML
//======================================================

function handleDownloadTallyXML() {

    try {

        const invoice = collectInvoiceData();

        downloadTallyXML(invoice);

    }
    catch (err) {

        console.error(err);

        alert("Tally XML Failed\n\n" + err.message);

    }

}


//======================================================
// Send current form's Tally XML straight to the Tally
// bridge (Flask -> local Tally). Requires being online.
//======================================================

async function handleSendToTally() {

    const btn = document.getElementById("btnSendTally");

    try {

        const invoice = collectInvoiceData();

        btn.disabled = true;
        btn.innerHTML = "Sending...";

        await sendInvoiceToTally(invoice);

        alert("Invoice sent to Tally.");

    }
    catch (err) {

        console.error(err);

        alert("Send to Tally Failed\n\n" + err.message);

    }
    finally {

        btn.disabled = false;
        btn.innerHTML = "📡 Send to Tally";

    }

}


function downloadCurrentJSON() {

    try {

        const invoice = collectInvoiceData();

        downloadInvoiceJSON(invoice);

    }
    catch (err) {

        console.error(err);

        alert(err.message);

    }

}


//======================================================
// Read JSON text out of an uploaded file.
// Supports:
//   - a plain .json file (read as-is)
//   - a .zip file containing one (or more) .json files
//     inside it - the first .json entry found is used.
//======================================================
async function extractJSONTextFromFile(file) {

    const name = (file.name || "").toLowerCase();
    const isZip =
        name.endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed";

    if (!isZip) {
        return await file.text();
    }

    if (typeof JSZip === "undefined") {
        throw new Error(
            "ZIP support library (JSZip) not loaded - check your internet connection and reload the page."
        );
    }

    const zip = await JSZip.loadAsync(file);

    // Find the first entry (not a folder) ending in .json
    const jsonEntry = Object.values(zip.files).find(function (entry) {
        return !entry.dir && entry.name.toLowerCase().endsWith(".json");
    });

    if (!jsonEntry) {
        throw new Error("No .json file found inside the uploaded ZIP.");
    }

    return await jsonEntry.async("string");

}


async function handleEinvoiceJSON() {

    const fileInput = document.getElementById("jsonUpload");

    if (!fileInput.files.length) {
        alert("Please select JSON or ZIP file.");
        return;
    }

    try {

        let text = await extractJSONTextFromFile(fileInput.files[0]);

        text = text.trim();

        // ERP JSON Fix
        if (text.startsWith("\"{")) {

            text = text.substring(1, text.length - 1);

            text = text
                .replace(/\\"/g, "\"")
                .replace(/\\\\/g, "\\");

        }

        // Main JSON
        const obj = JSON.parse(text);

        if (!obj.SignedInvoice) {
            alert("SignedInvoice not found.");
            return;
        }

        // Decode SignedInvoice
        const payload = obj.SignedInvoice.split(".")[1];

        const jwt = JSON.parse(
            atob(
                payload
                    .replace(/-/g, "+")
                    .replace(/_/g, "/")
            )
        );

        const inv = JSON.parse(jwt.data);

        // Invoice No from JSON
        const jsonInvNo = (inv.DocDtls.No || "").trim();

        // Invoice No from Form
        const formInvNo = document.getElementById("invoiceNo").value.trim();

        // Blank Check
        if (formInvNo === "") {

            alert("Please enter Invoice Number first.");

            fileInput.value = "";

            return;

        }

        // Match Check
        if (formInvNo !== jsonInvNo) {

            alert(
                "Invoice Number Mismatch\n\n" +
                "Form : " + formInvNo +
                "\nJSON : " + jsonInvNo
            );

            fileInput.value = "";

            return;

        }

        // ===========================
        // MATCH -> UPDATE ONLY NOW
        // ===========================

        document.getElementById("irnNo").value = obj.Irn || "";
        document.getElementById("ackNo").value = obj.AckNo || "";
        document.getElementById("ackDate").value = obj.AckDt || "";
        document.getElementById("ewayBillNo").value = obj.EwbNo || "";
        document.getElementById("signedQRCode").value = obj.SignedQRCode || "";

        alert("e-Invoice Imported Successfully.");

    }
    catch (err) {

        console.error(err);

        alert("Import Failed\n\n" + err.message);

    }

    fileInput.value = "";

}
