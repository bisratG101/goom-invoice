import path from 'path';
import PDFDocument from 'pdfkit';
import { formatMinor } from '../../utils/money';
import { formatInvoiceDisplayNumber } from '../invoices/invoices.routes';

/**
 * FONT LICENSING INSPECTION & CONFIRMATION:
 * The Noto Sans and Noto Sans Ethiopic fonts embedded below are licensed under the
 * SIL Open Font License, Version 1.1 (OFL-1.1).
 *
 * Exact LICENSE files inspected on disk:
 * 1. backend/node_modules/@fontsource/noto-sans/LICENSE
 *    Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)
 * 2. backend/node_modules/@fontsource/noto-sans-ethiopic/LICENSE
 *    Copyright 2022 The Noto Project Authors (https://github.com/notofonts/ethiopic)
 *
 * Both licenses grant permission free of charge to bundle, embed, modify, and redistribute
 * with software, subject to the standard conditions of OFL-1.1.
 */

const LATIN_REGULAR_PATH = path.resolve(
  __dirname,
  '../../../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'
);
const LATIN_BOLD_PATH = path.resolve(
  __dirname,
  '../../../node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'
);
const ETHIOPIC_REGULAR_PATH = path.resolve(
  __dirname,
  '../../../node_modules/@fontsource/noto-sans-ethiopic/files/noto-sans-ethiopic-ethiopic-400-normal.woff'
);
const ETHIOPIC_BOLD_PATH = path.resolve(
  __dirname,
  '../../../node_modules/@fontsource/noto-sans-ethiopic/files/noto-sans-ethiopic-ethiopic-700-normal.woff'
);

/**
 * Unicode regex detecting Ethiopic script characters:
 * - Ethiopic: U+1200 - U+137F
 * - Ethiopic Supplement: U+1380 - U+139F
 * - Ethiopic Extended: U+2D80 - U+2DDF
 * - Ethiopic Extended-A: U+AB00 - U+AB2F
 */
const ETHIOPIC_REGEX = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/;

export function containsEthiopic(text: string): boolean {
  return ETHIOPIC_REGEX.test(text);
}

