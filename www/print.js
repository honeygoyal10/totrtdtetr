// ===============================================
// GST Invoice Print Module
// Version : 1.1
// ===============================================

function printInvoice() {

    const invoice = collectInvoiceData();

    const html = generateInvoiceHTML(invoice);

    const win = window.open("", "_blank");

    win.document.open();

    win.document.write(html);

    win.document.close();

    win.focus();

    setTimeout(function () {

        win.print();

        // win.close();   // Agar print ke baad window automatically band karni ho to uncomment kar dena.

    }, 500);

}

function getBankDetailsBySellerGSTIN(gstin) {

    const bankMap = {

        "22AAMCS2023E1ZV": {

            beneficiary: "SHRI JAI BABA CASTING PVT. LTD.",

            accountNo: "685044000195",

            bankName: "KOTAK MAHINDRA BANK LTD",

            ifsc: "KKBK0006429",

            branch: "NEHRU NAGAR EAST"

        },

        "22AEYFS8700D1ZV": {

            beneficiary: "SHRI JAIBABA DIVYA TRADING LLP",

            accountNo: "5347768804",

            bankName: "KOTAK MAHINDRA BANK LTD",

            ifsc: "KKBK0006429",

            branch: "NEHRU NAGAR EAST"

        }

    };

    return bankMap[gstin] || {

        beneficiary: "",

        accountNo: "",

        bankName: "",

        ifsc: "",

        branch: ""

    };

}


function numberToWords(num) {

    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five',
        'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
        'Fifteen', 'Sixteen', 'Seventeen',
        'Eighteen', 'Nineteen'
    ];

    const b = [
        '', '', 'Twenty', 'Thirty', 'Forty',
        'Fifty', 'Sixty', 'Seventy',
        'Eighty', 'Ninety'
    ];

    if ((num = num.toString()).length > 9)
        return "Overflow";

    let n = ('000000000' + num)
        .substr(-9)
        .match(/^(\d{2})(\d{2})(\d{2})(\d)(\d{2})$/);

    if (!n)
        return "";

    let str = "";

    str += (n[1] != 0)
        ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " Crore "
        : "";

    str += (n[2] != 0)
        ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " Lakh "
        : "";

    str += (n[3] != 0)
        ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " Thousand "
        : "";

    str += (n[4] != 0)
        ? a[n[4]] + " Hundred "
        : "";

    str += (n[5] != 0)
        ? ((str != "") ? "and " : "") +
        (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]])
        : "";

    return str.trim() + " Rupees Only";

}


