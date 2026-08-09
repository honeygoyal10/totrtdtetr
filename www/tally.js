//========================================================
// tally.js
// Builds a Tally "GST SALES INVOICE" import XML from the
// invoice object returned by collectInvoiceData() (invoice.js),
// following the same structure as the sample XML voucher.
//
// NOTE (please verify against your Tally setup - these are
// reasonable defaults, not guaranteed to match your ledger names):
//   - STATENAME / PLACEOFSUPPLY  -> taken as the BUYER's state
//     (place of supply for the invoice)
//   - CMPGSTSTATE                -> the SELLER's own registered state
//   - Sales ledger name pattern  -> "State Sales {gst}%" (intra-state)
//                                   / "Central Sales {gst}%" (inter-state)
//   - Tax ledger name pattern    -> "CGST OUTPUT (x%)" / "SGST OUTPUT (x%)"
//                                   / "IGST OUTPUT (x%)"
// If your Tally company uses different ledger names, only the
// functions salesLedgerName() / taxLedgerNames() below need editing.
//========================================================


//--------------------------------------------------------
// XML-escape a value (prevents broken XML from special
// characters in party names / addresses / narration)
//--------------------------------------------------------
function escapeXML(v) {

    return String(v === undefined || v === null ? "" : v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}


//--------------------------------------------------------
// "yyyy-mm-dd" (HTML date input) -> "yyyymmdd" (Tally format)
//--------------------------------------------------------
function toTallyDate(dateStr) {

    if (!dateStr) return "";

    return String(dateStr).trim().replace(/-/g, "");

}


//--------------------------------------------------------
// e-Invoice ackDate ("YYYY-MM-DD HH:MM:SS", jaisa NIC AckDt deta hai)
// ko Tally ke IRNACKUPDATEDATETIME format (17-digit: yyyymmddHHMMSS000)
// me convert karta hai.
//--------------------------------------------------------
function toTallyDateTime(dtStr) {

    if (!dtStr) return "";

    const digits = String(dtStr).trim().replace(/[-:\s]/g, "");

    return digits + "000";

}


//--------------------------------------------------------
// Is this invoice intra-state (CGST+SGST) or inter-state (IGST)?
// Uses the same POS-code comparison already used in calc.js
//--------------------------------------------------------
function isIntraState(invoice) {

    return (invoice.seller.pos || "") === (invoice.buyer.pos || "");

}


//--------------------------------------------------------
// Ledger name patterns - EDIT HERE if your Tally company
// uses different ledger names.
//--------------------------------------------------------
function salesLedgerName(gstRate, intra) {

    return intra
        ? "State Sales " + gstRate + "%"
        : "INTERSTATE SALES (" + gstRate + "%)";

}

function taxLedgerNames(gstRate) {

    const half = round2(gstRate / 2);

    return {
        cgst: `CGST OUTPUT (${half}%)`,
        sgst: `SGST OUTPUT (${half}%)`,
        igst: `IGST OUTPUT (${gstRate}%)`
    };

}


//--------------------------------------------------------
// One <ALLINVENTORYENTRIES.LIST> block per invoice item
//--------------------------------------------------------
function buildInventoryEntry(item, invoice, intra) {

    const qty = round2(item.qty);
    const rate = round2(item.rate);
    const amount = round2(item.amount);
    const unit = txt(item.unit) || "MTS";
    const ledgerName = salesLedgerName(round2(item.gst), intra);

    const rateDetails = intra
        ? `
        <RATEDETAILS.LIST>
          <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
          <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
          <GSTRATE>${round2(item.gst / 2)}</GSTRATE>
        </RATEDETAILS.LIST>

        <RATEDETAILS.LIST>
          <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
          <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
          <GSTRATE>${round2(item.gst / 2)}</GSTRATE>
        </RATEDETAILS.LIST>`
        : `
        <RATEDETAILS.LIST>
          <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
          <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
          <GSTRATE>${round2(item.gst)}</GSTRATE>
        </RATEDETAILS.LIST>`;

    return `
      <ALLINVENTORYENTRIES.LIST>

        <STOCKITEMNAME>${escapeXML(item.itemName)}</STOCKITEMNAME>

        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>

        <RATE>${rate.toFixed(2)}/${escapeXML(unit)}</RATE>

        <ACTUALQTY>${qty} ${escapeXML(unit)}</ACTUALQTY>

        <BILLEDQTY>${qty} ${escapeXML(unit)}</BILLEDQTY>

        <AMOUNT>${amount.toFixed(2)}</AMOUNT>

        <BATCHALLOCATIONS.LIST>

          <GODOWNNAME>Main Location</GODOWNNAME>

          <BATCHNAME>Primary Batch</BATCHNAME>
          <ORDERNO>${escapeXML(invoice.orderNo)}</ORDERNO>
          <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>

          <AMOUNT>${amount.toFixed(2)}</AMOUNT>

          <ACTUALQTY>${qty} ${escapeXML(unit)}</ACTUALQTY>

          <BILLEDQTY>${qty} ${escapeXML(unit)}</BILLEDQTY>

        </BATCHALLOCATIONS.LIST>

        <ACCOUNTINGALLOCATIONS.LIST>

          <LEDGERNAME>${escapeXML(ledgerName)}</LEDGERNAME>

          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>

          <AMOUNT>${amount.toFixed(2)}</AMOUNT>

        </ACCOUNTINGALLOCATIONS.LIST>
${rateDetails}

      </ALLINVENTORYENTRIES.LIST>`;

}


//--------------------------------------------------------
// Party (buyer) ledger entry - always one, full invoice total
//--------------------------------------------------------
function buildPartyLedgerEntry(invoice) {

    const total = round2(invoice.summary.total);
    const negTotal = round2(-total);
    const billName = escapeXML(invoice.invoiceNo);

    return `
      <LEDGERENTRIES.LIST>

        <LEDGERNAME>${escapeXML(invoice.buyer.company)}</LEDGERNAME>

        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>

        <ISPARTYLEDGER>Yes</ISPARTYLEDGER>

        <AMOUNT>${negTotal.toFixed(2)}</AMOUNT>

        <BILLALLOCATIONS.LIST>

          <NAME>${billName}</NAME>

          <BILLTYPE>New Ref</BILLTYPE>

          <AMOUNT>${negTotal.toFixed(2)}</AMOUNT>

        </BILLALLOCATIONS.LIST>

      </LEDGERENTRIES.LIST>`;

}


//--------------------------------------------------------
// Tax ledger entries - grouped by GST rate (in case an
// invoice mixes items at different GST rates)
//--------------------------------------------------------
function buildTaxLedgerEntries(invoice, intra) {

    // Group items by their gst rate
    const groups = {};

    invoice.items.forEach(function (item) {

        const rate = round2(item.gst);
        const amount = round2(item.amount);

        if (!groups[rate]) {
            groups[rate] = { cgst: 0, sgst: 0, igst: 0 };
        }

        if (intra) {

            // Same formula as calc.js -> calculateRow():
            // cgst = +(amount * halfRate / 100).toFixed(2)
            // sgst = +(amount * halfRate / 100).toFixed(2)
            const halfRate = rate / 2;

            const cgst = round2(amount * halfRate / 100);
            const sgst = round2(amount * halfRate / 100);

            groups[rate].cgst = round2(groups[rate].cgst + cgst);
            groups[rate].sgst = round2(groups[rate].sgst + sgst);

        } else {

            // Same formula as calc.js -> calculateRow():
            // igst = +(amount * gst / 100).toFixed(2)
            const igst = round2(amount * rate / 100);

            groups[rate].igst = round2(groups[rate].igst + igst);

        }

    });

    let xml = "";

    Object.keys(groups).forEach(function (rate) {

        const g = groups[rate];
        const names = taxLedgerNames(Number(rate));

        if (intra) {

            xml += `
      <LEDGERENTRIES.LIST>

        <RATEOFINVOICETAX.LIST TYPE="Number">
          <RATEOFINVOICETAX>${round2(rate / 2)}</RATEOFINVOICETAX>
        </RATEOFINVOICETAX.LIST>

        <LEDGERNAME>${escapeXML(names.cgst)}</LEDGERNAME>

        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>

        <AMOUNT>${round2(g.cgst).toFixed(2)}</AMOUNT>

      </LEDGERENTRIES.LIST>

      <LEDGERENTRIES.LIST>

        <RATEOFINVOICETAX.LIST TYPE="Number">
          <RATEOFINVOICETAX>${round2(rate / 2)}</RATEOFINVOICETAX>
        </RATEOFINVOICETAX.LIST>

        <LEDGERNAME>${escapeXML(names.sgst)}</LEDGERNAME>

        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>

        <AMOUNT>${round2(g.sgst).toFixed(2)}</AMOUNT>

      </LEDGERENTRIES.LIST>`;

        } else {

            xml += `
      <LEDGERENTRIES.LIST>

        <RATEOFINVOICETAX.LIST TYPE="Number">
          <RATEOFINVOICETAX>${round2(rate)}</RATEOFINVOICETAX>
        </RATEOFINVOICETAX.LIST>

        <LEDGERNAME>${escapeXML(names.igst)}</LEDGERNAME>

        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>

        <AMOUNT>${round2(g.igst).toFixed(2)}</AMOUNT>

      </LEDGERENTRIES.LIST>`;

        }

    });

    return xml;

}


//--------------------------------------------------------
// Round-off ledger entry
//--------------------------------------------------------
function buildRoundOffEntry(invoice) {

    const roundOff = round2(invoice.summary.roundOff);

    // If roundOff is negative, the amount being added to the invoice is
    // actually a deduction - flip ISDEEMEDPOSITIVE accordingly so the
    // voucher still tallies. Verify this against a real Tally import.
    const isPositive = roundOff < 0 ? "Yes" : "No";

    return `
      <LEDGERENTRIES.LIST>

        <ROUNDTYPE>Normal Rounding</ROUNDTYPE>

        <LEDGERNAME>ROUND OFF</LEDGERNAME>

        <ISDEEMEDPOSITIVE>${isPositive}</ISDEEMEDPOSITIVE>

        <ROUNDLIMIT>1</ROUNDLIMIT>

        <AMOUNT>${Math.abs(roundOff).toFixed(2)}</AMOUNT>

      </LEDGERENTRIES.LIST>`;

}


//--------------------------------------------------------
// BASICORDERTERMS.LIST
// Line 1 ab invoice ke Freight field se aati hai (jaise "FOR"),
// jo order ke FRT column se autofill hoti hai - agar field khaali hai
// to "FOR" default fallback rehta hai. Line 2 fixed rehti hai
// ("DIRECT DELIVERY FROM"), line 3 me dispatch-from company ka naam,
// line 4 me dispatch state aata hai (jaisa real Tally export me hota hai).
//--------------------------------------------------------
function buildOrderTermsXML(dispatchCompany, dispatchState, orderTerm) {

    return `
      <BASICORDERTERMS.LIST TYPE="String">
        <BASICORDERTERMS>${escapeXML(orderTerm || "FOR")}</BASICORDERTERMS>
        <BASICORDERTERMS>DIRECT DELIVERY FROM</BASICORDERTERMS>
        <BASICORDERTERMS>${escapeXML(dispatchCompany)}</BASICORDERTERMS>
        <BASICORDERTERMS>${escapeXML(dispatchState)}</BASICORDERTERMS>
      </BASICORDERTERMS.LIST>`;

}


//--------------------------------------------------------
// EWAYBILLDETAILS.LIST
// Consignor/consignee address, place, pincode, state, and the
// TRANSPORTDETAILS.LIST (road/truck-no/vehicle-type etc.) are
// basic shipping info that should ALWAYS be present on the
// voucher - they don't depend on whether the e-way bill / IRN
// has been generated yet. Only the bill-specific fields
// (BILLNUMBER, ack timestamp) depend on eway.ewayBillNo /
// eway.ackDate being present; those are simply left blank when
// not yet available, instead of dropping the whole block.
//--------------------------------------------------------
function buildEwayBillXML(invoice, intra, dispatchCompany, dispatchAddress, dispatchPlace, dispatchState, dispatchPin, shipAddress, shipPlace, shipState, shipPin) {

    const eway = invoice.einvoice || {};

    const ackDateTimeXML = eway.ackDate
        ? `\n      <IRNACKUPDATEDATETIME>${toTallyDateTime(eway.ackDate)}</IRNACKUPDATEDATETIME>`
        : "";

    return `${ackDateTimeXML}
      <EWAYBILLDETAILS.LIST>

        <CONSIGNORADDRESS.LIST TYPE="String">
          <CONSIGNORADDRESS>${escapeXML(dispatchAddress)}</CONSIGNORADDRESS>
        </CONSIGNORADDRESS.LIST>

        <CONSIGNEEADDRESS.LIST TYPE="String">
          <CONSIGNEEADDRESS>${escapeXML(shipAddress)}</CONSIGNEEADDRESS>
        </CONSIGNEEADDRESS.LIST>

        <BILLDATE>${toTallyDate(invoice.invoiceDate)}</BILLDATE>

        <DOCUMENTTYPE>Tax Invoice</DOCUMENTTYPE>

        <CONSIGNEEPINCODE>${escapeXML(shipPin)}</CONSIGNEEPINCODE>

        <BILLNUMBER>${escapeXML(eway.ewayBillNo)}</BILLNUMBER>

        <SUBTYPE>Supply</SUBTYPE>

        <CONSIGNORPLACE>${escapeXML(dispatchPlace)}</CONSIGNORPLACE>

        <CONSIGNORPINCODE>${escapeXML(dispatchPin)}</CONSIGNORPINCODE>

        <CONSIGNEEPLACE>${escapeXML(shipPlace)}</CONSIGNEEPLACE>

        <CONSIGNORADDRESSTYPE>${escapeXML(dispatchCompany)}</CONSIGNORADDRESSTYPE>

        <SHIPPEDFROMSTATE>${escapeXML(dispatchState)}</SHIPPEDFROMSTATE>

        <SHIPPEDTOSTATE>${escapeXML(shipState)}</SHIPPEDTOSTATE>

        <IRPSOURCE>NIC1</IRPSOURCE>

        <ISCANCELLED>No</ISCANCELLED>

        <IGNOREGSTINVALIDATION>No</IGNOREGSTINVALIDATION>

        <ISCANCELPENDING>No</ISCANCELPENDING>

        <IGNOREGENERATIONVALIDATION>No</IGNOREGENERATIONVALIDATION>

        <ISEXPORTEDFORGENERATION>No</ISEXPORTEDFORGENERATION>

        <INTRASTATEAPPLICABILITY>${intra ? "Yes" : "No"}</INTRASTATEAPPLICABILITY>

        <TRANSPORTDETAILS.LIST>

          <DOCUMENTDATE>${toTallyDate(invoice.invoiceDate)}</DOCUMENTDATE>

          <TRANSPORTERID>${escapeXML(invoice.transport.transporterId)}</TRANSPORTERID>

          <TRANSPORTERNAME>${escapeXML(invoice.transport.transporter)}</TRANSPORTERNAME>

          <TRANSPORTMODE>1 - Road</TRANSPORTMODE>

          <VEHICLENUMBER>${escapeXML(invoice.transport.vehicleNo)}</VEHICLENUMBER>

          <OLDVEHICLETYPE>R - Regular</OLDVEHICLETYPE>

          <VEHICLETYPE>R - Regular</VEHICLETYPE>

          <DISTANCE>${escapeXML(invoice.transport.distance)}</DISTANCE>

        </TRANSPORTDETAILS.LIST>

      </EWAYBILLDETAILS.LIST>`;

}


//--------------------------------------------------------
// Narration line
//--------------------------------------------------------
function buildNarration(invoice) {

    const itemNames = invoice.items.map(i => i.itemName).filter(Boolean).join(", ");

    const totalQty = round2(
        invoice.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0)
    );

    const unit = (invoice.items[0] && invoice.items[0].unit) || "MTS";

    return (
        `BEING SALE TO PARTY AGAINST OUR INVOICE NO ${invoice.invoiceNo} ` +
        `MATERIAL ${itemNames} TOTAL QTY- ${totalQty} ${unit} ` +
        (invoice.transport.vehicleNo ? `THROUGH TRUCK NO ${invoice.transport.vehicleNo} ` : "") +
        (invoice.transport.transporter ? `BY TRANSPORTER ${invoice.transport.transporter}` : "")
    ).trim();

}


