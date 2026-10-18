/**
 * pdf-engine.js — PDF generation logic for HRAPack
 * Uses pdf-lib (available as window.PDFLib) loaded from CDN.
 * Exports: generateReceiptPDF, generateForm12BBPDF, generateDeclarationPDF, generateSummaryPDF
 */

(function () {
  'use strict';

  function getPDFLib() {
    return window.PDFLib || (typeof PDFLib !== 'undefined' ? PDFLib : null);
  }

  // ── Unicode & Smart Punctuation Sanitizer for WinAnsi Helvetica ─────────────
  function cleanForPdf(text) {
    if (text === undefined || text === null) return '';
    return String(text)
      // Indian Rupee symbol
      .replace(/\u20B9/g, 'Rs. ')
      // Smart single quotes & apostrophes (iOS / Android keyboards)
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      // Smart double quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // En-dash, em-dash, horizontal bar, mathematical minus
      .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
      // Ellipsis
      .replace(/\u2026/g, '...')
      // Bullet points
      .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
      // Non-breaking spaces and zero-width spaces
      .replace(/[\u00A0\u2000-\u200B]/g, ' ')
      // Filter out any other non-ASCII characters that crash WinAnsi Helvetica
      .replace(/[^\x20-\x7E\r\n\t]/g, '');
  }

  // ── Constants ──────────────────────────────────────────────────────────────

  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const MARGIN = 50;
  const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

  let cachedColors = null;
  function getPDFColors() {
    if (cachedColors) return cachedColors;
    const lib = getPDFLib();
    if (!lib || !lib.rgb) {
      return {
        COLOR_TITLE: { red: 30 / 255, green: 58 / 255, blue: 138 / 255, type: 'RGB' },
        COLOR_BODY: { red: 55 / 255, green: 65 / 255, blue: 81 / 255, type: 'RGB' },
        COLOR_AMOUNT: { red: 17 / 255, green: 24 / 255, blue: 39 / 255, type: 'RGB' },
        COLOR_LIGHT_GRAY: { red: 209 / 255, green: 213 / 255, blue: 219 / 255, type: 'RGB' },
        COLOR_TABLE_HEADER_BG: { red: 238 / 255, green: 242 / 255, blue: 255 / 255, type: 'RGB' },
        COLOR_WHITE: { red: 1, green: 1, blue: 1, type: 'RGB' },
        COLOR_BLACK: { red: 0, green: 0, blue: 0, type: 'RGB' },
      };
    }
    const { rgb } = lib;
    cachedColors = {
      COLOR_TITLE: rgb(30 / 255, 58 / 255, 138 / 255),
      COLOR_BODY: rgb(55 / 255, 65 / 255, 81 / 255),
      COLOR_AMOUNT: rgb(17 / 255, 24 / 255, 39 / 255),
      COLOR_LIGHT_GRAY: rgb(209 / 255, 213 / 255, 219 / 255),
      COLOR_TABLE_HEADER_BG: rgb(238 / 255, 242 / 255, 255 / 255),
      COLOR_WHITE: rgb(1, 1, 1),
      COLOR_BLACK: rgb(0, 0, 0),
    };
    return cachedColors;
  }

  const PAYMENT_LABELS = {
    upi: 'UPI',
    bank: 'Bank Transfer / NEFT',
    cheque: 'Cheque',
    cash: 'Cash',
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Wrap text into lines that fit within maxWidth pixels.
   */
  function wrapText(text, font, fontSize, maxWidth) {
    const clean = cleanForPdf(text);
    const paragraphs = clean.split('\n');
    const lines = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(' ').filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [''];
  }

  /**
   * Draw wrapped text, returns the new Y position after drawing.
   */
  function drawWrappedText(page, text, x, y, font, fontSize, color, maxWidth, lineHeight) {
    const lines = wrapText(text, font, fontSize, maxWidth);
    let curY = y;
    for (const line of lines) {
      page.drawText(line, { x, y: curY, size: fontSize, font, color });
      curY -= lineHeight;
    }
    return curY;
  }

  /**
   * Draw centered text on a page.
   */
  function drawCenteredText(page, text, y, font, fontSize, color) {
    const clean = cleanForPdf(text);
    const textWidth = font.widthOfTextAtSize(clean, fontSize);
    const x = (A4_WIDTH - textWidth) / 2;
    page.drawText(clean, { x, y, size: fontSize, font, color });
  }

  /**
   * Draw right-aligned text.
   */
  function drawRightText(page, text, y, font, fontSize, color, rightX) {
    const clean = cleanForPdf(text);
    const textWidth = font.widthOfTextAtSize(clean, fontSize);
    page.drawText(clean, { x: rightX - textWidth, y, size: fontSize, font, color });
  }

  /**
   * Extract raw base64 bytes from a data URL string.
   */
  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Detect image type from data URL.
   */
  function imageTypeFromDataUrl(dataUrl) {
    if (dataUrl.startsWith('data:image/png')) return 'png';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'jpg';
    return 'png'; // default
  }

  /**
   * Draw a horizontal line.
   */
  function drawHLine(page, x, y, width, thickness, color) {
    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: thickness || 1,
      color: color || COLOR_LIGHT_GRAY,
    });
  }

  /**
   * Draw a rectangle outline (border only).
   */
  function drawRectOutline(page, x, y, w, h, opts) {
    const color = (opts && opts.color) || COLOR_LIGHT_GRAY;
    const thickness = (opts && opts.thickness) || 1;
    const dashArray = (opts && opts.dashArray) || undefined;
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: color,
      borderWidth: thickness,
      borderDashArray: dashArray,
      color: undefined,
    });
  }

  // ── 1. Receipt PDF ─────────────────────────────────────────────────────────

  /**
   * Generate a single rent receipt PDF for a given month.
   * @param {Object} formData
   * @param {number} monthIndex - index into the months array
   * @param {Array}  months - array of month objects
   * @returns {Promise<Uint8Array>}
   */
  async function generateReceiptPDF(formData, monthIndex, months) {
    const lib = getPDFLib();
    if (!lib) {
      throw new Error('PDF generator library is still loading. Please check your internet connection and refresh.');
    }
    const { PDFDocument, StandardFonts, rgb } = lib;
    const { COLOR_TITLE, COLOR_BODY, COLOR_AMOUNT, COLOR_LIGHT_GRAY, COLOR_TABLE_HEADER_BG, COLOR_WHITE, COLOR_BLACK } = getPDFColors();

    if (!months || !months.length) {
      months = window.getFinancialYearMonths((formData && formData.financialYear) || '2025-26');
    }
    const mIdx = Math.max(0, Math.min(Number(monthIndex) || 0, 11));
    const month = (months && months.find(m => m.indexInFY === mIdx)) || (months && months[mIdx]) || (months && months[0]) || { receiptDate: new Date(), label: 'Current Month' };

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const seqNum = month.indexInFY !== undefined ? month.indexInFY : mIdx;
    const receiptNumber = cleanForPdf(window.generateReceiptNumber(seqNum, (formData && formData.financialYear) || '2025-26'));
    const receiptDate = cleanForPdf(window.formatDate(month.receiptDate || new Date()));
    const rentAmount = (month.rentAmount !== undefined ? parseFloat(month.rentAmount) : parseFloat(formData.monthlyRent)) || 0;
    const amountInWords = cleanForPdf(window.numberToWordsRupees(rentAmount));
    const paymentMode = cleanForPdf(PAYMENT_LABELS[formData.paymentMode] || formData.paymentMode || 'UPI');
    const tenantName = cleanForPdf((formData.tenantName || 'Tenant Name').trim());
    const landlordName = cleanForPdf((month.landlordName || formData.landlordName || 'Landlord Name').trim());
    const propertyAddress = cleanForPdf((month.propertyAddress || formData.propertyAddress || 'Property Address').trim());

    // ── Border around entire receipt area ──
    const borderPad = 30;
    const borderX = borderPad;
    const borderY = borderPad;
    const borderW = A4_WIDTH - borderPad * 2;
    const borderH = A4_HEIGHT - borderPad * 2;
    drawRectOutline(page, borderX, borderY, borderW, borderH, { color: COLOR_LIGHT_GRAY, thickness: 1.5 });

    // Inner subtle double-border effect
    drawRectOutline(page, borderX + 4, borderY + 4, borderW - 8, borderH - 8, { color: rgb(229/255, 231/255, 235/255), thickness: 0.5 });

    let y = A4_HEIGHT - 70;

    // ── Title ──
    drawCenteredText(page, 'RENT RECEIPT', y, fontBold, 22, COLOR_TITLE);
    y -= 14;
    // Decorative line under title
    const titleW = fontBold.widthOfTextAtSize('RENT RECEIPT', 22);
    drawHLine(page, (A4_WIDTH - titleW) / 2, y, titleW, 2, COLOR_TITLE);

    y -= 30;

    // ── Receipt No & Date (top-right area) ──
    const rightX = A4_WIDTH - MARGIN;
    page.drawText('Receipt No:', { x: MARGIN, y, size: 10, font: fontBold, color: COLOR_BODY });
    page.drawText(receiptNumber, { x: MARGIN + fontBold.widthOfTextAtSize('Receipt No: ', 10), y, size: 10, font: fontRegular, color: COLOR_AMOUNT });

    drawRightText(page, receiptDate, y, fontRegular, 10, COLOR_BODY, rightX);
    const dateLabelW = fontBold.widthOfTextAtSize('Date: ', 10);
    const dateValW = fontRegular.widthOfTextAtSize(receiptDate, 10);
    page.drawText('Date:', { x: rightX - dateValW - dateLabelW - 2, y, size: 10, font: fontBold, color: COLOR_BODY });

    y -= 35;
    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 0.75, COLOR_LIGHT_GRAY);
    y -= 30;

    // ── Body Paragraphs ──
    const bodyFontSize = 12;
    const bodyLineHeight = 20;

    // Para 1
    y = drawWrappedText(page, `Received with thanks from Mr./Ms. ${tenantName}`, MARGIN, y, fontRegular, bodyFontSize, COLOR_BODY, CONTENT_WIDTH, bodyLineHeight);
    y -= 10;

    // Para 2 — amount
    const amountStr = `a sum of Rs. ${window.formatIndianNumber(rentAmount)}/- (${amountInWords})`;
    y = drawWrappedText(page, amountStr, MARGIN, y, fontRegular, bodyFontSize, COLOR_AMOUNT, CONTENT_WIDTH, bodyLineHeight);
    y -= 10;

    // Para 3 — month
    y = drawWrappedText(page, `towards rent for the month of ${month.label}`, MARGIN, y, fontRegular, bodyFontSize, COLOR_BODY, CONTENT_WIDTH, bodyLineHeight);
    y -= 10;

    // Para 4 — property address
    y = drawWrappedText(page, `for the property situated at: ${propertyAddress}`, MARGIN, y, fontRegular, bodyFontSize, COLOR_BODY, CONTENT_WIDTH, bodyLineHeight);
    y -= 10;

    // Para 5 — payment mode & reference (UTR)
    let paymentDisplay = paymentMode;
    if (formData.paymentReference && formData.paymentReference.trim()) {
      paymentDisplay += ` (Ref/UTR: ${cleanForPdf(formData.paymentReference.trim())})`;
    }
    const payLabel = 'Payment Mode: ';
    const payLabelW = fontBold.widthOfTextAtSize(payLabel, bodyFontSize);
    page.drawText(payLabel, { x: MARGIN, y, size: bodyFontSize, font: fontBold, color: COLOR_BODY });
    y = drawWrappedText(page, paymentDisplay, MARGIN + payLabelW, y, fontRegular, bodyFontSize, COLOR_BODY, CONTENT_WIDTH - payLabelW, bodyLineHeight);
    y -= 5;

    // Landlord PAN
    if (formData.landlordPan) {
      const cleanPan = cleanForPdf(formData.landlordPan).toUpperCase();
      page.drawText('Landlord PAN: ', { x: MARGIN, y, size: bodyFontSize, font: fontBold, color: COLOR_BODY });
      page.drawText(cleanPan, { x: MARGIN + fontBold.widthOfTextAtSize('Landlord PAN: ', bodyFontSize), y, size: bodyFontSize, font: fontRegular, color: COLOR_AMOUNT });
      y -= bodyLineHeight + 5;
    }

    y -= 20;
    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 0.75, COLOR_LIGHT_GRAY);
    y -= 40;

    // ── Footer: Revenue Stamp / Electronic Acknowledgment + Signature ──
    const isCashPayment = formData.paymentMode === 'cash';
    const isCashOver5k = isCashPayment && rentAmount > 5000;
    const footerBaseY = y - 60;
    const sigLineY = footerBaseY + 15;
    const sigAreaX = A4_WIDTH - MARGIN - 180;
    const sigLineWidth = 170;

    if (isCashOver5k) {
      const stampBoxSize = 70;
      const stampX = MARGIN;
      const stampY = footerBaseY;

      page.drawRectangle({
        x: stampX,
        y: stampY,
        width: stampBoxSize,
        height: stampBoxSize,
        borderColor: COLOR_BODY,
        borderWidth: 1,
        borderDashArray: [4, 3],
      });

      const stampText1 = 'Revenue';
      const stampText2 = 'Stamp Rs. 1';
      const stampText3 = '(Cash > 5,000)';
      const stampFontSize = 8;
      const st1W = fontRegular.widthOfTextAtSize(stampText1, stampFontSize);
      const st2W = fontRegular.widthOfTextAtSize(stampText2, stampFontSize);
      const st3W = fontRegular.widthOfTextAtSize(stampText3, 6);
      page.drawText(stampText1, {
        x: stampX + (stampBoxSize - st1W) / 2,
        y: stampY + stampBoxSize / 2 + 8,
        size: stampFontSize, font: fontRegular, color: COLOR_BODY,
      });
      page.drawText(stampText2, {
        x: stampX + (stampBoxSize - st2W) / 2,
        y: stampY + stampBoxSize / 2 - 4,
        size: stampFontSize, font: fontRegular, color: COLOR_BODY,
      });
      page.drawText(stampText3, {
        x: stampX + (stampBoxSize - st3W) / 2,
        y: stampY + stampBoxSize / 2 - 16,
        size: 6, font: fontRegular, color: COLOR_BODY,
      });
    } else {
      const ackBoxW = 140;
      const ackBoxH = 50;
      const ackX = MARGIN;
      const ackY = footerBaseY;

      page.drawRectangle({
        x: ackX,
        y: ackY,
        width: ackBoxW,
        height: ackBoxH,
        borderColor: COLOR_LIGHT_GRAY,
        borderWidth: 0.75,
        color: rgb(248 / 255, 250 / 255, 252 / 255),
      });

      const ackLine1 = isCashPayment ? 'Cash <= Rs. 5,000' : 'Electronic / Bank Payment';
      const ackLine2 = 'No revenue stamp required';
      const ackLine3 = 'per Indian Stamp Act, 1899';
      const fSize = 7.5;
      const a1W = fontBold.widthOfTextAtSize(ackLine1, fSize);
      const a2W = fontRegular.widthOfTextAtSize(ackLine2, 6.5);
      const a3W = fontRegular.widthOfTextAtSize(ackLine3, 6.5);

      page.drawText(ackLine1, {
        x: ackX + (ackBoxW - a1W) / 2,
        y: ackY + 32,
        size: fSize, font: fontBold, color: COLOR_TITLE,
      });
      page.drawText(ackLine2, {
        x: ackX + (ackBoxW - a2W) / 2,
        y: ackY + 18,
        size: 6.5, font: fontRegular, color: COLOR_BODY,
      });
      page.drawText(ackLine3, {
        x: ackX + (ackBoxW - a3W) / 2,
        y: ackY + 8,
        size: 6.5, font: fontRegular, color: COLOR_BODY,
      });
    }

    // ── Signature area (right side) ──
    const sigType = formData.signatureType || 'typed';
    const isImageSig = (sigType === 'drawn' || sigType === 'uploaded') && formData.signatureImage;
    const isTypedSig = sigType === 'typed';

    if (isImageSig) {
      try {
        const sigBytes = dataUrlToBytes(formData.signatureImage);
        const imgType = imageTypeFromDataUrl(formData.signatureImage);
        let sigImage;
        if (imgType === 'jpg') {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } else {
          sigImage = await pdfDoc.embedPng(sigBytes);
        }
        const maxW = 140;
        const maxH = 40;
        const scale = Math.min(maxW / sigImage.width, maxH / sigImage.height, 1);
        const drawW = sigImage.width * scale;
        const drawH = sigImage.height * scale;
        const sigImgX = sigAreaX + (sigLineWidth - drawW) / 2;
        page.drawImage(sigImage, {
          x: sigImgX,
          y: sigLineY + 4,
          width: drawW,
          height: drawH,
        });
      } catch (err) {
        console.warn('Failed to embed signature image:', err);
      }
    } else if (isTypedSig) {
      // Typed signature in oblique (cursive-like) style
      const sigText = cleanForPdf(formData.signatureText || landlordName || '');
      if (sigText) {
        const sigFontSize = 18;
        const sigTextW = fontOblique.widthOfTextAtSize(sigText, sigFontSize);
        const sigTextX = sigAreaX + (sigLineWidth - sigTextW) / 2;
        page.drawText(sigText, {
          x: sigTextX,
          y: sigLineY + 8,
          size: sigFontSize,
          font: fontOblique,
          color: COLOR_TITLE,
        });
      }
    }

    // Signature line
    drawHLine(page, sigAreaX, sigLineY, sigLineWidth, 1, COLOR_BODY);

    // Landlord name under line
    const landlordNameW = fontBold.widthOfTextAtSize(landlordName, 10);
    page.drawText(landlordName, {
      x: sigAreaX + (sigLineWidth - landlordNameW) / 2,
      y: sigLineY - 15,
      size: 10, font: fontBold, color: COLOR_AMOUNT,
    });

    // "Landlord / Owner" label
    const ownerLabel = 'Landlord / Owner';
    const ownerLabelW = fontRegular.widthOfTextAtSize(ownerLabel, 9);
    page.drawText(ownerLabel, {
      x: sigAreaX + (sigLineWidth - ownerLabelW) / 2,
      y: sigLineY - 30,
      size: 9, font: fontRegular, color: COLOR_BODY,
    });

    return pdfDoc.save();
  }

  // ── 2. Form 12BB PDF ───────────────────────────────────────────────────────

  /**
   * Generate Form 12BB PDF.
   * @param {Object} formData
   * @param {Array}  months
   * @returns {Promise<Uint8Array>}
   */
  async function generateForm12BBPDF(formData, months) {
    const lib = getPDFLib();
    if (!lib) {
      throw new Error('PDF generator library is still loading. Please check your internet connection and refresh.');
    }
    const { PDFDocument, StandardFonts, rgb } = lib;
    const { COLOR_TITLE, COLOR_BODY, COLOR_AMOUNT, COLOR_LIGHT_GRAY, COLOR_TABLE_HEADER_BG, COLOR_WHITE, COLOR_BLACK } = getPDFColors();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const fy = cleanForPdf((formData && formData.financialYear) || '2026-27').trim();
    const framework = window.getTaxLawFramework ? window.getTaxLawFramework(fy) : {
      formNumber: '124',
      formTitle: 'FORM No. 124',
      formSubtitle: '[See section 392(5)(b) and rule 205]',
      section: 'section 392(5)(b)',
      is2026Rules: true,
      hasRelationshipField: true,
    };

    const mList = months && months.length ? months : (window.getFinancialYearMonths ? window.getFinancialYearMonths(fy) : []);
    const annualRent = mList.reduce((acc, m) => acc + (m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(formData.monthlyRent) || 0)), 0);
    const tenantName = cleanForPdf((formData.tenantName || 'Employee Name').trim());
    const landlordName = cleanForPdf((formData.landlordName || 'Landlord Name').trim());
    const propertyAddress = cleanForPdf((formData.propertyAddress || 'Property Address').trim());
    const panDisplay = cleanForPdf(formData.landlordHasNoPan ? 'Not Available' : (formData.landlordPan ? formData.landlordPan.toUpperCase() : 'Not Provided'));

    const relMap = {
      unrelated: 'Unrelated / Third-party Landlord',
      parent: 'Father / Mother (Parent)',
      sibling: 'Brother / Sister (Sibling)',
      spouse: 'Spouse (Not Permissible for HRA)',
      other: 'Other Relative',
    };
    const relDisplay = cleanForPdf(relMap[formData.landlordRelationship] || (formData.landlordRelationship || 'Unrelated'));

    let y = A4_HEIGHT - 60;

    // ── Title ──
    const formHeading = framework.formTitle || (framework.is2026Rules ? 'FORM No. 124' : 'FORM No. 12BB');
    drawCenteredText(page, formHeading, y, fontBold, 20, COLOR_TITLE);
    y -= 22;

    const formRule = framework.formSubtitle || (framework.is2026Rules ? '[See section 392(5)(b) and rule 205]' : '[See rule 26C]');
    drawCenteredText(page, formRule, y, fontRegular, 10, COLOR_BODY);
    y -= 20;

    // ── Subtitle ──
    const subtitle = framework.is2026Rules
      ? 'Statement showing particulars of claims by an employee for deduction / exemption of tax'
      : 'Statement showing particulars of claims by an employee for deduction of tax under section 192';
    const subLines = wrapText(subtitle, fontRegular, 10, CONTENT_WIDTH);
    for (const line of subLines) {
      drawCenteredText(page, line, y, fontRegular, 10, COLOR_BODY);
      y -= 15;
    }
    y -= 10;

    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 1, COLOR_TITLE);
    y -= 25;

    // ── Employee Info ──
    const infoFontSize = 10;
    const infoLineH = 18;

    page.drawText('Name of Employee:', { x: MARGIN, y, size: infoFontSize, font: fontBold, color: COLOR_BODY });
    page.drawText(tenantName, { x: MARGIN + 130, y, size: infoFontSize, font: fontRegular, color: COLOR_AMOUNT });
    y -= infoLineH;

    const ay = window.getAssessmentYear ? window.getAssessmentYear(fy) : '';
    page.drawText('Financial Year:', { x: MARGIN, y, size: infoFontSize, font: fontBold, color: COLOR_BODY });
    page.drawText(fy + (ay ? ' (AY ' + ay + ')' : ''), { x: MARGIN + 130, y, size: infoFontSize, font: fontRegular, color: COLOR_AMOUNT });
    y -= infoLineH + 15;

    // ── Table ──
    const tableX = MARGIN;
    const colWidths = [40, 190, 100, 165];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const rowHeight = 28;

    // Header row background
    page.drawRectangle({
      x: tableX, y: y - rowHeight, width: tableWidth, height: rowHeight,
      color: COLOR_TABLE_HEADER_BG,
    });

    // Header texts
    const headers = ['Sl. No', 'Nature of Claim', 'Amount (Rs.)', 'Evidence / Particulars'];
    let hx = tableX;
    for (let i = 0; i < headers.length; i++) {
      const headerW = fontBold.widthOfTextAtSize(headers[i], 9);
      page.drawText(headers[i], {
        x: hx + (colWidths[i] - headerW) / 2,
        y: y - rowHeight + 9,
        size: 9, font: fontBold, color: COLOR_TITLE,
      });
      hx += colWidths[i];
    }

    // Draw header borders
    drawRectOutline(page, tableX, y - rowHeight, tableWidth, rowHeight, { color: COLOR_LIGHT_GRAY, thickness: 1 });
    hx = tableX;
    for (let i = 0; i < colWidths.length - 1; i++) {
      hx += colWidths[i];
      page.drawLine({
        start: { x: hx, y },
        end: { x: hx, y: y - rowHeight },
        thickness: 0.75, color: COLOR_LIGHT_GRAY,
      });
    }

    y -= rowHeight;

    // ── Data Row: HRA ──
    const hraLabel = 'House Rent Allowance (Section 10(13A))';
    const hraAmountStr = window.formatIndianNumber(annualRent);
    const evidenceLines = [
      `Landlord: ${landlordName}`,
      ...(framework.hasRelationshipField || formData.landlordRelationship ? [`Relationship: ${relDisplay}`] : []),
      `PAN: ${panDisplay}`,
      `Address: ${propertyAddress}`,
    ];

    // Calculate needed row height
    const evidWrapped = [];
    for (const line of evidenceLines) {
      const wrapped = wrapText(line, fontRegular, 8, colWidths[3] - 10);
      evidWrapped.push(...wrapped);
    }
    const hraWrapped = wrapText(hraLabel, fontRegular, 9, colWidths[1] - 10);
    const neededLines = Math.max(hraWrapped.length, evidWrapped.length);
    const dataRowH = Math.max(rowHeight, neededLines * 13 + 14);

    // Row background
    page.drawRectangle({
      x: tableX, y: y - dataRowH, width: tableWidth, height: dataRowH,
      color: COLOR_WHITE,
    });

    // Sl No
    const slNoText = '1';
    const slNoW = fontRegular.widthOfTextAtSize(slNoText, 10);
    page.drawText(slNoText, {
      x: tableX + (colWidths[0] - slNoW) / 2,
      y: y - 18,
      size: 10, font: fontRegular, color: COLOR_BODY,
    });

    // Nature of claim
    let claimY = y - 15;
    for (const line of hraWrapped) {
      page.drawText(line, { x: tableX + colWidths[0] + 5, y: claimY, size: 9, font: fontRegular, color: COLOR_BODY });
      claimY -= 13;
    }

    // Amount
    const amtX = tableX + colWidths[0] + colWidths[1];
    const amtStr = 'Rs. ' + hraAmountStr;
    const amtW = fontBold.widthOfTextAtSize(amtStr, 10);
    page.drawText(amtStr, {
      x: amtX + (colWidths[2] - amtW) / 2,
      y: y - 18,
      size: 10, font: fontBold, color: COLOR_AMOUNT,
    });

    // Evidence
    const evX = tableX + colWidths[0] + colWidths[1] + colWidths[2] + 5;
    let evY = y - 14;
    for (const line of evidWrapped) {
      page.drawText(line, { x: evX, y: evY, size: 8, font: fontRegular, color: COLOR_BODY });
      evY -= 12;
    }

    // Row borders
    drawRectOutline(page, tableX, y - dataRowH, tableWidth, dataRowH, { color: COLOR_LIGHT_GRAY, thickness: 1 });
    hx = tableX;
    for (let i = 0; i < colWidths.length - 1; i++) {
      hx += colWidths[i];
      page.drawLine({
        start: { x: hx, y },
        end: { x: hx, y: y - dataRowH },
        thickness: 0.75, color: COLOR_LIGHT_GRAY,
      });
    }

    y -= dataRowH;
    y -= 40;

    // ── Declaration ──
    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 0.75, COLOR_LIGHT_GRAY);
    y -= 25;

    page.drawText('DECLARATION', { x: MARGIN, y, size: 12, font: fontBold, color: COLOR_TITLE });
    y -= 22;

    const declText = `I, ${tenantName}, do hereby declare that the particulars given above are correct and complete.`;
    y = drawWrappedText(page, declText, MARGIN, y, fontRegular, 10, COLOR_BODY, CONTENT_WIDTH, 16);
    y -= 30;

    // Date & Place
    const today = new Date();
    const dateStr = window.formatDate(today);
    page.drawText('Date: ' + dateStr, { x: MARGIN, y, size: 10, font: fontRegular, color: COLOR_BODY });
    y -= 15;
    page.drawText('Place: _______________', { x: MARGIN, y, size: 10, font: fontRegular, color: COLOR_BODY });

    // Signature of Employee (MUST NOT use landlord's signature!)
    const sigLineX = A4_WIDTH - MARGIN - 180;
    const sigLineW = 170;

    if (formData.tenantSignatureImage) {
      try {
        const sigBytes = dataUrlToBytes(formData.tenantSignatureImage);
        const sigType = imageTypeFromDataUrl(formData.tenantSignatureImage);
        let sigImage;
        if (sigType === 'jpg') {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } else {
          sigImage = await pdfDoc.embedPng(sigBytes);
        }
        const maxW = 150;
        const maxH = 45;
        const scale = Math.min(maxW / sigImage.width, maxH / sigImage.height, 1);
        const drawW = sigImage.width * scale;
        const drawH = sigImage.height * scale;
        page.drawImage(sigImage, {
          x: sigLineX + (sigLineW - drawW) / 2,
          y: y + 10,
          width: drawW, height: drawH,
        });
      } catch (err) {
        console.warn('Failed to embed employee signature image:', err);
      }
    } else if (formData.employeeHasSignature && formData.tenantSignatureText) {
      const sigText = cleanForPdf(formData.tenantSignatureText.trim());
      if (sigText) {
        const sigFontSize = 16;
        const sigTextW = fontOblique.widthOfTextAtSize(sigText, sigFontSize);
        const sigTextX = sigLineX + (sigLineW - sigTextW) / 2;
        page.drawText(sigText, {
          x: Math.max(sigLineX, sigTextX),
          y: y + 12,
          size: sigFontSize,
          font: fontOblique,
          color: COLOR_TITLE,
        });
      }
    } else {
      page.drawText('(Sign physically before submitting)', {
        x: sigLineX + 12,
        y: y + 12,
        size: 7.5, font: fontOblique, color: COLOR_LIGHT_GRAY,
      });
    }

    drawHLine(page, sigLineX, y + 5, sigLineW, 1, COLOR_BODY);

    const empSigLabel = 'Signature of Employee';
    const empSigLabelW = fontBold.widthOfTextAtSize(empSigLabel, 9);
    page.drawText(empSigLabel, {
      x: sigLineX + (sigLineW - empSigLabelW) / 2,
      y: y - 10,
      size: 9, font: fontBold, color: COLOR_BODY,
    });

    const empNameW = fontRegular.widthOfTextAtSize(tenantName, 9);
    page.drawText(tenantName, {
      x: sigLineX + (sigLineW - empNameW) / 2,
      y: y - 24,
      size: 9, font: fontRegular, color: COLOR_AMOUNT,
    });

    return pdfDoc.save();
  }

  // ── 3. Declaration PDF ─────────────────────────────────────────────────────

  /**
   * Generate a landlord Declaration PDF (for landlords without PAN).
   * @param {Object} formData
   * @param {Array}  months
   * @returns {Promise<Uint8Array>}
   */
  async function generateDeclarationPDF(formData, months) {
    const lib = getPDFLib();
    if (!lib) {
      throw new Error('PDF generator library is still loading. Please check your internet connection and refresh.');
    }
    const { PDFDocument, StandardFonts, rgb } = lib;
    const { COLOR_TITLE, COLOR_BODY, COLOR_AMOUNT, COLOR_LIGHT_GRAY, COLOR_TABLE_HEADER_BG, COLOR_WHITE, COLOR_BLACK } = getPDFColors();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const mList = months && months.length ? months : window.getFinancialYearMonths((formData && formData.financialYear) || '2025-26');
    const annualRent = mList.reduce((acc, m) => acc + (m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(formData.monthlyRent) || 0)), 0);
    const fy = cleanForPdf((formData.financialYear || '2025-26').trim());
    const tenantName = cleanForPdf((formData.tenantName || 'Tenant Name').trim());
    const landlordName = cleanForPdf((formData.landlordName || 'Landlord Name').trim());
    const propertyAddress = cleanForPdf((formData.propertyAddress || 'Property Address').trim());

    let y = A4_HEIGHT - 70;

    // ── Title ──
    drawCenteredText(page, 'DECLARATION', y, fontBold, 24, COLOR_TITLE);
    y -= 18;
    const titleW = fontBold.widthOfTextAtSize('DECLARATION', 24);
    drawHLine(page, (A4_WIDTH - titleW) / 2, y, titleW, 2, COLOR_TITLE);
    y -= 50;

    // ── Date ──
    const today = new Date();
    const dateStr = window.formatDate(today);
    drawRightText(page, 'Date: ' + dateStr, y, fontRegular, 11, COLOR_BODY, A4_WIDTH - MARGIN);
    y -= 35;

    // ── To Whom ──
    page.drawText('To Whom It May Concern,', { x: MARGIN, y, size: 12, font: fontBold, color: COLOR_BODY });
    y -= 35;

    // ── Body Paragraphs ──
    const lineH = 20;
    const bodySize = 11;

    const para1 = `I, ${landlordName}, hereby declare that I am the owner/landlord of the property situated at the address mentioned below and have received rent from the tenant as detailed herein.`;
    y = drawWrappedText(page, para1, MARGIN, y, fontRegular, bodySize, COLOR_BODY, CONTENT_WIDTH, lineH);
    y -= 15;

    const para2 = `Property Address: ${propertyAddress}`;
    y = drawWrappedText(page, para2, MARGIN, y, fontBold, bodySize, COLOR_AMOUNT, CONTENT_WIDTH, lineH);
    y -= 15;

    const para3 = `Tenant Name: ${tenantName}`;
    page.drawText(para3, { x: MARGIN, y, size: bodySize, font: fontRegular, color: COLOR_BODY });
    y -= lineH;

    const para4 = `Financial Year: ${fy}`;
    page.drawText(para4, { x: MARGIN, y, size: bodySize, font: fontRegular, color: COLOR_BODY });
    y -= lineH;

    const para5 = `Total Rent Received: Rs. ${window.formatIndianNumber(annualRent)}/- (${window.numberToWordsRupees(annualRent)})`;
    y = drawWrappedText(page, para5, MARGIN, y, fontRegular, bodySize, COLOR_AMOUNT, CONTENT_WIDTH, lineH);
    y -= lineH;

    const hasMultipleRents = mList.some(m => m.rentAmount !== undefined && m.rentAmount !== mList[0].rentAmount);
    if (hasMultipleRents) {
      const firstRent = mList[0].rentAmount !== undefined ? mList[0].rentAmount : formData.monthlyRent;
      const lastRent = mList[mList.length - 1].rentAmount !== undefined ? mList[mList.length - 1].rentAmount : formData.monthlyRent;
      const hikeMonth = mList.find(m => m.rentAmount !== undefined && m.rentAmount !== firstRent);
      const hikeLabel = hikeMonth ? hikeMonth.label.split(' ')[0] : 'mid-tenancy';
      const para6 = `Monthly Rent: Rs. ${window.formatIndianNumber(firstRent)}/- (revised to Rs. ${window.formatIndianNumber(lastRent)}/- w.e.f. ${hikeLabel})`;
      y = drawWrappedText(page, para6, MARGIN, y, fontRegular, bodySize, COLOR_BODY, CONTENT_WIDTH, lineH);
    } else {
      const firstRent = mList[0].rentAmount !== undefined ? mList[0].rentAmount : formData.monthlyRent;
      const para6 = `Monthly Rent: Rs. ${window.formatIndianNumber(firstRent)}/-`;
      page.drawText(para6, { x: MARGIN, y, size: bodySize, font: fontRegular, color: COLOR_BODY });
      y -= lineH;
    }

    const para7 = `Period: ${mList[0] ? mList[0].label : ''} to ${mList[mList.length - 1] ? mList[mList.length - 1].label : ''}`;
    page.drawText(para7, { x: MARGIN, y, size: bodySize, font: fontRegular, color: COLOR_BODY });
    y -= lineH + 10;

    const para8 = 'I further declare that I do not possess a Permanent Account Number (PAN) and hereby provide this declaration in lieu of PAN as per the provisions of the Income Tax Act.';
    y = drawWrappedText(page, para8, MARGIN, y, fontRegular, bodySize, COLOR_BODY, CONTENT_WIDTH, lineH);
    y -= 15;

    const para9 = 'The above information is true to the best of my knowledge and belief. I undertake to bear all consequences arising from any misrepresentation of facts stated herein.';
    y = drawWrappedText(page, para9, MARGIN, y, fontRegular, bodySize, COLOR_BODY, CONTENT_WIDTH, lineH);
    y -= 40;

    // ── Signature Area ──
    page.drawText('Yours faithfully,', { x: MARGIN, y, size: bodySize, font: fontRegular, color: COLOR_BODY });
    y -= 50;

    const sigLineX = MARGIN;
    const sigLineW = 200;

    const sigType = formData.signatureType || 'typed';
    const isImageSig = (sigType === 'drawn' || sigType === 'uploaded') && formData.signatureImage;
    const isTypedSig = sigType === 'typed';

    if (isImageSig) {
      try {
        const sigBytes = dataUrlToBytes(formData.signatureImage);
        const imgType = imageTypeFromDataUrl(formData.signatureImage);
        let sigImage;
        if (imgType === 'jpg') {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } else {
          sigImage = await pdfDoc.embedPng(sigBytes);
        }
        const maxW = 140;
        const maxH = 40;
        const scale = Math.min(maxW / sigImage.width, maxH / sigImage.height, 1);
        const drawW = sigImage.width * scale;
        const drawH = sigImage.height * scale;
        page.drawImage(sigImage, {
          x: sigLineX,
          y: y + 8,
          width: drawW, height: drawH,
        });
      } catch (err) {
        console.warn('Failed to embed signature image in Declaration:', err);
      }
    } else if (isTypedSig) {
      const sigText = cleanForPdf(formData.signatureText || landlordName || '');
      if (sigText) {
        page.drawText(sigText, {
          x: sigLineX,
          y: y + 12,
          size: 18, font: fontOblique, color: COLOR_TITLE,
        });
      }
    }

    drawHLine(page, sigLineX, y + 5, sigLineW, 1, COLOR_BODY);

    page.drawText(landlordName, {
      x: sigLineX,
      y: y - 12,
      size: 11, font: fontBold, color: COLOR_AMOUNT,
    });
    page.drawText('(Landlord / Owner)', {
      x: sigLineX,
      y: y - 27,
      size: 9, font: fontRegular, color: COLOR_BODY,
    });

    return pdfDoc.save();
  }

  // ── 4. Summary PDF ─────────────────────────────────────────────────────────

  /**
   * Generate an HRA Claim Summary PDF.
   * @param {Object} formData
   * @param {Array}  months
   * @param {Object} hraCalc - result from window.calculateHRA
   * @returns {Promise<Uint8Array>}
   */
  async function generateSummaryPDF(formData, months, hraCalc) {
    const lib = getPDFLib();
    if (!lib) {
      throw new Error('PDF generator library is still loading. Please check your internet connection and refresh.');
    }
    const { PDFDocument, StandardFonts, rgb } = lib;
    const { COLOR_TITLE, COLOR_BODY, COLOR_AMOUNT, COLOR_LIGHT_GRAY, COLOR_TABLE_HEADER_BG, COLOR_WHITE, COLOR_BLACK } = getPDFColors();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const mList = months && months.length ? months : (window.getFinancialYearMonths ? window.getFinancialYearMonths((formData && formData.financialYear) || '2025-26') : []);
    const fy = cleanForPdf((formData.financialYear || '2025-26').trim());
    const annualRent = mList.reduce((acc, m) => acc + (m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(formData.monthlyRent) || 0)), 0);
    const paymentMode = cleanForPdf(PAYMENT_LABELS[formData.paymentMode] || formData.paymentMode || 'UPI');

    let y = A4_HEIGHT - 60;

    // ── Title ──
    drawCenteredText(page, 'HRA Claim Summary Statement', y, fontBold, 18, COLOR_TITLE);
    y -= 16;
    const titleW = fontBold.widthOfTextAtSize('HRA Claim Summary Statement', 18);
    drawHLine(page, (A4_WIDTH - titleW) / 2, y, titleW, 2, COLOR_TITLE);
    y -= 10;

    // FY label
    const ay = window.getAssessmentYear ? window.getAssessmentYear(fy) : '';
    const fyLabel = 'Financial Year: ' + fy + (ay ? '   |   Assessment Year: ' + ay : '');
    drawCenteredText(page, fyLabel, y, fontRegular, 11, COLOR_BODY);
    y -= 30;

    // ── Monthly Rent Table ──
    const tableX = MARGIN;
    const tColWidths = [40, 210, 120, 125];
    const tableWidth = tColWidths.reduce((a, b) => a + b, 0);
    const rowH = 24;

    // Header
    page.drawRectangle({
      x: tableX, y: y - rowH, width: tableWidth, height: rowH,
      color: COLOR_TABLE_HEADER_BG,
    });

    const tHeaders = ['Sl.', 'Month', 'Receipt No', 'Rent Amount'];
    let tx = tableX;
    for (let i = 0; i < tHeaders.length; i++) {
      const hw = fontBold.widthOfTextAtSize(tHeaders[i], 9);
      page.drawText(tHeaders[i], {
        x: tx + (tColWidths[i] - hw) / 2,
        y: y - rowH + 8,
        size: 9, font: fontBold, color: COLOR_TITLE,
      });
      tx += tColWidths[i];
    }

    drawRectOutline(page, tableX, y - rowH, tableWidth, rowH, { color: COLOR_LIGHT_GRAY });
    // Column separators for header
    tx = tableX;
    for (let i = 0; i < tColWidths.length - 1; i++) {
      tx += tColWidths[i];
      page.drawLine({ start: { x: tx, y }, end: { x: tx, y: y - rowH }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
    }
    y -= rowH;

    // Data rows
    for (let i = 0; i < mList.length; i++) {
      const m = mList[i];
      const isAlt = i % 2 === 1;
      if (isAlt) {
        page.drawRectangle({
          x: tableX, y: y - rowH, width: tableWidth, height: rowH,
          color: rgb(249 / 255, 250 / 255, 251 / 255),
        });
      }

      const seqNum = m.indexInFY !== undefined ? m.indexInFY : i;
      const receiptNo = window.generateReceiptNumber(seqNum, fy);
      const rentAmt = m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(formData.monthlyRent) || 0);
      const rowData = [
        String(i + 1),
        m.label,
        receiptNo,
        'Rs. ' + window.formatIndianNumber(rentAmt),
      ];

      tx = tableX;
      for (let j = 0; j < rowData.length; j++) {
        const font = j === 3 ? fontBold : fontRegular;
        const fontSize = 9;
        const rw = font.widthOfTextAtSize(rowData[j], fontSize);
        // Right-align amount column, center others
        let cellX;
        if (j === 3) {
          cellX = tx + tColWidths[j] - rw - 8;
        } else {
          cellX = tx + (tColWidths[j] - rw) / 2;
        }
        page.drawText(rowData[j], {
          x: cellX,
          y: y - rowH + 8,
          size: fontSize, font, color: j === 3 ? COLOR_AMOUNT : COLOR_BODY,
        });
        tx += tColWidths[j];
      }

      // Row border
      drawRectOutline(page, tableX, y - rowH, tableWidth, rowH, { color: COLOR_LIGHT_GRAY, thickness: 0.5 });
      tx = tableX;
      for (let j = 0; j < tColWidths.length - 1; j++) {
        tx += tColWidths[j];
        page.drawLine({ start: { x: tx, y }, end: { x: tx, y: y - rowH }, thickness: 0.5, color: COLOR_LIGHT_GRAY });
      }
      y -= rowH;
    }

    // Total row
    page.drawRectangle({
      x: tableX, y: y - rowH, width: tableWidth, height: rowH,
      color: COLOR_TABLE_HEADER_BG,
    });

    const totalLabel = 'TOTAL';
    const totalLabelW = fontBold.widthOfTextAtSize(totalLabel, 10);
    const totalColSpanW = tColWidths[0] + tColWidths[1] + tColWidths[2];
    page.drawText(totalLabel, {
      x: tableX + totalColSpanW - totalLabelW - 10,
      y: y - rowH + 7,
      size: 10, font: fontBold, color: COLOR_TITLE,
    });

    const totalAmtStr = 'Rs. ' + window.formatIndianNumber(annualRent);
    const totalAmtW = fontBold.widthOfTextAtSize(totalAmtStr, 10);
    page.drawText(totalAmtStr, {
      x: tableX + totalColSpanW + tColWidths[3] - totalAmtW - 8,
      y: y - rowH + 7,
      size: 10, font: fontBold, color: COLOR_TITLE,
    });

    drawRectOutline(page, tableX, y - rowH, tableWidth, rowH, { color: COLOR_LIGHT_GRAY });
    // Vertical line before amount column in total row
    page.drawLine({
      start: { x: tableX + totalColSpanW, y },
      end: { x: tableX + totalColSpanW, y: y - rowH },
      thickness: 0.5, color: COLOR_LIGHT_GRAY,
    });
    y -= rowH;

    y -= 25;

    // ── HRA Calculation Breakdown ──
    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 1, COLOR_TITLE);
    y -= 22;

    page.drawText('HRA Exemption Calculation', { x: MARGIN, y, size: 13, font: fontBold, color: COLOR_TITLE });
    y -= 22;

    const calcRows = [];
    if (hraCalc) {
      const r1 = hraCalc.rule1 !== undefined ? hraCalc.rule1 : hraCalc.actualHRA;
      const r2 = hraCalc.rule2 !== undefined ? hraCalc.rule2 : hraCalc.percentOfSalary;
      const r3 = hraCalc.rule3 !== undefined ? hraCalc.rule3 : hraCalc.rentMinus10;
      if (r1 !== undefined) {
        calcRows.push(['Rule 1: Actual HRA Received', 'Rs. ' + window.formatIndianNumber(r1)]);
      }
      if (r2 !== undefined) {
        const pctLabel = formData.cityCategory === 'metro' ? '50%' : '40%';
        calcRows.push(['Rule 2: ' + pctLabel + ' of Basic Salary', 'Rs. ' + window.formatIndianNumber(r2)]);
      }
      if (r3 !== undefined) {
        calcRows.push(['Rule 3: Rent Paid - 10% of Salary', 'Rs. ' + window.formatIndianNumber(r3)]);
      }
      if (hraCalc.exemption !== undefined) {
        calcRows.push(['Minimum (Exempt Amount)', 'Rs. ' + window.formatIndianNumber(hraCalc.exemption)]);
      }
      if (hraCalc.taxableHRA !== undefined) {
        calcRows.push(['Taxable HRA Component', 'Rs. ' + window.formatIndianNumber(hraCalc.taxableHRA)]);
      }
      if (hraCalc.taxSaved30 !== undefined) {
        calcRows.push(['Estimated Tax Saved (30% slab + 4% cess)', 'Rs. ' + window.formatIndianNumber(hraCalc.taxSaved30)]);
      }
    }

    const calcLabelX = MARGIN + 10;
    const calcValX = A4_WIDTH - MARGIN - 10;
    const calcRowH = 18;

    for (let i = 0; i < calcRows.length; i++) {
      const [label, val] = calcRows[i];
      const isExemptRow = label.startsWith('Minimum');
      const font = isExemptRow ? fontBold : fontRegular;
      const color = isExemptRow ? COLOR_TITLE : COLOR_BODY;
      const fontSize = isExemptRow ? 10.5 : 9.5;

      if (isExemptRow) {
        drawHLine(page, MARGIN + 5, y + 4, CONTENT_WIDTH - 10, 0.75, COLOR_LIGHT_GRAY);
        y -= 4;
      }

      page.drawText(label, { x: calcLabelX, y, size: fontSize, font, color });
      drawRightText(page, val, y, font, fontSize, color, calcValX);
      y -= calcRowH;
    }

    y -= 10;

    // ── Landlord Details ──
    drawHLine(page, MARGIN, y, CONTENT_WIDTH, 1, COLOR_TITLE);
    y -= 20;

    page.drawText('Landlord Details', { x: MARGIN, y, size: 13, font: fontBold, color: COLOR_TITLE });
    y -= 18;

    const detailFontSize = 9.5;
    const detailLineH = 16;

    const details = [
      ['Name:', (formData.landlordName || 'Landlord Name').trim()],
      ['PAN:', formData.landlordPan || 'Not Available (Declaration attached)'],
      ['Property Address:', (formData.propertyAddress || 'Property Address').trim()],
      ['Payment Mode:', paymentMode],
    ];

    for (const [label, value] of details) {
      page.drawText(label, { x: MARGIN + 10, y, size: detailFontSize, font: fontBold, color: COLOR_BODY });
      const labelW = fontBold.widthOfTextAtSize(label, detailFontSize);
      const valLines = wrapText(value, fontRegular, detailFontSize, CONTENT_WIDTH - labelW - 30);
      for (let i = 0; i < valLines.length; i++) {
        page.drawText(valLines[i], {
          x: MARGIN + 10 + labelW + 5,
          y: y - i * detailLineH,
          size: detailFontSize, font: fontRegular, color: COLOR_AMOUNT,
        });
      }
      y -= detailLineH * valLines.length + 2;
    }

    if (hraCalc && hraCalc.needsTDS194IB) {
      y -= 8;
      const tdsNote = `* Compliance Notice: Under Section 194-IB (as amended by Finance (No. 2) Act 2024), monthly rent exceeds Rs. 50,000. Tenant is legally obligated to deduct 2% TDS (Rs. ${window.formatIndianNumber(hraCalc.tds194IBAmount)}/year) and deposit via Challan Form 26QC.`;
      const tdsLines = wrapText(tdsNote, fontRegular, 8, CONTENT_WIDTH - 20);
      for (const tLine of tdsLines) {
        page.drawText(tLine, { x: MARGIN + 10, y, size: 8, font: fontRegular, color: rgb(109 / 255, 40 / 255, 217 / 255) });
        y -= 11;
      }
    }

    return pdfDoc.save();
  }

  // ── Export to window ───────────────────────────────────────────────────────

  window.generateReceiptPDF = generateReceiptPDF;
  window.generateForm12BBPDF = generateForm12BBPDF;
  window.generateDeclarationPDF = generateDeclarationPDF;
  window.generateSummaryPDF = generateSummaryPDF;

})();