export interface PdfInvoiceItem {
  position: number;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface PdfInvoiceData {
  businessName: string;
  invoicePrefix?: string;
  number: number | null;
  displayNumber?: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  currency: 'ETB' | 'USD';
  clientName: string;
  items: PdfInvoiceItem[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRateBps?: number;
  notes?: string | null;
}

/**
 * Splits text into segments tagged with the appropriate font (Latin vs Ethiopic).
 */
export function segmentText(text: string): Array<{ text: string; isEthiopic: boolean }> {
  if (!text) return [];
  const segments: Array<{ text: string; isEthiopic: boolean }> = [];
  let currentText = '';
  let currentIsEthiopic: boolean | null = null;

  for (const char of text) {
    const isEth = ETHIOPIC_REGEX.test(char);
    if (currentIsEthiopic === null) {
      currentIsEthiopic = isEth;
      currentText = char;
    } else if (currentIsEthiopic === isEth) {
      currentText += char;
    } else {
      segments.push({ text: currentText, isEthiopic: currentIsEthiopic });
      currentIsEthiopic = isEth;
      currentText = char;
    }
  }

  if (currentText) {
    segments.push({ text: currentText, isEthiopic: currentIsEthiopic! });
  }

  return segments;
}

/**
 * Generates an invoice PDF as a Buffer using PDFKit.
 */
export async function generateInvoicePdf(invoice: PdfInvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // Register Latin and Ethiopic fonts
    doc.registerFont('NotoSans-Regular', LATIN_REGULAR_PATH);
    doc.registerFont('NotoSans-Bold', LATIN_BOLD_PATH);
    doc.registerFont('NotoSansEthiopic-Regular', ETHIOPIC_REGULAR_PATH);
    doc.registerFont('NotoSansEthiopic-Bold', ETHIOPIC_BOLD_PATH);

    const selectFont = (isEthiopic: boolean, isBold: boolean = false): string => {
      if (isEthiopic) {
        return isBold ? 'NotoSansEthiopic-Bold' : 'NotoSansEthiopic-Regular';
      }
      return isBold ? 'NotoSans-Bold' : 'NotoSans-Regular';
    };

    /**
     * Renders a text string, automatically detecting Ethiopic script segments
     * and switching fonts seamlessly.
     */
    const renderMixedText = (
      text: string,
      x: number,
      y: number,
      options: {
        width?: number;
        align?: 'left' | 'center' | 'right' | 'justify';
        size?: number;
        isBold?: boolean;
        color?: string;
      } = {}
    ) => {
      const size = options.size || 10;
      const isBold = options.isBold || false;
      const color = options.color || '#1e293b';

      doc.fontSize(size);
      doc.fillColor(color);

      // If text contains no Ethiopic, render directly for maximum performance
      if (!containsEthiopic(text)) {
        doc.font(selectFont(false, isBold));
        doc.text(text, x, y, {
          width: options.width,
          align: options.align || 'left',
          lineBreak: true,
        });
        return;
      }

      // Segment text for mixed Ethiopic rendering
      const segments = segmentText(text);
      let currentX = x;

      // For right-aligned or single lines, calculate total width or print sequentially
      if (options.align === 'right' && options.width) {
        // Measure total width
        let totalWidth = 0;
        for (const seg of segments) {
          doc.font(selectFont(seg.isEthiopic, isBold));
          totalWidth += doc.widthOfString(seg.text);
        }
        currentX = x + options.width - totalWidth;
      }

      doc.text('', x, y); // position cursor
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;
        doc.font(selectFont(seg.isEthiopic, isBold));
        doc.text(seg.text, {
          continued: !isLast,
          width: options.width,
          lineBreak: isLast,
        });
      }
    };

    const displayNumber =
      invoice.displayNumber ||
      formatInvoiceDisplayNumber(invoice.invoicePrefix, invoice.number) ||
      'DRAFT';

    const renderHeader = (isFirstPage: boolean) => {
      // Top business & invoice header
      doc.rect(40, 40, doc.page.width - 80, 2).fill('#3b82f6');

      // Business Name
      doc.fontSize(18);
      renderMixedText(invoice.businessName, 40, 55, { size: 18, isBold: true, color: '#0f172a' });

      // Invoice Number & Status
      doc.fontSize(14);
      doc.font('NotoSans-Bold').fillColor('#3b82f6');
      doc.text(displayNumber, doc.page.width - 240, 55, { width: 200, align: 'right' });

      // Status chip text
      const statusText = invoice.status.toUpperCase();
      let statusColor = '#64748b'; // draft
      if (invoice.status === 'paid') statusColor = '#16a34a';
      else if (invoice.status === 'sent') statusColor = '#2563eb';
      else if (invoice.status === 'void') statusColor = '#dc2626';

      doc.fontSize(9).font('NotoSans-Bold').fillColor(statusColor);
      doc.text(statusText, doc.page.width - 240, 75, { width: 200, align: 'right' });

      if (isFirstPage) {
        // Metadata grid (Bill To, Dates, Currency)
        const metaY = 105;
        doc.rect(40, metaY, doc.page.width - 80, 55).fill('#f8fafc');

        // Bill to
        doc.fontSize(8).font('NotoSans-Bold').fillColor('#64748b').text('BILLED TO', 55, metaY + 10);
        renderMixedText(invoice.clientName, 55, metaY + 24, { size: 11, isBold: true, color: '#0f172a', width: 200 });

        // Issue Date
        doc.fontSize(8).font('NotoSans-Bold').fillColor('#64748b').text('ISSUE DATE', 280, metaY + 10);
        doc.fontSize(10).font('NotoSans-Regular').fillColor('#0f172a').text(invoice.issueDate, 280, metaY + 24);

        // Due Date
        doc.fontSize(8).font('NotoSans-Bold').fillColor('#64748b').text('DUE DATE', 380, metaY + 10);
        doc.fontSize(10).font('NotoSans-Regular').fillColor('#0f172a').text(invoice.dueDate, 380, metaY + 24);

        // Currency
        doc.fontSize(8).font('NotoSans-Bold').fillColor('#64748b').text('CURRENCY', 475, metaY + 10);
        doc.fontSize(10).font('NotoSans-Regular').fillColor('#0f172a').text(invoice.currency, 475, metaY + 24);
      }
    };

    // Render table headers
    const renderTableHeaders = (yPos: number) => {
      doc.rect(40, yPos, doc.page.width - 80, 22).fill('#f1f5f9');
      doc.fontSize(8).font('NotoSans-Bold').fillColor('#475569');
      doc.text('#', 50, yPos + 6, { width: 25 });
      doc.text('DESCRIPTION', 80, yPos + 6, { width: 230 });
      doc.text('QTY', 315, yPos + 6, { width: 50, align: 'right' });
      doc.text('UNIT PRICE', 375, yPos + 6, { width: 75, align: 'right' });
      doc.text('AMOUNT', 455, yPos + 6, { width: 90, align: 'right' });
      return yPos + 26;
    };

    // First page header
    renderHeader(true);

    let currentY = 180;
    currentY = renderTableHeaders(currentY);

    // Render Line Items
    const pageBottomLimit = doc.page.height - 130;

    for (let i = 0; i < invoice.items.length; i++) {
      const item = invoice.items[i];
      const qtyStr = (item.quantityMilli / 1000).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
      const unitPriceStr = formatMinor(item.unitPriceMinor);
      const lineTotalStr = formatMinor(item.lineTotalMinor);

      // Estimate item row height based on description wrapping
      doc.fontSize(9).font('NotoSans-Regular');
      const descHeight = doc.heightOfString(item.description, { width: 230 });
      const rowHeight = Math.max(20, descHeight + 8);

      // Page break check
      if (currentY + rowHeight > pageBottomLimit) {
        doc.addPage();
        renderHeader(false);
        currentY = renderTableHeaders(100);
      }

      // Zebra striping
      if (i % 2 === 1) {
        doc.rect(40, currentY - 2, doc.page.width - 80, rowHeight).fill('#fafafa');
      }

      // Position
      doc.fontSize(9).font('NotoSans-Regular').fillColor('#64748b');
      doc.text(String(item.position || i + 1), 50, currentY + 2, { width: 25 });

      // Description (with Ethiopic font switching if needed)
      renderMixedText(item.description, 80, currentY + 2, {
        size: 9,
        isBold: false,
        color: '#1e293b',
        width: 230,
      });

      // Qty
      doc.fontSize(9).font('NotoSans-Regular').fillColor('#1e293b');
      doc.text(qtyStr, 315, currentY + 2, { width: 50, align: 'right' });

      // Unit Price
      doc.text(unitPriceStr, 375, currentY + 2, { width: 75, align: 'right' });

      // Amount
      doc.font('NotoSans-Bold').text(lineTotalStr, 455, currentY + 2, { width: 90, align: 'right' });

      currentY += rowHeight;
    }

    // Totals section
    const totalsNeededHeight = 90;
    if (currentY + totalsNeededHeight > pageBottomLimit + 40) {
      doc.addPage();
      renderHeader(false);
      currentY = 100;
    }

    currentY += 10;
    doc.rect(40, currentY, doc.page.width - 80, 1).fill('#e2e8f0');
    currentY += 10;

    const totalsX = doc.page.width - 240;
    const totalsWidth = 195;

    // Subtotal
    doc.fontSize(9).font('NotoSans-Regular').fillColor('#64748b');
    doc.text('Subtotal:', totalsX, currentY);
    doc.font('NotoSans-Regular').fillColor('#0f172a').text(formatMinor(invoice.subtotalMinor, invoice.currency), totalsX, currentY, { width: totalsWidth, align: 'right' });
    currentY += 16;

    // Tax
    const taxLabel = invoice.taxRateBps ? `Tax (${(invoice.taxRateBps / 100).toFixed(2)}%):` : 'Tax:';
    doc.font('NotoSans-Regular').fillColor('#64748b').text(taxLabel, totalsX, currentY);
    doc.font('NotoSans-Regular').fillColor('#0f172a').text(formatMinor(invoice.taxMinor, invoice.currency), totalsX, currentY, { width: totalsWidth, align: 'right' });
    currentY += 16;

    // Total box
    doc.rect(totalsX - 10, currentY - 2, totalsWidth + 20, 24).fill('#eff6ff');
    doc.fontSize(11).font('NotoSans-Bold').fillColor('#1e40af');
    doc.text('Total Due:', totalsX, currentY + 4);
    doc.text(formatMinor(invoice.totalMinor, invoice.currency), totalsX, currentY + 4, { width: totalsWidth, align: 'right' });
    currentY += 34;

    // Notes, if present
    if (invoice.notes) {
      if (currentY + 60 > doc.page.height - 50) {
        doc.addPage();
        renderHeader(false);
        currentY = 100;
      }
      doc.fontSize(8).font('NotoSans-Bold').fillColor('#64748b').text('NOTES', 40, currentY);
      currentY += 12;
      renderMixedText(invoice.notes, 40, currentY, {
        size: 9,
        isBold: false,
        color: '#475569',
        width: doc.page.width - 80,
      });
    }

    // Page numbers on all pages
    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('NotoSans-Regular').fillColor('#94a3b8');
      doc.text(
        `Page ${i + 1} of ${pageRange.count}`,
        40,
        doc.page.height - 30,
        { width: doc.page.width - 80, align: 'center' }
      );
    }

    doc.end();
  });
}