function generateInvoiceHTML(invoice) {

return `
<!DOCTYPE html>
<html>
<head>

<meta charset="utf-8">

<title>Invoice ${invoice.invoiceNo}</title>

<style>

body{
    font-family:Arial,sans-serif;
    margin:15px;
    font-size:12px;
}

table{
    width:100%;
    border-collapse:collapse;
}

td,th{
    border:1px solid #000;
    padding:5px;
    vertical-align:top;
}

h2,h3{
    margin:2px;
    text-align:center;
}

.small{
    font-size:11px;
}

th{
background:#efefef;
}

td{
font-size:12px;
}

thead{
display:table-header-group;
}

@page{

size:A4;

margin:10mm;

}

@media print{

body{

margin:0;

-webkit-print-color-adjust:exact;

print-color-adjust:exact;

}

table{

page-break-inside:auto;

}

tr{

page-break-inside:avoid;

}

thead{

display:table-header-group;

}

tfoot{

display:table-footer-group;

}

}

</style>

</head>

<body>

<h2>TAX INVOICE</h2>

<h3>${invoice.seller.company}</h3>

<div style="text-align:center">
GSTIN : ${invoice.seller.gst}
</div>

<br>

<table>

<tr>

<td width="50%">

<b>Seller</b><br><br>

${invoice.seller.company}<br>

${invoice.seller.address}<br>

${invoice.seller.city}<br>

${invoice.seller.state} - ${invoice.seller.pin}<br>

GSTIN : ${invoice.seller.gst}

</td>

<td width="50%">

<b>Buyer</b><br><br>

${invoice.buyer.company}<br>

${invoice.buyer.address}<br>

${invoice.buyer.city}<br>

${invoice.buyer.state} - ${invoice.buyer.pin}<br>

GSTIN : ${invoice.buyer.gst}

</td>

</tr>

</table>

<br>

<table>

<tr>

<td><b>Invoice No</b></td>

<td>${invoice.invoiceNo}</td>

<td><b>Date</b></td>

<td>${invoice.invoiceDate}</td>

</tr>

<tr>

<td><b>Order No</b></td>

<td>${invoice.orderNo}</td>

<td><b>Reference</b></td>

<td>${invoice.referenceNo}</td>

</tr>

<tr>

<td><b>IRN</b></td>

<td colspan="3">${invoice.einvoice.irnNo}</td>

</tr>

<tr>

<td><b>ACK No</b></td>

<td>${invoice.einvoice.ackNo}</td>

<td><b>EWB No</b></td>

<td>${invoice.einvoice.ewayBillNo}</td>

</tr>

</table>
<br>

<table>

<tr>

<th width="50%">Dispatch From</th>

<th width="50%">Ship To</th>

</tr>

<tr>

<td>

<b>${invoice.dispatch.company}</b><br>

${invoice.dispatch.address}<br>

${invoice.dispatch.city}<br>

${invoice.dispatch.state} - ${invoice.dispatch.pin}<br>

GSTIN : ${invoice.dispatch.gst}

</td>

<td>

<b>${invoice.ship.company}</b><br>

${invoice.ship.address}<br>

${invoice.ship.city}<br>

${invoice.ship.state} - ${invoice.ship.pin}<br>

GSTIN : ${invoice.ship.gst}

</td>

</tr>

</table>

<br>

<table>

<thead>

<tr>

<th width="5%">Sr</th>

<th width="32%">Description</th>

<th width="10%">HSN</th>

<th width="8%">Unit</th>

<th width="8%">Qty</th>

<th width="10%">Rate</th>

<th width="8%">GST%</th>

<th width="19%">Amount</th>

</tr>

</thead>

<tbody>

${
invoice.items.map((item,index)=>`

<tr>

<td align="center">${index+1}</td>

<td>${item.itemName}</td>

<td align="center">${item.hsn}</td>

<td align="center">${item.unit}</td>

<td align="right">${item.qty}</td>

<td align="right">${item.rate.toFixed(2)}</td>

<td align="center">${item.gst}%</td>

<td align="right">${item.amount.toFixed(2)}</td>

</tr>

`).join("")
}

</tbody>

</table>

<br>

<table>

<thead>

<tr>

<th>Assessable</th>

<th>CGST</th>

<th>SGST</th>

<th>IGST</th>

<th>Other Charges</th>

<th>Round Off</th>

<th>Total</th>

</tr>

</thead>

<tbody>

<tr>

<td align="right">${invoice.summary.assVal.toFixed(2)}</td>

<td align="right">${invoice.summary.cgstVal.toFixed(2)}</td>

<td align="right">${invoice.summary.sgstVal.toFixed(2)}</td>

<td align="right">${invoice.summary.igstVal.toFixed(2)}</td>

<td align="right">${invoice.summary.otherCharges.toFixed(2)}</td>

<td align="right">${invoice.summary.roundOff.toFixed(2)}</td>

<th align="right">${invoice.summary.total.toFixed(2)}</th>

</tr>

</tbody>

</table>

<table>

<tr>

<td><b>Amount in Words :</b> ${numberToWords(Math.round(invoice.summary.total))}</td>

</tr>

</table>

<br>
<br>

<table>

<tr>
    <th colspan="4">Transport Details</th>
</tr>

<tr>
    <td><b>Transporter</b></td>
    <td>${invoice.transport.transporter || ""}</td>

    <td><b>Transporter GSTIN</b></td>
    <td>${invoice.transport.transporterId || ""}</td>
</tr>

<tr>
    <td><b>Vehicle No</b></td>
    <td>${invoice.transport.vehicleNo || ""}</td>

    <td><b>Distance (KM)</b></td>
    <td>${invoice.transport.distance || ""}</td>
</tr>

<tr>
    <td><b>LR No</b></td>
    <td>${invoice.transport.lrNo || ""}</td>

    <td><b>LR Date</b></td>
    <td>${invoice.transport.lrDate || ""}</td>
</tr>

<tr>
    <td><b>Mode</b></td>
    <td>${invoice.transport.mode || "Road"}</td>

    <td><b>Vehicle Type</b></td>
    <td>${invoice.transport.vehicleType || "Regular"}</td>
</tr>

<tr>
    <td><b>Freight</b></td>
    <td>${invoice.transport.freight || ""}</td>

    <td><b>Remark</b></td>
    <td>${invoice.transport.remark || ""}</td>
</tr>

</table>

<br>
${(()=>{

const bank=getBankDetailsBySellerGSTIN(invoice.seller.gst);

return `

<table style="border-collapse:collapse; width:100%;">

<tr>

<td style="width:50%; text-align:center; vertical-align:top; border:none;">

<div id="qrcode"></div>

<br>

<b>For ${invoice.seller.company}</b>

<br><br><br>

Authorized Signatory

</td>

<td style="width:50%; vertical-align:top; border:none;">

<b>Bank Details</b>

<br><br>

Beneficiary : ${bank.beneficiary}<br>

Bank : ${bank.bankName}<br>

A/C No : ${bank.accountNo}<br>

IFSC : ${bank.ifsc}<br>

Branch : ${bank.branch}

</td>

</tr>

</table>

`;

})()}

<hr style="margin-top:15px;">

<table style="border-collapse:collapse; width:100%;">

<tr>

<td style="border:none;">

<b>Declaration</b>

<br><br>

We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.

</td>

</tr>

</table>

<script>

(function(){

const qr='${invoice.einvoice.signedQRCode || ""}';

if(qr){

const img=document.createElement("img");

img.src="https://quickchart.io/qr?size=120&text="+encodeURIComponent(qr);

img.style.width="120px";

document.getElementById("qrcode").appendChild(img);

}

window.onload=function(){

setTimeout(function(){

window.print();

},300);

};

})();

</script>

</body>

</html>

`;

}