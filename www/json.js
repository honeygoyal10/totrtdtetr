//========================================================
// json.js
// NIC e-Invoice / e-Way Bill JSON Generator
// Transaction Type = 4
//========================================================


//--------------------------------------------------------
// Date Format
// yyyy-mm-dd  -> dd/mm/yyyy
//--------------------------------------------------------

function formatNICDate(dateStr) {

    if (!dateStr) return "";

    const d = new Date(dateStr);

    if (isNaN(d)) return "";

    const day = String(d.getDate()).padStart(2, "0");

    const month = String(d.getMonth() + 1).padStart(2, "0");

    const year = d.getFullYear();

    return `${day}/${month}/${year}`;

}



//--------------------------------------------------------
// Number
//--------------------------------------------------------

function num(v) {

    const n = parseFloat(v);

    return isNaN(n) ? 0 : n;

}


//--------------------------------------------------------
// Round 2 Decimal
//--------------------------------------------------------

function round2(v) {

    const n = parseFloat(v);

    if (isNaN(n)) return 0;

    return Number(n.toFixed(2));

}


//--------------------------------------------------------
// String
//--------------------------------------------------------

function txt(v) {

    if (v === undefined || v === null)
        return "";

    return String(v).trim();

}



//--------------------------------------------------------
// Download JSON
//--------------------------------------------------------

