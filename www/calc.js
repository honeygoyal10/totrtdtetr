function calculateRow(row) {

    let qty = parseFloat(row.querySelector(".qty").value) || 0;
    let rate = parseFloat(row.querySelector(".rate").value) || 0;
    let gst = parseFloat(row.querySelector(".gst").value) || 0;

    let amount = +(qty * rate).toFixed(2);

    row.querySelector(".amount").value = amount.toFixed(2);

    let buyerPOS = document.getElementById("buyerPOS").value;
    let sellerPOS = document.getElementById("sellerPOS").value;

    let cgst = 0,
        sgst = 0,
        igst = 0;

    if (buyerPOS == sellerPOS) {

        let halfRate = gst / 2;

        cgst = +(amount * halfRate / 100).toFixed(2);
        sgst = +(amount * halfRate / 100).toFixed(2);

    } else {

        igst = +(amount * gst / 100).toFixed(2);

    }

    let gstAmt = +(cgst + sgst + igst).toFixed(2);

    row.querySelector(".gstAmt").value = gstAmt.toFixed(2);
    row.querySelector(".total").value = (amount + gstAmt).toFixed(2);

    calculateInvoice();
}



function calculateInvoice() {

    let assVal = 0,
        cgstVal = 0,
        sgstVal = 0,
        igstVal = 0,
        total = 0;

    let buyerPOS = document.getElementById("buyerPOS").value;
    let sellerPOS = document.getElementById("sellerPOS").value;

    document.querySelectorAll("#itemBody .itemCard").forEach(row => {

        let amount = parseFloat(row.querySelector(".amount").value) || 0;
        let gst = parseFloat(row.querySelector(".gst").value) || 0;

        assVal += amount;

        if (buyerPOS == sellerPOS) {

            let halfRate = gst / 2;

            cgstVal += +(amount * halfRate / 100).toFixed(2);
            sgstVal += +(amount * halfRate / 100).toFixed(2);

        } else {

            igstVal += +(amount * gst / 100).toFixed(2);

        }

        total += parseFloat(row.querySelector(".total").value) || 0;

    });

    assVal = +assVal.toFixed(2);
    cgstVal = +cgstVal.toFixed(2);
    sgstVal = +sgstVal.toFixed(2);
    igstVal = +igstVal.toFixed(2);
    total = +total.toFixed(2);

    let other = parseFloat(document.getElementById("otherCharges").value) || 0;

    let totalBeforeRound = total + other;

    let decimal = totalBeforeRound - Math.floor(totalBeforeRound);

    let round = decimal < 0.50 ? -decimal : 1 - decimal;

    round = +round.toFixed(2);

    let finalTotal = +(totalBeforeRound + round).toFixed(2);

    document.getElementById("assVal").value = assVal.toFixed(2);
    document.getElementById("cgstVal").value = cgstVal.toFixed(2);
    document.getElementById("sgstVal").value = sgstVal.toFixed(2);
    document.getElementById("igstVal").value = igstVal.toFixed(2);

    document.getElementById("roundOff").value = round.toFixed(2);
    document.getElementById("totInvVal").value = finalTotal.toFixed(2);
}