//--------------------------------------------------------
// Main entry point: invoice (from collectInvoiceData()) -> XML string
//--------------------------------------------------------
function generateTallyXML(invoice) {

    if (!invoice.invoiceNo) throw new Error("Invoice Number Missing");
    if (!invoice.seller.company) throw new Error("Seller Missing");
    if (!invoice.buyer.company) throw new Error("Buyer Missing");
    if (!invoice.items.length) throw new Error("No Items Found");

    const intra = isIntraState(invoice);

    // Today's actual date (not the invoice date) - used for
    // BILLOFLADINGDATE, since the LR/bill-of-lading date should
    // reflect when this XML is being pushed, not the invoice date.
    const today = new Date();
    const currentTallyDate =
        today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");

    // Company/seller's own registered details.
    // If SELLERS[] (defined at the top of invoice.js) has this seller,
    // prefer that for the seller's own place/state - falls back to the
    // form fields otherwise.
    const sellerInfo = (typeof SELLERS !== "undefined" && SELLERS[invoice.seller.company])
        ? SELLERS[invoice.seller.company]
        : null;

    const cmpGstState = (sellerInfo && sellerInfo.state) || invoice.seller.state || "";
    const cmpLoc = (sellerInfo && sellerInfo.LOC) || invoice.seller.city || "";

    const dispatchCompany = invoice.dispatch.company || invoice.seller.company;
    const dispatchState = invoice.dispatch.state || cmpGstState;
    const dispatchPin = invoice.dispatch.pin || invoice.seller.pin;
    const dispatchPlace = invoice.dispatch.city || cmpLoc;
    const dispatchAddress = invoice.dispatch.address || invoice.seller.address;

    const shipCompany = invoice.ship.company || invoice.buyer.company;
    const shipGst = invoice.ship.gst || invoice.buyer.gst;
    const shipPin = invoice.ship.pin || invoice.buyer.pin;
    const shipState = invoice.ship.state || invoice.buyer.state;
    const shipPlace = invoice.ship.city || invoice.buyer.city;
    const shipAddress = invoice.ship.address || invoice.buyer.address;

    const inventoryXML = invoice.items
        .map(item => buildInventoryEntry(item, invoice, intra))
        .join("");

    const partyLedgerXML = buildPartyLedgerEntry(invoice);
    const taxLedgerXML = buildTaxLedgerEntries(invoice, intra);
    const roundOffXML = buildRoundOffEntry(invoice);
    const narration = escapeXML(buildNarration(invoice));

    const orderTermsXML = buildOrderTermsXML(dispatchCompany, dispatchState, invoice.transport.freight);

    const ewayBillXML = buildEwayBillXML(
        invoice, intra,
        dispatchCompany, dispatchAddress, dispatchPlace, dispatchState, dispatchPin,
        shipAddress, shipPlace, shipState, shipPin
    );

    // IRN - sirf tab jab e-invoice JSON upload karke irnNo bhara ja
    // chuka ho (invoice.js -> handleEinvoiceJSON). PARTYPINCODE ke
    // turant baad rehta hai (jaisa aapke diye gaye sample me tha).
    // IRNACKNO/IRNACKDATE/IRNIRPSOURCE bhi saath me zaroori hai -
    // inke bina Tally ka GST validation IRN ko "incomplete" maan
    // ke voucher hi reject/mismatch kar deta hai.
    const eway = invoice.einvoice || {};

    const irnXML = eway.irnNo
        ? `
      <IRN>${escapeXML(eway.irnNo)}</IRN>

      <IRNACKNO>${escapeXML(eway.ackNo)}</IRNACKNO>

      <IRNACKDATE>${toTallyDate((eway.ackDate || "").split(" ")[0])}</IRNACKDATE>

      <IRNIRPSOURCE>NIC1</IRNIRPSOURCE>

      <IRNQRCODE>${escapeXML(eway.signedQRCode)}</IRNQRCODE>`
        : "";

    // ISEWAYBILLAPPLICABLE - transport/shipping details are now always
    // sent (see buildEwayBillXML), so this flag is always rendered too,
    // set Yes only once an actual e-way bill number exists.
    const isEwayApplicableXML = `
      <ISEWAYBILLAPPLICABLE>${eway.ewayBillNo ? "Yes" : "No"}</ISEWAYBILLAPPLICABLE>`;

    return `<ENVELOPE>

 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>

 <BODY>

  <IMPORTDATA>

   <REQUESTDESC>

    <REPORTNAME>Vouchers</REPORTNAME>

    <STATICVARIABLES>
      <SVCURRENTCOMPANY>${escapeXML(invoice.seller.company)}</SVCURRENTCOMPANY>
    </STATICVARIABLES>

   </REQUESTDESC>

   <REQUESTDATA>

    <TALLYMESSAGE xmlns:UDF="TallyUDF">

     <VOUCHER
        VCHTYPE="GST SALES INVOICE"
        ACTION="Create"
        OBJVIEW="Invoice Voucher View">

      <DATE>${toTallyDate(invoice.invoiceDate)}</DATE>

      <EFFECTIVEDATE>${toTallyDate(invoice.invoiceDate)}</EFFECTIVEDATE>

      <REFERENCEDATE>${toTallyDate(invoice.referenceDate || invoice.invoiceDate)}</REFERENCEDATE>

      <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>

      <STATENAME>${escapeXML(invoice.buyer.state)}</STATENAME>

      <PLACEOFSUPPLY>${escapeXML(invoice.buyer.state)}</PLACEOFSUPPLY>

      <VOUCHERTYPENAME>GST SALES INVOICE</VOUCHERTYPENAME>

      <PARTYNAME>${escapeXML(invoice.buyer.company)}</PARTYNAME>

      <PARTYLEDGERNAME>${escapeXML(invoice.buyer.company)}</PARTYLEDGERNAME>

      <PARTYGSTIN>${escapeXML(invoice.buyer.gst)}</PARTYGSTIN>

      <VOUCHERNUMBER>${escapeXML(invoice.invoiceNo)}</VOUCHERNUMBER>

      <REFERENCE>${escapeXML(invoice.referenceNo || invoice.orderNo)}</REFERENCE>

      <PARTYMAILINGNAME>${escapeXML(invoice.buyer.company)}</PARTYMAILINGNAME>

      <PARTYPINCODE>${escapeXML(invoice.buyer.pin)}</PARTYPINCODE>

      <CMPGSTSTATE>${escapeXML(cmpGstState)}</CMPGSTSTATE>

      <ISINVOICE>Yes</ISINVOICE>

      <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>

      <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>

      <BASICBUYERNAME>${escapeXML(shipCompany)}</BASICBUYERNAME>

      <BASICBASEPARTYNAME>${escapeXML(invoice.buyer.company)}</BASICBASEPARTYNAME>

      <BASICDUEDATEOFPYMT>${escapeXML(invoice.transport.remark || "NEXT DAY")}</BASICDUEDATEOFPYMT>

      <BILLTOPLACE>${escapeXML(invoice.buyer.city)}</BILLTOPLACE>

      <SHIPTOPLACE>${escapeXML(shipPlace)}</SHIPTOPLACE>

      <CONSIGNEEGSTIN>${escapeXML(shipGst)}</CONSIGNEEGSTIN>

      <CONSIGNEEMAILINGNAME>${escapeXML(shipCompany)}</CONSIGNEEMAILINGNAME>

      <CONSIGNEEPINCODE>${escapeXML(shipPin)}</CONSIGNEEPINCODE>

      <CONSIGNEESTATENAME>${escapeXML(shipState)}</CONSIGNEESTATENAME>

      <CONSIGNEECOUNTRYNAME>India</CONSIGNEECOUNTRYNAME>

      <DISPATCHFROMNAME>${escapeXML(dispatchCompany)}</DISPATCHFROMNAME>

      <DISPATCHFROMSTATENAME>${escapeXML(dispatchState)}</DISPATCHFROMSTATENAME>

      <DISPATCHFROMPINCODE>${escapeXML(dispatchPin)}</DISPATCHFROMPINCODE>

      <DISPATCHFROMPLACE>${escapeXML(dispatchPlace)}</DISPATCHFROMPLACE>

      <BASICSHIPPEDBY>${escapeXML(invoice.transport.transporter)}</BASICSHIPPEDBY>

      <BASICFINALDESTINATION>${escapeXML(shipPlace)}</BASICFINALDESTINATION>

      <BASICSHIPVESSELNO>${escapeXML(invoice.transport.vehicleNo)}</BASICSHIPVESSELNO>

      <BILLOFLADINGNO>${escapeXML(invoice.transport.lrNo)}</BILLOFLADINGNO>

      <BILLOFLADINGDATE>${currentTallyDate}</BILLOFLADINGDATE>

      <ADDRESS.LIST TYPE="String">
        <ADDRESS>${escapeXML(invoice.buyer.address)}</ADDRESS>
      </ADDRESS.LIST>

      <BASICBUYERADDRESS.LIST TYPE="String">
        <BASICBUYERADDRESS>${escapeXML(shipAddress)}</BASICBUYERADDRESS>
      </BASICBUYERADDRESS.LIST>

      <DISPATCHFROMADDRESS.LIST TYPE="String">
        <DISPATCHFROMADDRESS>${escapeXML(dispatchAddress)}</DISPATCHFROMADDRESS>
      </DISPATCHFROMADDRESS.LIST>

      <NARRATION>
${narration}
      </NARRATION>

      <!-- INVENTORY -->
${inventoryXML}

      <!-- PARTY LEDGER -->
${partyLedgerXML}

      <!-- TAX -->
${taxLedgerXML}

      <!-- ROUND OFF -->
${roundOffXML}

      <!-- E-INVOICE / E-WAY BILL (naye fields, sab end me) -->
${irnXML}
${isEwayApplicableXML}
${orderTermsXML}
${ewayBillXML}

     </VOUCHER>

    </TALLYMESSAGE>

   </REQUESTDATA>

  </IMPORTDATA>

 </BODY>

</ENVELOPE>
`;

}


//--------------------------------------------------------
// Download the generated XML as a file (works fully offline)
//--------------------------------------------------------
function downloadTallyXML(invoice) {

    const xml = generateTallyXML(invoice);

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = (invoice.invoiceNo || "invoice").replace(/[\\\/:*?"<>|]/g, "_") + ".xml";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

}


//--------------------------------------------------------
// Send the generated XML to the Flask bridge, which forwards
// it to the local Tally instance. Requires being online and
// the bridge server (/send-invoice) to be reachable.
//--------------------------------------------------------
async function sendInvoiceToTally(invoice) {

    const xml = generateTallyXML(invoice);

    const url = (window.APP_CONFIG?.BASE_URL || "") + "/send-invoice";

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml
    });

    const text = await res.text();

    if (!res.ok) {
        throw new Error(`Tally bridge returned ${res.status}: ${text}`);
    }

    return text;

}