function downloadJSON(filename, data) {

    const json = JSON.stringify(data, null, 2);

    const blob = new Blob(
        [json],
        {
            type: "application/json"
        }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = filename;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

}



//--------------------------------------------------------
// Validation
//--------------------------------------------------------

function validateInvoice(invoice) {

    if (!invoice)
        throw new Error("Invoice Data Missing");

    if (!invoice.invoiceNo)
        throw new Error("Invoice Number Missing");

    if (!invoice.invoiceDate)
        throw new Error("Invoice Date Missing");

    if (!invoice.seller.gst)
        throw new Error("Seller GST Missing");

    if (!invoice.buyer.gst)
        throw new Error("Buyer GST Missing");

    if (invoice.items.length === 0)
        throw new Error("No Item Found");

}



//--------------------------------------------------------
// Create Empty NIC JSON
//--------------------------------------------------------

function createNICJSON(invoice) {

    validateInvoice(invoice);

    return {

        Version: "1.1",

        TranDtls: {

            TaxSch: "GST",

            SupTyp: "B2B",

            RegRev: "N",

            EcmGstin: null,

            IgstOnIntra: "N",

            TrnTyp: "4"

        },

        DocDtls: {

            Typ: "INV",

            No: txt(invoice.invoiceNo),

            Dt: formatNICDate(invoice.invoiceDate)

        }

    };

}
//========================================================
// Address Line 2 Helper
// NIC requires Addr2 to be either OMITTED entirely, or
// a string of at least 3 characters. Never send "".
//========================================================
function addr2(v) {

    const s = String(v === undefined || v === null ? "" : v).trim();

    if (s.length < 3) return undefined;

    return s.substring(0, 100);

}

//========================================================
// Attach Addr2 Only If Valid
//========================================================
function withAddr2(obj, value) {

    const a2 = addr2(value);

    if (a2 !== undefined) {
        obj.Addr2 = a2;
    }

    return obj;

}

//========================================================
// Seller Details
//========================================================
function buildSeller(invoice) {

    const obj = {

        Gstin: txt(invoice.seller.gst),

        LglNm: txt(invoice.seller.company),

        Addr1: addr(invoice.seller.address),

        Loc: "BHILAI",

        Pin: num(invoice.seller.pin),

        Stcd: txt(invoice.seller.pos)

    };

    return withAddr2(obj, invoice.seller.address2);

}
//========================================================
// Buyer Details
//========================================================
function buildBuyer(invoice) {

    const obj = {

        Gstin: txt(invoice.buyer.gst),

        LglNm: txt(invoice.buyer.company),

        Pos: txt(invoice.buyer.pos),

        Addr1: addr(invoice.buyer.address),

        Loc: txt(invoice.buyer.city),

        Pin: num(invoice.buyer.pin),

        Stcd: txt(invoice.buyer.pos)

    };

    return withAddr2(obj, invoice.buyer.address2);

}

//========================================================
// Dispatch Details
//========================================================

function buildDispatch(invoice) {

    const obj = {

        Nm: txt(invoice.dispatch.company),

        Addr1: addr(invoice.dispatch.address),

        Loc: txt(invoice.dispatch.city),

        Pin: num(invoice.dispatch.pin),

        Stcd: txt(invoice.dispatch.pos)

    };

    return withAddr2(obj, invoice.dispatch.address2);

}

//========================================================
// Ship Details
//========================================================

function buildShip(invoice) {

    const obj = {

        Gstin: txt(invoice.ship.gst),

        LglNm: txt(invoice.ship.company),

        Addr1: addr(invoice.ship.address),

        Loc: txt(invoice.ship.city),

        Pin: num(invoice.ship.pin),

        Stcd: txt(invoice.ship.pos)

    };

    return withAddr2(obj, invoice.ship.address2);

}


//========================================================
// Attach Party Details
//========================================================

function addPartyDetails(json, invoice) {

    json.SellerDtls = buildSeller(invoice);

    json.BuyerDtls = buildBuyer(invoice);

    json.DispDtls = buildDispatch(invoice);

    json.ShipDtls = buildShip(invoice);

    return json;

}
//========================================================
// Build Item List
//========================================================

//========================================================
// Build Item List
//========================================================

function buildItemList(invoice) {

    const items = [];

    invoice.items.forEach(function (item, index) {

        const gstRate = round2(item.gst);
        const assAmt = round2(item.amount);
        const qty = round2(item.qty);
        const rate = round2(item.rate);
        const total = round2(item.total);

        let igst = 0;
        let cgst = 0;
        let sgst = 0;

        if (invoice.summary.igstVal > 0) {

            igst = round2(item.gstAmt);

        } else {

            cgst = round2(item.gstAmt / 2);
            sgst = round2(item.gstAmt - cgst);

        }

        items.push({

            SlNo: String(index + 1),

            PrdDesc: txt(item.itemName),

            IsServc: "N",

            HsnCd: txt(item.hsn),

            Qty: qty,

            FreeQty: 0,

            Unit: txt(item.unit),

            UnitPrice: rate,

            TotAmt: assAmt,

            Discount: 0,

            AssAmt: assAmt,

            GstRt: gstRate,

            IgstAmt: igst,

            CgstAmt: cgst,

            SgstAmt: sgst,

            CesRt: 0,

            CesAmt: 0,

            CesNonAdvlAmt: 0,

            TotItemVal: total

        });

    });

    return items;

}

//========================================================
// Value Details
//========================================================

//========================================================
// Value Details
//========================================================

function buildValueDetails(invoice) {

    return {

        AssVal: round2(invoice.summary.assVal),

        CgstVal: round2(invoice.summary.cgstVal),

        SgstVal: round2(invoice.summary.sgstVal),

        IgstVal: round2(invoice.summary.igstVal),

        CesVal: 0,

        Discount: 0,

        OthChrg: round2(invoice.summary.otherCharges),

        RndOffAmt: round2(invoice.summary.roundOff),

        TotInvVal: round2(invoice.summary.total)

    };

}


//========================================================
// E-Way Bill Details
//========================================================

function buildEway(invoice) {

    return {

        TransId: txt(invoice.transport.transporterId) || null,

        TransName: txt(invoice.transport.transporter),

        TransMode: "1",

        Distance: num(invoice.transport.distance),

        TransDocNo: txt(invoice.transport.lrNo) || null,

        TransDocDt: formatNICDate(invoice.transport.lrDate),

        VehNo: txt(invoice.transport.vehicleNo),

        VehType: "R"

    };

}

//========================================================
// Generate Complete NIC JSON
//========================================================

function generateNICJSON(invoice) {

    let json = createNICJSON(invoice);

    // Party Details
    json = addPartyDetails(json, invoice);

    // Item Details
    json.ItemList = buildItemList(invoice);

    // Invoice Summary
    json.ValDtls = buildValueDetails(invoice);

    // E-Way Details
    json.EwbDtls = buildEway(invoice);

    // NIC Download Format
    return [json];

}



//========================================================
// Safe File Name
//========================================================

function makeJSONFileName(invoiceNo) {

    return txt(invoiceNo)
        .replace(/[\\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        + ".json";

}

function addr(v) {

    if (v === undefined || v === null)
        return "";

    return String(v).trim().substring(0,100);

}


//========================================================
// Download JSON from Invoice Object
//========================================================

function downloadInvoiceJSON(invoice) {

    const json = generateNICJSON(invoice);

    const fileName = makeJSONFileName(invoice.invoiceNo);

    downloadJSON(fileName, json);

}



//========================================================
// Download JSON By Invoice ID
//========================================================

async function downloadInvoiceJSONById(id) {

    try {

        const invoice = await getInvoice(id);

        if (!invoice) {

            alert("Invoice Not Found");

            return;

        }

        downloadInvoiceJSON(invoice);

    }

    catch (e) {

        console.error(e);

        alert(e.message);

    }

}
