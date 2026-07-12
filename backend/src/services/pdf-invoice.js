const PDFDocument = require('pdfkit');

/**
 * Generates a professional PDF Invoice.
 * @param {object} invoiceData - Invoice details
 * @returns {Promise<Buffer>} - Resolved with the PDF file Buffer
 */
function generateInvoicePdf(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const {
        invoiceNumber = `INV-${Date.now().toString().slice(-6)}`,
        date = new Date().toLocaleDateString(),
        dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        company = {},
        customer = {},
        items = [],
        taxRate = 0, // e.g. 18 for 18%
        discount = 0, // absolute discount amount
        notes = 'Thank you for your business!',
      } = invoiceData;

      // 1. HEADER SECTION
      doc.fillColor('#1E293B').fontSize(20).text(company.name || 'Company Name', 50, 50);
      doc.fontSize(10).fillColor('#64748B');
      
      if (company.phone) doc.text(`Phone: ${company.phone}`);
      if (company.email) doc.text(`Email: ${company.email}`);
      if (company.address) doc.text(`Address: ${company.address}`);

      // Title & Meta Info Right-Aligned
      doc.fillColor('#1E293B').fontSize(24).text('INVOICE', 400, 50, { align: 'right' });
      doc.fontSize(10).fillColor('#64748B');
      doc.text(`Invoice #: ${invoiceNumber}`, 400, 80, { align: 'right' });
      doc.text(`Date: ${date}`, 400, 95, { align: 'right' });
      doc.text(`Due Date: ${dueDate}`, 400, 110, { align: 'right' });

      doc.moveDown(2);

      // Horizontal Divider
      doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(50, 140).lineTo(550, 140).stroke();

      // 2. CLIENT DETAILS
      doc.moveDown(1.5);
      doc.fillColor('#0F172A').fontSize(12).text('BILL TO:', 50, 155);
      doc.fontSize(10).fillColor('#475569');
      doc.text(customer.name || 'Customer Name', 50, 170);
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`);

      // 3. TABLE ITEMS HEADER
      let itemY = 220;
      doc.fillColor('#F8FAFC');
      doc.rect(50, itemY, 500, 20).fill();
      
      doc.fillColor('#475569').fontSize(9);
      doc.text('Description', 60, itemY + 6);
      doc.text('Qty', 350, itemY + 6, { width: 30, align: 'right' });
      doc.text('Unit Price', 400, itemY + 6, { width: 60, align: 'right' });
      doc.text('Amount', 480, itemY + 6, { width: 60, align: 'right' });

      itemY += 20;

      // 4. TABLE ITEMS BODY
      let subtotal = 0;
      doc.fillColor('#0F172A').fontSize(10);

      items.forEach((item) => {
        const itemQty = Number(item.quantity) || 1;
        const itemPrice = Number(item.price) || 0;
        const amount = itemQty * itemPrice;
        subtotal += amount;

        // Row background alternating
        doc.text(item.description || 'Item Description', 60, itemY + 6);
        doc.text(itemQty.toString(), 350, itemY + 6, { width: 30, align: 'right' });
        doc.text(`$${itemPrice.toFixed(2)}`, 400, itemY + 6, { width: 60, align: 'right' });
        doc.text(`$${amount.toFixed(2)}`, 480, itemY + 6, { width: 60, align: 'right' });

        doc.strokeColor('#F1F5F9').moveTo(50, itemY + 20).lineTo(550, itemY + 20).stroke();
        itemY += 20;
      });

      // 5. CALCULATION & SUMMARY
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount - discount;

      doc.moveDown(1);
      const summaryY = itemY + 20;
      doc.fontSize(10).fillColor('#475569');
      
      doc.text('Subtotal:', 380, summaryY, { width: 80, align: 'right' });
      doc.text(`$${subtotal.toFixed(2)}`, 480, summaryY, { width: 60, align: 'right' });

      doc.text(`Tax (${taxRate}%):`, 380, summaryY + 15, { width: 80, align: 'right' });
      doc.text(`$${taxAmount.toFixed(2)}`, 480, summaryY + 15, { width: 60, align: 'right' });

      if (discount > 0) {
        doc.text('Discount:', 380, summaryY + 30, { width: 80, align: 'right' });
        doc.text(`-$${discount.toFixed(2)}`, 480, summaryY + 30, { width: 60, align: 'right' });
      }

      // Grand Total Highlight
      doc.fontSize(12).fillColor('#0F172A');
      const totalY = summaryY + (discount > 0 ? 50 : 35);
      doc.text('Total Due:', 380, totalY, { width: 80, align: 'right' });
      doc.text(`$${total.toFixed(2)}`, 480, totalY, { width: 60, align: 'right' });

      // 6. NOTES, QR & SIGNATURE
      doc.fontSize(10).fillColor('#64748B');
      doc.text('Notes / Terms:', 50, summaryY);
      doc.fontSize(9).text(notes, 50, summaryY + 15, { width: 250 });

      if (company.signature) {
        doc.fontSize(10).fillColor('#475569');
        doc.text('Signature:', 50, summaryY + 70);
        doc.fontSize(12).font('Courier-Oblique').text(company.signature, 50, summaryY + 85);
        doc.font('Helvetica'); // reset font
      }

      // Footer
      if (company.footerText) {
        doc.fontSize(8).fillColor('#94A3B8').text(company.footerText, 50, 700, { align: 'center', width: 500 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateInvoicePdf,
};
