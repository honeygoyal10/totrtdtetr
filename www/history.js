// history.js

async function loadInvoiceHistory() {

    const invoices = await getLatestInvoices();

    const div = document.getElementById("invoiceHistory");

    div.innerHTML = "";

    if (invoices.length === 0) {

        div.innerHTML = `
            <div class="alert alert-warning text-center">
                No Invoice Found
            </div>
        `;

        return;
    }

    invoices.forEach(function (inv) {

        const card = document.createElement("div");

        card.className = "card shadow-sm mb-3";

        card.innerHTML = `

            <div class="card-body">

                <div class="row">

                    <div class="col-8">

                        <h6 class="mb-1">
                            ${inv.invoiceNo}
                        </h6>

                        <small class="text-muted">

                            ${inv.invoiceDate}

                        </small>

                        <br>

                        <strong>

                            ${inv.buyerName}

                        </strong>

                    </div>

                    <div class="col-4 text-end">

                        <h5>

                            ₹ ${Number(inv.summary.total).toLocaleString()}

                        </h5>

                    </div>

                </div>

                <hr>

                <div class="d-flex gap-2">

                    <button
                        class="btn btn-primary btn-sm"
                        onclick="editInvoice('${inv.id}')">

                        Edit

                    </button>

                    <button
                        class="btn btn-danger btn-sm"
                        onclick="deleteCurrentInvoice('${inv.id}')">

                        Delete

                    </button>

                    <button
                        class="btn btn-success btn-sm"
                        onclick="downloadInvoiceJSONById('${inv.id}')">

                        JSON

                    </button>

                </div>

            </div>

        `;

        div.appendChild(card);

    });

}



//-----------------------------

// Delete

//-----------------------------

async function deleteCurrentInvoice(id) {

    if (!confirm("Delete Invoice ?"))

        return;

    await deleteInvoice(id);

    loadInvoiceHistory();

}



//-----------------------------

// Edit (still pending - not part of this scope)

//-----------------------------
async function editInvoice(id) {

    const invoice = await getInvoice(id);

    if (!invoice) {
        alert("Invoice not found.");
        return;
    }

    // Remember current invoice
    window.currentInvoiceId = invoice.id;
    window.currentInvoiceCreatedAt = invoice.createdAt;

    // Invoice
    document.getElementById("invoiceNo").value = invoice.invoiceNo || "";
    document.getElementById("invoiceDate").value = invoice.invoiceDate || "";
    document.getElementById("orderNo").value = invoice.orderNo || "";
    document.getElementById("referenceNo").value = invoice.referenceNo || "";
    document.getElementById("referenceDate").value = invoice.referenceDate || "";
    document.getElementById("distance").value = invoice.transport.distance || "";
    document.getElementById("freight").value = invoice.transport.freight || "";
    document.getElementById("remark").value = invoice.transport.remark || "";

    // Seller
    document.getElementById("sellerParty").value = invoice.seller.company || "";
    fillSeller();

    // Buyer
    document.getElementById("buyerParty").value = invoice.buyer.company || "";
    await fillParty("buyer");
    document.getElementById("buyerLoc").value = invoice.buyer.city || "";

    // Dispatch
    document.getElementById("dispatchParty").value = invoice.dispatch.company || "";
    await fillParty("dispatch");
    document.getElementById("dispatchLoc").value = invoice.dispatch.city || "";

    // Ship
    document.getElementById("shipParty").value = invoice.ship.company || "";
    await fillParty("ship");
    document.getElementById("shipLoc").value = invoice.ship.city || "";

    // Transport
    document.getElementById("transporterName").value = invoice.transport.transporter || "";
    document.getElementById("transporterId").value = invoice.transport.transporterId || "";
    document.getElementById("vehicleNo").value = invoice.transport.vehicleNo || "";
    document.getElementById("lrNo").value = invoice.transport.lrNo || "";
    document.getElementById("lrDate").value = invoice.transport.lrDate || "";

    // Summary
    document.getElementById("otherCharges").value = invoice.summary.otherCharges || 0;
    document.getElementById("roundOff").value = invoice.summary.roundOff || 0;

    // eInvoice
    if (invoice.einvoice) {
        document.getElementById("irnNo").value = invoice.einvoice.irnNo || "";
        document.getElementById("ackNo").value = invoice.einvoice.ackNo || "";
        document.getElementById("ackDate").value = invoice.einvoice.ackDate || "";
        document.getElementById("ewayBillNo").value = invoice.einvoice.ewayBillNo || "";
        document.getElementById("signedQRCode").value = invoice.einvoice.signedQRCode || "";
    }

    // Items
    document.getElementById("itemBody").innerHTML = "";
    itemNo = 0;

    for (const item of invoice.items) {

        addItemRow();

        const card = document.querySelectorAll(".itemCard")[itemNo - 1];

        const select = card.querySelector(".itemName");

        select.value = item.itemCode;

        await loadItemDetails(select);

        card.querySelector(".hsn").value = item.hsn;
        card.querySelector(".unit").value = item.unit;
        card.querySelector(".qty").value = item.qty;
        card.querySelector(".rate").value = item.rate;
        card.querySelector(".gst").value = item.gst;

        calculateRow(card);
    }

    calculateInvoice();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    alert("Invoice loaded for editing.");
}