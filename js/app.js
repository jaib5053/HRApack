/**
 * HRAPack — Main Application Logic
 * Orchestrates form binding, live preview rendering, tab switching,
 * payment flow, export/download, dark mode, FAQ accordion, and mobile panel switching.
 */
document.addEventListener('DOMContentLoaded', () => {
  // ─── App State ───────────────────────────────────────────────────────
  const state = {
    formData: {
      taxRegime: 'old',
      financialYear: '2026-27',
      cityId: '',
      cityCategory: 'metro',
      salaryFrequency: 'monthly',
      basicSalary: '',
      daAmount: '',
      hraReceived: '',
      tenantName: '',
      landlordName: '',
      landlordRelationship: 'unrelated',
      landlordPan: '',
      landlordHasNoPan: false,
      propertyAddress: '',
      monthlyRent: '',
      receiptDayType: 'last',
      customReceiptDay: 1,
      paymentMode: 'upi',
      paymentReference: '',
      tenancyPeriod: 'all',
      periodStartMonth: 0,
      periodEndMonth: 11,
      hasSplitRentHike: false,
      splitStartMonth: 6,
      splitNewRent: '',
      signatureType: 'typed',
      signatureText: '',
      signatureImage: null,
      employeeHasSignature: false,
      tenantSignatureType: 'typed',
      tenantSignatureText: '',
      tenantSignatureImage: null,
    },
    lastAutoLandlordName: '',
    selectedMonth: 0,
    selectedTab: 'receipt',
    isDark: false,
  };

  // ─── Payment Mode Display Labels ────────────────────────────────────
  const paymentModeLabels = {
    upi: 'UPI',
    bank: 'Bank Transfer / NEFT',
    cheque: 'Cheque',
    cash: 'Cash',
  };

  // ─── Debounce Utility ───────────────────────────────────────────────
  let debounceTimer = null;
  function debouncedUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updatePreview();
      updateCalculator();
      saveFormState();
    }, 150);
  }

  // ─── Toast Notification ─────────────────────────────────────────────
  function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), duration);
  }

  // ─── Element Helpers ────────────────────────────────────────────────
  function $(id) {
    return document.getElementById(id);
  }

  // ─── Safe File Download Helper (Universal Mobile, Desktop, & Local file://) ──
  function downloadBlob(blob, fileName) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isFileProtocol = window.location.protocol === 'file:';

    // When running under file:/// protocol, modern Chromium & Safari restrict blob:null/ URLs.
    // Reading as a base64 Data URL allows instant, safe download even when opening index.html directly from disk.
    if (isFileProtocol) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const a = document.createElement('a');
        a.href = reader.result;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 1000);
      };
      reader.readAsDataURL(blob);
      return;
    }

    const url = URL.createObjectURL(blob);

    if (isIOS) {
      // iOS Safari handles target="_blank" links best for PDFs and files,
      // opening iOS's native PDF viewer with the "Save to Files" / "Share" button.
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 120000);
      return;
    }

    // Android / Desktop / Standard
    if (typeof window.saveAs === 'function') {
      try {
        window.saveAs(blob, fileName);
        return;
      } catch (e) {
        console.warn('saveAs failed, falling back to anchor:', e);
      }
    }

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 120000); // 2 minutes to allow background download manager to finish
  }

  // ─── Populate Financial Year Dropdown ───────────────────────────────
  function populateFinancialYears() {
    const fySelect = $('financialYear');
    if (!fySelect) return;
    const years = window.getAvailableFinancialYears();
    fySelect.innerHTML = '';
    years.forEach((fy) => {
      const opt = document.createElement('option');
      opt.value = fy.value;
      opt.textContent = fy.label;
      fySelect.appendChild(opt);
    });

    // Set default based on current date
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear = now.getFullYear();
    // Financial year runs April–March
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const defaultFY = `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
    const exists = years.some((fy) => fy.value === defaultFY);
    if (exists) {
      fySelect.value = defaultFY;
      state.formData.financialYear = defaultFY;
    } else if (years.length > 0) {
      fySelect.value = years[0].value;
      state.formData.financialYear = years[0].value;
    }
  }

  // ─── Tenancy Period & Active Months Helper ──────────────────────────
  function getActiveMonthIndices() {
    let startIdx = 0;
    let endIdx = 11;
    const p = state.formData.tenancyPeriod || 'all';
    if (p === 'apr-dec') {
      startIdx = 0;
      endIdx = 8;
    } else if (p === 'jan-mar') {
      startIdx = 9;
      endIdx = 11;
    } else if (p === 'custom') {
      startIdx = Math.max(0, Math.min(11, parseInt(state.formData.periodStartMonth, 10) || 0));
      endIdx = Math.max(0, Math.min(11, parseInt(state.formData.periodEndMonth, 10) || 11));
      if (startIdx > endIdx) {
        const tmp = startIdx; startIdx = endIdx; endIdx = tmp;
      }
    }
    return { startIdx, endIdx };
  }

  function getActiveMonths() {
    const allMonths = window.getFinancialYearMonths ? window.getFinancialYearMonths(state.formData.financialYear, state.formData.receiptDayType, state.formData.customReceiptDay) : [];
    if (!allMonths || !allMonths.length) return [];

    const { startIdx, endIdx } = getActiveMonthIndices();
    const baseRent = parseFloat(state.formData.monthlyRent) || 0;
    const splitActive = Boolean(state.formData.hasSplitRentHike);
    const splitStart = parseInt(state.formData.splitStartMonth, 10) || 6;
    const splitRent = parseFloat(state.formData.splitNewRent) || baseRent;

    const list = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const orig = allMonths[i];
      if (!orig) continue;
      const mRent = (splitActive && i >= splitStart) ? splitRent : baseRent;
      list.push({
        ...orig,
        indexInFY: i,
        rentAmount: mRent,
        landlordName: state.formData.landlordName,
        propertyAddress: state.formData.propertyAddress,
      });
    }
    return list;
  }

  // ─── Populate Month Selector Buttons & Dropdowns ───────────────────
  function populateMonthButtons() {
    const allMonths = window.getFinancialYearMonths ? window.getFinancialYearMonths(state.formData.financialYear) : [];
    const container = document.querySelector('.month-grid') || document.querySelector('.month-selector');
    if (!allMonths.length) return;

    // Populate period range and split hike dropdowns
    const startSelect = $('periodStartMonth');
    const endSelect = $('periodEndMonth');
    const splitSelect = $('splitStartMonth');

    const fillSelect = (sel, defaultVal) => {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '';
      allMonths.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = m.label;
        sel.appendChild(opt);
      });
      if (cur !== '') sel.value = cur;
      else if (defaultVal !== undefined) sel.value = defaultVal;
    };

    if (startSelect && startSelect.options.length === 0) fillSelect(startSelect, state.formData.periodStartMonth !== undefined ? state.formData.periodStartMonth : 0);
    if (endSelect && endSelect.options.length === 0) fillSelect(endSelect, state.formData.periodEndMonth !== undefined ? state.formData.periodEndMonth : 11);
    if (splitSelect && splitSelect.options.length === 0) fillSelect(splitSelect, state.formData.splitStartMonth !== undefined ? state.formData.splitStartMonth : 6);

    const { startIdx, endIdx } = getActiveMonthIndices();

    // Ensure selectedMonth stays within active range
    if (state.selectedMonth < startIdx || state.selectedMonth > endIdx) {
      state.selectedMonth = startIdx;
    }

    if (container) {
      container.innerHTML = '';
      allMonths.forEach((m, i) => {
        const isIncluded = i >= startIdx && i <= endIdx;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `monthBtn-${i}`;
        let cls = 'month-btn text-xs sm:text-sm font-medium py-2 px-1 rounded-lg border transition-colors';
        if (i === state.selectedMonth) {
          cls += ' active';
        }
        if (!isIncluded) {
          cls += ' opacity-40 line-through bg-gray-100 dark:bg-gray-800 text-gray-400 border-dashed';
          btn.title = `${m.label} (Excluded from selected period)`;
        } else {
          btn.title = m.label;
        }
        btn.className = cls;
        btn.textContent = m.shortLabel ? m.shortLabel.split(' ')[0] : m.label;

        btn.addEventListener('click', () => {
          if (!isIncluded) {
            showToast(`${m.label} is outside your chosen period. Adjust "Months to Generate" above.`, 3000);
            return;
          }
          state.selectedMonth = i;
          container.querySelectorAll('.month-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          updatePreview();
        });
        container.appendChild(btn);
      });
    }

    const badge = $('periodBadge');
    if (badge) {
      const activeCount = Math.max(1, endIdx - startIdx + 1);
      badge.textContent = `${activeCount} Months`;
    }
  }

  // ─── Signature Type Switching, Canvas Drawing & Upload ─────────────
  let canvasInited = false;
  let isCanvasDrawing = false;
  let canvasLastX = 0;
  let canvasLastY = 0;
  let canvasHasDrawn = false;

  function trimCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return null;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (!found) return null;

    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(height, maxY + pad);

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    const trimmed = document.createElement('canvas');
    trimmed.width = cropW;
    trimmed.height = cropH;
    const tCtx = trimmed.getContext('2d');
    tCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return trimmed.toDataURL('image/png');
  }

  function initSignatureCanvas() {
    if (canvasInited) return;
    const canvas = $('signatureCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayW = rect.width > 0 ? rect.width : 360;
    const displayH = 110;

    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);

    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.4 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function getCanvasPos(e) {
      const r = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      return {
        x: (clientX - r.left) * scaleX,
        y: (clientY - r.top) * scaleY,
      };
    }

    function startDraw(e) {
      isCanvasDrawing = true;
      const pos = getCanvasPos(e);
      canvasLastX = pos.x;
      canvasLastY = pos.y;
      const hint = $('canvasEmptyHint');
      if (hint) hint.style.display = 'none';
    }

    function draw(e) {
      if (!isCanvasDrawing) return;
      if (e.cancelable && e.type.startsWith('touch')) {
        e.preventDefault();
      }
      const pos = getCanvasPos(e);
      ctx.beginPath();
      ctx.moveTo(canvasLastX, canvasLastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      canvasLastX = pos.x;
      canvasLastY = pos.y;
      canvasHasDrawn = true;
    }

    function stopDraw() {
      if (!isCanvasDrawing) return;
      isCanvasDrawing = false;
      if (canvasHasDrawn) {
        const trimmed = trimCanvas(canvas);
        state.formData.signatureImage = trimmed || canvas.toDataURL('image/png');
        debouncedUpdate();
      }
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);

    const btnClear = $('btnClearCanvas');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvasHasDrawn = false;
        state.formData.signatureImage = null;
        const hint = $('canvasEmptyHint');
        if (hint) hint.style.display = 'flex';
        debouncedUpdate();
      });
    }

    canvasInited = true;
  }

  function initSignatureSwitching() {
    const sigTyped = $('sigTypeTyped');
    const sigDraw = $('sigTypeDraw');
    const sigUpload = $('sigTypeUpload');
    const typedArea = $('signatureTypedArea');
    const drawArea = $('signatureDrawArea');
    const uploadArea = $('signatureUploadArea');
    const uploadDropZone = document.querySelector('.signature-upload-area');
    const sigFileInput = $('signatureUpload');
    const previewImg = $('signaturePreviewUpload');

    function setSigType(type) {
      state.formData.signatureType = type;

      const activeBtnClass = 'flex-1 py-2 px-2.5 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 text-white shadow-sm border border-blue-600 transition-colors';
      const inactiveBtnClass = 'flex-1 py-2 px-2.5 text-xs sm:text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 transition-colors';

      if (type === 'typed') {
        if (typedArea) typedArea.classList.remove('hidden');
        if (drawArea) drawArea.classList.add('hidden');
        if (uploadArea) uploadArea.classList.add('hidden');
        if (sigTyped) sigTyped.className = activeBtnClass;
        if (sigDraw) sigDraw.className = inactiveBtnClass;
        if (sigUpload) sigUpload.className = inactiveBtnClass;
      } else if (type === 'drawn') {
        if (typedArea) typedArea.classList.add('hidden');
        if (drawArea) drawArea.classList.remove('hidden');
        if (uploadArea) uploadArea.classList.add('hidden');
        if (sigTyped) sigTyped.className = inactiveBtnClass;
        if (sigDraw) sigDraw.className = activeBtnClass;
        if (sigUpload) sigUpload.className = inactiveBtnClass;
        setTimeout(initSignatureCanvas, 50);
      } else if (type === 'uploaded') {
        if (typedArea) typedArea.classList.add('hidden');
        if (drawArea) drawArea.classList.add('hidden');
        if (uploadArea) uploadArea.classList.remove('hidden');
        if (sigTyped) sigTyped.className = inactiveBtnClass;
        if (sigDraw) sigDraw.className = inactiveBtnClass;
        if (sigUpload) sigUpload.className = activeBtnClass;
      }
      debouncedUpdate();
    }

    if (sigTyped) sigTyped.addEventListener('click', () => setSigType('typed'));
    if (sigDraw) sigDraw.addEventListener('click', () => setSigType('drawn'));
    if (sigUpload) sigUpload.addEventListener('click', () => setSigType('uploaded'));

    // Trigger file input when clicking upload drop zone
    if (uploadDropZone && sigFileInput) {
      uploadDropZone.addEventListener('click', () => sigFileInput.click());

      uploadDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadDropZone.classList.add('border-blue-500', 'bg-blue-50/50');
      });
      uploadDropZone.addEventListener('dragleave', () => {
        uploadDropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
      });
      uploadDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadDropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleSignatureFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (sigFileInput) {
      sigFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleSignatureFile(e.target.files[0]);
        }
      });
    }

    function handleSignatureFile(file) {
      if (!file.type.match('image.*')) {
        showToast('Please upload a valid PNG or JPEG image');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.formData.signatureImage = ev.target.result;
        if (previewImg) {
          previewImg.src = ev.target.result;
          previewImg.classList.remove('hidden');
          previewImg.style.display = 'block';
        }
        showToast('Signature image uploaded!');
        debouncedUpdate();
      };
      reader.readAsDataURL(file);
    }
  }

  // ─── City & Metro Classification Engine ─────────────────────────────
  function updateCityMetroClassification() {
    const cityPicker = $('cityPicker');
    const badge = $('metroStatusBadge');
    const hint = $('cityStatutoryHint');
    const customWrap = $('customCityCategoryWrap');
    if (!cityPicker) return;

    const cityId = cityPicker.value;
    state.formData.cityId = cityId;
    const fy = state.formData.financialYear;
    const is2026 = (parseInt((fy || '').split('-')[0], 10) || 2026) >= 2026;

    if (cityId === 'other') {
      if (customWrap) customWrap.classList.remove('hidden');
      const customSelect = $('cityCategory');
      state.formData.cityCategory = customSelect ? customSelect.value : 'non-metro';
    } else {
      if (customWrap) customWrap.classList.add('hidden');
      const isMetro = window.isMetroCity ? window.isMetroCity(cityId, fy) : (cityId === 'delhi' || cityId === 'mumbai' || cityId === 'kolkata' || cityId === 'chennai');
      state.formData.cityCategory = isMetro ? 'metro' : 'non-metro';
    }

    if (badge) {
      if (state.formData.cityCategory === 'metro') {
        badge.textContent = is2026 ? '2026 Rules: 50% Metro' : 'Rule 2A: 50% Metro';
        badge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      } else {
        badge.textContent = is2026 ? '2026 Rules: 40% Non-Metro' : 'Rule 2A: 40% Non-Metro';
        badge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700';
      }
    }

    if (hint) {
      if (is2026) {
        hint.textContent = 'Under Income-tax Rules, 2026, 8 metropolitan cities (Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad) qualify for 50%.';
      } else {
        hint.textContent = 'Under legacy Rule 2A, only 4 statutory cities (Mumbai, Delhi, Kolkata, Chennai) qualify for 50%. Bengaluru, Pune & others are 40%.';
      }
    }
  }

  // ─── Landlord Relationship Statutory Advisory ────────────────────────
  function updateRelationshipAdvisory() {
    const relSelect = $('landlordRelationship');
    const notice = $('relationshipNotice');
    if (!relSelect || !notice) return;
    const val = relSelect.value;
    state.formData.landlordRelationship = val;

    if (val === 'spouse') {
      notice.className = 'mt-2 p-2.5 rounded-lg text-xs leading-relaxed bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-200 dark:border-rose-800';
      notice.innerHTML = '⚠️ <strong>Tax Notice:</strong> Rent paid to spouse carries a high risk of disallowance during tax scrutiny, as tax authorities and tribunals generally view spouses as sharing common living arrangements rather than an arm\'s-length tenancy. Form 124 mandates relationship disclosure.';
      notice.classList.remove('hidden');
    } else if (val === 'father' || val === 'mother' || val === 'parents') {
      notice.className = 'mt-2 p-2.5 rounded-lg text-xs leading-relaxed bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
      notice.innerHTML = '💡 <strong>Tax Requirement:</strong> Rent paid to parents is allowable under IT Act if you do not co-own the property, but your parents must declare this rental income in their annual Income Tax Return (ITR).';
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  // ─── Form Binding ──────────────────────────────────────────────────
  function bindFormInputs() {
    // Upfront Tax Regime switcher
    const btnRegimeOld = $('regimeOldBtn');
    const btnRegimeNew = $('regimeNewBtn');
    const regimeNotice = $('newRegimeNotice');
    if (btnRegimeOld && btnRegimeNew) {
      btnRegimeOld.addEventListener('click', () => {
        state.formData.taxRegime = 'old';
        btnRegimeOld.className = 'py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 text-white shadow-sm transition-all text-center';
        btnRegimeNew.className = 'py-2 px-3 text-xs sm:text-sm font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all text-center';
        if (regimeNotice) regimeNotice.classList.add('hidden');
        debouncedUpdate();
      });
      btnRegimeNew.addEventListener('click', () => {
        state.formData.taxRegime = 'new';
        btnRegimeOld.className = 'py-2 px-3 text-xs sm:text-sm font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all text-center';
        btnRegimeNew.className = 'py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg bg-amber-600 text-white shadow-sm transition-all text-center';
        if (regimeNotice) regimeNotice.classList.remove('hidden');
        debouncedUpdate();
      });
    }

    // Salary Frequency Toggle (Monthly vs Annual CTC)
    const freqMonthly = $('freqMonthly');
    const freqAnnual = $('freqAnnual');
    if (freqMonthly && freqAnnual) {
      freqMonthly.addEventListener('click', () => {
        if (state.formData.salaryFrequency === 'annual') {
          state.formData.salaryFrequency = 'monthly';
          freqMonthly.className = 'px-2 py-0.5 rounded font-semibold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs';
          freqAnnual.className = 'px-2 py-0.5 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800';
          const bSal = $('basicSalary');
          const hRec = $('hraReceived');
          if (bSal && bSal.value) bSal.value = Math.round(parseFloat(bSal.value) / 12) || '';
          if (hRec && hRec.value) hRec.value = Math.round(parseFloat(hRec.value) / 12) || '';
          state.formData.basicSalary = parseFloat(bSal.value) || 0;
          state.formData.hraReceived = parseFloat(hRec.value) || 0;
          debouncedUpdate();
        }
      });
      freqAnnual.addEventListener('click', () => {
        if (state.formData.salaryFrequency === 'monthly') {
          state.formData.salaryFrequency = 'annual';
          freqAnnual.className = 'px-2 py-0.5 rounded font-semibold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs';
          freqMonthly.className = 'px-2 py-0.5 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800';
          const bSal = $('basicSalary');
          const hRec = $('hraReceived');
          if (bSal && bSal.value) bSal.value = Math.round(parseFloat(bSal.value) * 12) || '';
          if (hRec && hRec.value) hRec.value = Math.round(parseFloat(hRec.value) * 12) || '';
          state.formData.basicSalary = Math.round((parseFloat(bSal.value) || 0) / 12);
          state.formData.hraReceived = Math.round((parseFloat(hRec.value) || 0) / 12);
          debouncedUpdate();
        }
      });
    }

    // Text / Number inputs — input event
    const textInputs = [
      { id: 'basicSalary', key: 'basicSalary', type: 'number' },
      { id: 'daAmount', key: 'daAmount', type: 'number' },
      { id: 'hraReceived', key: 'hraReceived', type: 'number' },
      { id: 'tenantName', key: 'tenantName', type: 'text' },
      { id: 'landlordName', key: 'landlordName', type: 'text' },
      { id: 'propertyAddress', key: 'propertyAddress', type: 'text' },
      { id: 'monthlyRent', key: 'monthlyRent', type: 'number' },
      { id: 'paymentReference', key: 'paymentReference', type: 'text' },
      { id: 'customDayInput', key: 'customReceiptDay', type: 'number' },
    ];

    textInputs.forEach(({ id, key, type }) => {
      const el = $(id);
      if (!el) return;
      el.value = state.formData[key] !== undefined && state.formData[key] !== 0 ? state.formData[key] : '';

      el.addEventListener('input', () => {
        let val = type === 'number' ? (parseFloat(el.value) || 0) : el.value;
        if (key === 'basicSalary' && state.formData.salaryFrequency === 'annual') {
          state.formData.basicSalary = Math.round(val / 12);
        } else if (key === 'hraReceived' && state.formData.salaryFrequency === 'annual') {
          state.formData.hraReceived = Math.round(val / 12);
        } else {
          state.formData[key] = val;
        }

        if (key === 'monthlyRent') {
          updateAnnualRentInfo();
        }
        if (key === 'landlordName') {
          const sigInput = $('signatureText');
          if (sigInput && (!sigInput.value || sigInput.value === state.lastAutoLandlordName)) {
            sigInput.value = el.value;
            state.formData.signatureText = el.value;
            const preview = $('signaturePreviewTyped');
            if (preview) preview.textContent = el.value;
          }
        }
        debouncedUpdate();
      });
    });

    // Real-Time Landlord PAN validation (as you type!)
    const panInput = $('landlordPan');
    const panError = $('panError');
    const panBadge = $('panValidBadge');
    if (panInput) {
      const validatePanLive = () => {
        const val = panInput.value.trim().toUpperCase();
        panInput.value = val;
        state.formData.landlordPan = val;
        if (!val || state.formData.landlordHasNoPan) {
          if (panError) panError.classList.add('hidden');
          if (panBadge) panBadge.classList.add('hidden');
          return;
        }
        const isValid = window.validatePAN ? window.validatePAN(val) : /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val);
        if (isValid) {
          if (panError) panError.classList.add('hidden');
          if (panBadge) panBadge.classList.remove('hidden');
        } else {
          if (panBadge) panBadge.classList.add('hidden');
          if (val.length === 10) {
            if (panError) panError.classList.remove('hidden');
          } else {
            if (panError) panError.classList.add('hidden');
          }
        }
      };
      panInput.addEventListener('input', () => {
        validatePanLive();
        debouncedUpdate();
      });
      panInput.addEventListener('blur', () => {
        const val = panInput.value.trim();
        if (val && !state.formData.landlordHasNoPan && window.validatePAN && !window.validatePAN(val)) {
          if (panError) panError.classList.remove('hidden');
        }
      });
    }

    // City Picker binding
    const cityPicker = $('cityPicker');
    if (cityPicker) {
      if (state.formData.cityId) cityPicker.value = state.formData.cityId;
      cityPicker.addEventListener('change', () => {
        updateCityMetroClassification();
        debouncedUpdate();
      });
    }

    const cityCategoryFallback = $('cityCategory');
    if (cityCategoryFallback) {
      cityCategoryFallback.addEventListener('change', () => {
        state.formData.cityCategory = cityCategoryFallback.value;
        const badge = $('metroStatusBadge');
        if (badge) {
          badge.textContent = state.formData.cityCategory === 'metro' ? '50% Metro' : '40% Non-Metro';
        }
        debouncedUpdate();
      });
    }

    // Landlord Relationship dropdown
    const relSelect = $('landlordRelationship');
    if (relSelect) {
      relSelect.value = state.formData.landlordRelationship || 'unrelated';
      relSelect.addEventListener('change', () => {
        updateRelationshipAdvisory();
        debouncedUpdate();
      });
    }

    // Receipt Date selector
    const receiptDaySelect = $('receiptDay');
    const customDayInput = $('customDayInput');
    if (receiptDaySelect) {
      receiptDaySelect.value = state.formData.receiptDayType || 'last';
      receiptDaySelect.addEventListener('change', () => {
        state.formData.receiptDayType = receiptDaySelect.value;
        if (customDayInput) {
          if (receiptDaySelect.value === 'custom') {
            customDayInput.classList.remove('hidden');
          } else {
            customDayInput.classList.add('hidden');
          }
        }
        debouncedUpdate();
      });
    }

    // Payment Mode select
    const paymentModeSelect = $('paymentMode');
    if (paymentModeSelect) {
      paymentModeSelect.value = state.formData.paymentMode || 'upi';
      paymentModeSelect.addEventListener('change', () => {
        state.formData.paymentMode = paymentModeSelect.value;
        debouncedUpdate();
      });
    }

    // Financial year change — regenerate months and recalculate metro cities
    const fySelect = $('financialYear');
    if (fySelect) {
      fySelect.addEventListener('change', () => {
        state.formData.financialYear = fySelect.value;
        state.selectedMonth = 0;
        updateCityMetroClassification();
        populateMonthButtons();
        debouncedUpdate();
      });
    }

    // Tenancy Period / Month Range selector
    const tenancyPeriodSelect = $('tenancyPeriod');
    const customPeriodWrap = $('customPeriodWrap');
    if (tenancyPeriodSelect) {
      tenancyPeriodSelect.value = state.formData.tenancyPeriod || 'all';
      tenancyPeriodSelect.addEventListener('change', () => {
        state.formData.tenancyPeriod = tenancyPeriodSelect.value;
        if (customPeriodWrap) {
          if (tenancyPeriodSelect.value === 'custom') {
            customPeriodWrap.classList.remove('hidden');
          } else {
            customPeriodWrap.classList.add('hidden');
          }
        }
        populateMonthButtons();
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    const periodStartSelect = $('periodStartMonth');
    if (periodStartSelect) {
      periodStartSelect.addEventListener('change', () => {
        state.formData.periodStartMonth = parseInt(periodStartSelect.value, 10);
        populateMonthButtons();
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    const periodEndSelect = $('periodEndMonth');
    if (periodEndSelect) {
      periodEndSelect.addEventListener('change', () => {
        state.formData.periodEndMonth = parseInt(periodEndSelect.value, 10);
        populateMonthButtons();
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    // Mid-Year Rent Hike or Address Change
    const splitToggle = $('splitRentHikeToggle');
    const splitWrap = $('splitRentHikeWrap');
    if (splitToggle) {
      splitToggle.checked = !!state.formData.hasSplitRentHike;
      if (splitWrap) splitWrap.classList.toggle('hidden', !splitToggle.checked);
      splitToggle.addEventListener('change', () => {
        state.formData.hasSplitRentHike = splitToggle.checked;
        if (splitWrap) splitWrap.classList.toggle('hidden', !splitToggle.checked);
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    const splitStartSelect = $('splitStartMonth');
    if (splitStartSelect) {
      splitStartSelect.addEventListener('change', () => {
        state.formData.splitStartMonth = parseInt(splitStartSelect.value, 10);
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    const splitRentInput = $('splitNewRent');
    if (splitRentInput) {
      splitRentInput.value = state.formData.splitNewRent || '';
      splitRentInput.addEventListener('input', () => {
        state.formData.splitNewRent = parseFloat(splitRentInput.value) || 0;
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    // Landlord No PAN checkbox
    const noPanCheckbox = $('landlordNoPan');
    if (noPanCheckbox) {
      noPanCheckbox.checked = !!state.formData.landlordHasNoPan;
      const panSection = $('panSection');
      if (panSection) {
        panSection.style.display = state.formData.landlordHasNoPan ? 'none' : 'block';
      }
      noPanCheckbox.addEventListener('change', () => {
        state.formData.landlordHasNoPan = noPanCheckbox.checked;
        const panSection = $('panSection');
        if (panSection) {
          panSection.style.display = noPanCheckbox.checked ? 'none' : 'block';
        }
        const panError = $('panError');
        const panBadge = $('panValidBadge');
        if (panError) panError.classList.add('hidden');
        if (panBadge) panBadge.classList.add('hidden');
        updateAnnualRentInfo();
        debouncedUpdate();
      });
    }

    // Signature text input
    const sigText = $('signatureText');
    if (sigText) {
      sigText.value = state.formData.signatureText;
      const preview = $('signaturePreviewTyped');
      if (preview) {
        preview.textContent = state.formData.signatureText;
      }
      sigText.addEventListener('input', () => {
        state.formData.signatureText = sigText.value;
        if (preview) {
          preview.textContent = sigText.value;
        }
        debouncedUpdate();
      });
    }
  }

  // ─── Annual Rent Info Update ────────────────────────────────────────
  function updateAnnualRentInfo() {
    const annualRentInfo = $('annualRentInfo');
    if (!annualRentInfo) return;
    const activeMonths = getActiveMonths();
    const count = activeMonths.length;
    const totalRent = activeMonths.reduce((acc, m) => acc + (parseFloat(m.rentAmount) || 0), 0);
    let html = `Total Rent (${count} Months): <strong>${window.formatCurrency(totalRent)}</strong>`;
    if (state.formData.hasSplitRentHike) {
      html += ` <span style="color:#2563eb;font-weight:600">(Split rent active)</span>`;
    }
    if (totalRent > 100000 && !state.formData.landlordHasNoPan && !state.formData.landlordPan) {
      html += `<br><span style="color:#ef4444;font-size:0.8rem;font-weight:600">⚠ Landlord PAN is mandatory when annual rent exceeds ₹1,00,000 (CBDT Circular 8/2013)</span>`;
    }
    const maxMonthly = Math.max(parseFloat(state.formData.monthlyRent) || 0, state.formData.hasSplitRentHike ? (parseFloat(state.formData.splitNewRent) || 0) : 0);
    if (maxMonthly > 50000) {
      html += `<br><span style="color:#7c3aed;font-size:0.8rem;font-weight:600">ℹ Section 194-IB: 2% TDS deduction applies (monthly rent &gt; ₹50,000)</span>`;
    }
    annualRentInfo.innerHTML = html;
  }

  // ─── Preview Rendering ─────────────────────────────────────────────
  function updatePreview() {
    const months = getActiveMonths();
    renderReceiptPreview(months);
    renderForm12BBPreview(months);
    renderDeclarationPreview(months);

    // Dynamically update Form tab label (Form 124 for 2026+ vs Form 12BB)
    const formTabLabel = $('formTabLabel');
    if (formTabLabel && window.getTaxLawFramework) {
      const framework = window.getTaxLawFramework(state.formData.financialYear);
      formTabLabel.textContent = framework.is2026Rules ? 'Form 124 (2026 Rules)' : 'Form 12BB';
    }

    // Dynamically update Download Pack button text to reflect active month count
    const btnAll = $('btnDownloadAll');
    if (btnAll) {
      const framework = window.getTaxLawFramework ? window.getTaxLawFramework(state.formData.financialYear) : { is2026Rules: true };
      const formName = framework.is2026Rules ? 'Form 124' : 'Form 12BB';
      btnAll.innerHTML = `<i data-lucide="package" class="w-4 h-4"></i> Download Full HRA Pack (${months.length} Receipts + ${formName} ZIP) <span class="ml-1 text-[10px] font-bold bg-emerald-400 text-emerald-950 px-1.5 py-0.5 rounded-full">Free</span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function getSignatureHTML(forLandlord = true) {
    const fd = state.formData;
    if (fd.signatureType === 'typed') {
      const sig = fd.signatureText || fd.landlordName || 'Landlord Signature';
      return `<div class="signature-cursive" style="font-family:'Dancing Script',cursive;font-size:1.5rem;color:#1a365d;font-weight:700">${escapeHtml(sig)}</div>`;
    } else if ((fd.signatureType === 'uploaded' || fd.signatureType === 'drawn') && fd.signatureImage) {
      return `<img src="${fd.signatureImage}" style="max-height:40px;max-width:140px;display:inline-block;object-fit:contain" alt="Signature">`;
    }
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function renderReceiptPreview(months) {
    const container = $('receiptPreviewContent');
    if (!container) return;
    const fd = state.formData;
    const monthData = (months && months.find(m => m.indexInFY === state.selectedMonth)) || (months && months[0]) || { receiptDate: new Date(), label: 'Month' };

    const seqNum = monthData && monthData.indexInFY !== undefined ? monthData.indexInFY : state.selectedMonth;
    const receiptNumber = window.generateReceiptNumber(seqNum, fd.financialYear);
    const receiptDate = window.formatDate(monthData.receiptDate || monthData.endDate || new Date());
    const effectiveRent = (monthData && monthData.rentAmount !== undefined) ? monthData.rentAmount : fd.monthlyRent;
    const amountFormatted = window.formatCurrency(effectiveRent);
    const amountWords = window.numberToWordsRupees(effectiveRent);
    let paymentLabel = paymentModeLabels[fd.paymentMode] || fd.paymentMode || 'UPI';
    if (fd.paymentReference) {
      paymentLabel += ` (Ref/UTR: ${escapeHtml(fd.paymentReference)})`;
    }
    const tenantName = escapeHtml(fd.tenantName || 'Tenant Name');
    const landlordName = escapeHtml(fd.landlordName || 'Landlord Name');
    const address = escapeHtml(fd.propertyAddress || 'Property Address');
    const sigHTML = getSignatureHTML(true);

    let panLine = '';
    if (!fd.landlordHasNoPan && fd.landlordPan) {
      panLine = `<p style="margin-top:0.4rem;color:#1f2937">Landlord PAN: <strong style="color:#111827">${escapeHtml(fd.landlordPan.toUpperCase())}</strong></p>`;
    }

    // Revenue stamp logic under Indian Stamp Act, 1899
    const isCash = fd.paymentMode === 'cash';
    const rentAmount = parseFloat(fd.monthlyRent) || 0;
    let stampBoxHTML = '';

    if (isCash && rentAmount > 5000) {
      stampBoxHTML = `
        <div class="revenue-stamp" style="width:88px;height:88px;border:2px dashed #b45309;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:0.68rem;color:#92400e;background:#fefce8;flex-shrink:0;font-weight:600;padding:4px;line-height:1.2">
          <span style="font-size:0.75rem;font-weight:800">REVENUE<br>STAMP ₹1</span>
          <span style="font-size:0.58rem;color:#b45309;margin-top:4px">(Affix stamp for Cash &gt; ₹5,000)</span>
        </div>`;
    } else if (isCash) {
      stampBoxHTML = `
        <div class="revenue-stamp" style="width:96px;height:88px;border:1px dashed #94a3b8;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:0.68rem;color:#475569;background:#f8fafc;flex-shrink:0;padding:4px;line-height:1.2">
          <span style="font-weight:700">CASH &le; ₹5,000</span>
          <span style="font-size:0.58rem;color:#64748b;margin-top:4px">No stamp required (Indian Stamp Act)</span>
        </div>`;
    } else {
      stampBoxHTML = `
        <div class="revenue-stamp" style="width:120px;height:88px;border:1px dashed #94a3b8;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:0.68rem;color:#475569;background:#f8fafc;flex-shrink:0;padding:6px;line-height:1.2">
          <span style="font-weight:700;color:#1e3a8a">ELECTRONIC / BANK TRANSFER</span>
          <span style="font-size:0.58rem;color:#64748b;margin-top:4px">No revenue stamp required under Stamp Act</span>
        </div>`;
    }

    container.innerHTML = `
      <div class="receipt-header" style="text-align:center;border-bottom:2px solid #1e3a8a;padding-bottom:1rem;margin-bottom:1.5rem">
        <div class="receipt-title" style="font-size:1.4rem;font-weight:800;color:#1e3a8a;letter-spacing:0.1em;text-transform:uppercase">RENT RECEIPT</div>
        <div class="receipt-number" style="font-size:0.8rem;color:#6b7280;margin-top:0.25rem;font-weight:500">${escapeHtml(receiptNumber)} | Date: ${receiptDate}</div>
      </div>
      <div class="receipt-body" style="font-size:0.9rem;line-height:1.8;color:#1f2937">
        <p>Received with thanks from <strong style="color:#111827">${tenantName}</strong></p>
        <p style="margin:0.5rem 0">a sum of <span class="receipt-amount" style="font-size:1.25rem;font-weight:700;color:#111827;background:#f0f9ff;padding:0.4rem 0.8rem;border-radius:0.375rem;display:inline-block">${amountFormatted}/-</span></p>
        <p class="receipt-words" style="font-style:italic;color:#4b5563;font-size:0.85rem">(${amountWords} Only)</p>
        <p style="margin-top:0.5rem">towards rent for the month of <strong style="color:#111827">${monthData.label}</strong></p>
        <p style="margin-top:0.5rem">for the property situated at:<br><strong style="color:#111827">${address}</strong></p>
        <p style="margin-top:0.5rem">Payment Mode: <strong style="color:#111827">${paymentLabel}</strong></p>
        ${panLine}
      </div>
      <div class="receipt-footer" style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:2rem;padding-top:1.5rem;border-top:1px dashed #d1d5db;flex-wrap:wrap;gap:1.25rem">
        ${stampBoxHTML}
        <div class="signature-box" style="text-align:right;min-width:160px;margin-left:auto">
          <div style="min-height:45px;display:flex;align-items:flex-end;justify-content:flex-end">${sigHTML}</div>
          <div class="signature-line" style="border-top:1px solid #374151;margin-bottom:0.25rem;width:180px;margin-left:auto"></div>
          <div style="font-size:0.85rem;color:#111827;font-weight:600">${landlordName}</div>
          <div style="font-size:0.75rem;color:#6b7280">(Landlord / Owner)</div>
        </div>
      </div>
    `;
  }

  function renderForm12BBPreview(months) {
    const container = $('form12bbPreviewContent');
    if (!container) return;
    const fd = state.formData;
    const annualRent = (months && months.length)
      ? months.reduce((acc, m) => acc + (m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(fd.monthlyRent) || 0)), 0)
      : (parseFloat(fd.monthlyRent) || 0) * 12;
    const tenantName = escapeHtml(fd.tenantName || 'Employee Name');
    const landlordName = escapeHtml(fd.landlordName || 'Landlord Name');
    const address = escapeHtml(fd.propertyAddress || 'Property Address');
    const panDisplay = fd.landlordHasNoPan ? 'Not Available' : (fd.landlordPan ? escapeHtml(fd.landlordPan.toUpperCase()) : 'Not Provided');
    const framework = window.getTaxLawFramework ? window.getTaxLawFramework(fd.financialYear) : {
      formTitle: 'FORM No. 12BB',
      formSubtitle: '[See rule 26C]',
      section: 'section 192',
      is2026Rules: false,
    };
    const ay = window.getAssessmentYear ? window.getAssessmentYear(fd.financialYear) : '';
    const relDisplay = escapeHtml((fd.landlordRelationship || 'unrelated').toUpperCase());

    container.innerHTML = `
      <div style="border-bottom:2px solid #1e3a8a;padding-bottom:0.75rem;margin-bottom:1rem;text-align:center">
        <h2 style="font-size:1.15rem;font-weight:800;color:#1e3a8a;letter-spacing:0.05em">${framework.formTitle}</h2>
        <p style="font-size:0.75rem;color:#6b7280">${framework.formSubtitle}</p>
        <p style="font-size:0.75rem;margin-top:0.35rem;color:#4b5563">Statement showing particulars of claims by an employee for deduction of tax under ${framework.section}</p>
      </div>

      <div style="margin-bottom:0.75rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;font-size:0.85rem;color:#1f2937">
        <p><strong>Name of Employee:</strong> ${tenantName}</p>
        <p><strong>Financial Year:</strong> ${fd.financialYear}${ay ? ' (AY ' + ay + ')' : ''}</p>
      </div>

      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin-top:0.75rem">
        <table style="min-width:480px;width:100%;border-collapse:collapse;font-size:0.8rem">
          <thead>
            <tr style="background:#eff6ff">
              <th style="border:1px solid #cbd5e1;padding:0.5rem;text-align:center;color:#1e3a8a;font-weight:700;width:35px">Sl.</th>
              <th style="border:1px solid #cbd5e1;padding:0.5rem;text-align:left;color:#1e3a8a;font-weight:700">Nature of Claim</th>
              <th style="border:1px solid #cbd5e1;padding:0.5rem;text-align:left;color:#1e3a8a;font-weight:700">Amount (₹)</th>
              <th style="border:1px solid #cbd5e1;padding:0.5rem;text-align:left;color:#1e3a8a;font-weight:700">Evidence / Particulars</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid #cbd5e1;padding:0.6rem 0.5rem;text-align:center;color:#111827">1</td>
              <td style="border:1px solid #cbd5e1;padding:0.6rem 0.5rem;color:#111827">
                <strong>House Rent Allowance</strong><br>
                <small style="color:#6b7280">(Section 10(13A))</small>
              </td>
              <td style="border:1px solid #cbd5e1;padding:0.6rem 0.5rem;color:#111827;font-weight:700">${window.formatCurrency(annualRent)}</td>
              <td style="border:1px solid #cbd5e1;padding:0.6rem 0.5rem;color:#111827;line-height:1.6">
                <strong>Landlord:</strong> ${landlordName}<br>
                ${framework.is2026Rules ? '<strong>Relationship:</strong> ' + relDisplay + '<br>' : ''}
                <strong>PAN:</strong> ${panDisplay}<br>
                <strong>Address:</strong> ${address}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:2rem;color:#1f2937">
        <p style="font-size:0.85rem">I, <strong>${tenantName}</strong>, hereby declare that the particulars given above are complete and correct.</p>
        <div style="margin-top:2rem;text-align:right">
          <div style="display:inline-block;text-align:center">
            <div style="border-bottom:1px dashed #374151;width:180px;height:24px;margin-bottom:0.25rem"></div>
            <div style="font-size:0.8rem;color:#111827;font-weight:600">Signature of Employee</div>
            <div style="font-size:0.7rem;color:#6b7280">(Sign physically before submitting)</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDeclarationPreview(months) {
    const container = $('declarationPreviewContent');
    if (!container) return;
    const fd = state.formData;

    if (!fd.landlordHasNoPan) {
      container.innerHTML = `
        <div style="text-align:center;padding:3rem 1.5rem;color:#4b5563">
          <div style="font-size:1.5rem;margin-bottom:0.75rem">📄</div>
          <p style="font-size:0.95rem;font-weight:600;color:#1e3a8a">Landlord Declaration Letter (Section 206AA)</p>
          <p style="font-size:0.85rem;margin-top:0.5rem;color:#6b7280;max-width:400px;margin-left:auto;margin-right:auto">
            This formal declaration is essential when annual rent exceeds ₹1,00,000 and the landlord does not possess a PAN.
          </p>
          <div style="margin-top:1rem;display:inline-block;padding:0.5rem 1rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;font-size:0.8rem;color:#1e40af">
            Check <strong>"Landlord does not possess a PAN"</strong> in the form to generate this letter.
          </div>
        </div>
      `;
      return;
    }

    const annualRent = (months && months.length)
      ? months.reduce((acc, m) => acc + (m.rentAmount !== undefined ? parseFloat(m.rentAmount) : (parseFloat(fd.monthlyRent) || 0)), 0)
      : (parseFloat(fd.monthlyRent) || 0) * 12;
    const landlordName = escapeHtml(fd.landlordName || 'Landlord Name');
    const tenantName = escapeHtml(fd.tenantName || 'Tenant Name');
    const address = escapeHtml(fd.propertyAddress || 'Property Address');
    const fyLabel = fd.financialYear;
    const sigHTML = getSignatureHTML(true);

    container.innerHTML = `
      <h2 style="text-align:center;font-size:1.15rem;font-weight:800;color:#1e3a8a">DECLARATION</h2>
      <p style="text-align:center;font-size:0.75rem;color:#6b7280;margin-bottom:1.5rem">(Under Section 206AA of the Income Tax Act, 1961)</p>
      <div style="font-size:0.875rem;line-height:1.8;color:#1f2937">
        <p>I, <strong style="color:#111827">${landlordName}</strong>, hereby declare that I am the owner/landlord of the property situated at:</p>
        <p style="margin:0.5rem 0;padding:0.5rem 0.75rem;background:#f8fafc;border-left:3px solid #3b82f6"><strong style="color:#111827">${address}</strong></p>
        <p>I confirm that I have received a total rent of <strong style="color:#111827">${window.formatCurrency(annualRent)}</strong> from <strong style="color:#111827">${tenantName}</strong> for the financial year <strong style="color:#111827">${fyLabel}</strong>.</p>
        <p style="margin-top:0.5rem">I further declare that I do not possess a Permanent Account Number (PAN) as issued by the Income Tax Department, Government of India.</p>
        <p style="margin-top:0.5rem">The above information is true and correct to the best of my knowledge and belief.</p>
      </div>
      <div style="margin-top:2.5rem;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:1.25rem">
        <div style="font-size:0.85rem;color:#4b5563">
          <p>Date: _______________</p>
          <p style="margin-top:0.25rem">Place: _______________</p>
        </div>
        <div style="text-align:right;min-width:160px;margin-left:auto">
          <div style="min-height:45px;display:flex;align-items:flex-end;justify-content:flex-end">${sigHTML}</div>
          <div class="signature-line" style="border-top:1px solid #374151;width:180px;margin-left:auto;margin-bottom:0.25rem"></div>
          <div style="font-size:0.85rem;color:#111827;font-weight:600">${landlordName}</div>
          <div style="font-size:0.75rem;color:#6b7280">(Landlord / Owner)</div>
        </div>
      </div>
    `;
  }

  // ─── Calculator ─────────────────────────────────────────────────────
  function updateCalculator() {
    const fd = state.formData;

    const calcRule1 = $('calcRule1');
    const calcRule2 = $('calcRule2');
    const calcRule3 = $('calcRule3');
    const calcExemption = $('calcExemption');
    const calcTaxableHRA = $('calcTaxableHRA');
    const calcTaxSaved = $('calcTaxSaved');
    const calcTaxSaved20 = $('calcTaxSaved20');
    const calcPanWarning = $('calcPanWarning');
    const calcTdsWarning = $('calcTdsWarning');
    const calcTdsAmount = $('calcTdsAmount');

    // Handle New Tax Regime (Section 115BAC)
    if (fd.taxRegime === 'new') {
      if (calcRule1) calcRule1.textContent = '₹0 (Disallowed in New Regime)';
      if (calcRule2) calcRule2.textContent = '₹0 (Disallowed in New Regime)';
      if (calcRule3) calcRule3.textContent = '₹0 (Disallowed in New Regime)';
      if (calcExemption) {
        calcExemption.textContent = '₹0';
        calcExemption.title = 'HRA is not exempt under default New Tax Regime Sec 115BAC';
      }
      if (calcTaxableHRA) calcTaxableHRA.textContent = window.formatCurrency((parseFloat(fd.hraReceived) || 0) * 12);
      if (calcTaxSaved) calcTaxSaved.textContent = '₹0';
      if (calcTaxSaved20) calcTaxSaved20.textContent = '₹0';
      if (calcTdsWarning) {
        calcTdsWarning.classList.add('hidden');
        calcTdsWarning.style.display = 'none';
      }
      if (calcPanWarning) {
        calcPanWarning.classList.add('hidden');
        calcPanWarning.style.display = 'none';
      }
      return;
    }

    const activeMonths = getActiveMonths();
    const totalRent = activeMonths.reduce((acc, m) => acc + (parseFloat(m.rentAmount) || 0), 0);
    const effectiveMonthlyRent = activeMonths.length ? (totalRent / activeMonths.length) : (parseFloat(fd.monthlyRent) || 0);

    const isMetro = fd.cityCategory === 'metro';
    const hraCalc = window.calculateHRA(
      fd.basicSalary,
      fd.daAmount,
      fd.hraReceived,
      effectiveMonthlyRent,
      isMetro,
      fd.financialYear
    );

    if (calcRule1) calcRule1.textContent = window.formatCurrency(hraCalc.rule1);
    if (calcRule2) calcRule2.textContent = window.formatCurrency(hraCalc.rule2);
    if (calcRule3) calcRule3.textContent = window.formatCurrency(hraCalc.rule3);
    if (calcExemption) calcExemption.textContent = window.formatCurrency(hraCalc.exemption);
    if (calcTaxableHRA) calcTaxableHRA.textContent = window.formatCurrency(hraCalc.taxableHRA);
    if (calcTaxSaved) calcTaxSaved.textContent = window.formatCurrency(hraCalc.taxSaved30);
    if (calcTaxSaved20) calcTaxSaved20.textContent = window.formatCurrency(hraCalc.taxSaved20);

    const maxMonthlyRent = Math.max(parseFloat(fd.monthlyRent) || 0, fd.hasSplitRentHike ? (parseFloat(fd.splitNewRent) || 0) : 0);
    const calcTdsMonthly = $('calcTdsMonthly');
    if (calcTdsMonthly) {
      calcTdsMonthly.textContent = window.formatCurrency(Math.round(maxMonthlyRent * 0.02));
    }

    if (calcTdsWarning) {
      if (maxMonthlyRent > 50000) {
        const totalTds = Math.round(totalRent * 0.02);
        if (calcTdsAmount) calcTdsAmount.textContent = window.formatCurrency(totalTds);
        calcTdsWarning.classList.remove('hidden');
        calcTdsWarning.style.display = 'flex';
      } else {
        calcTdsWarning.classList.add('hidden');
        calcTdsWarning.style.display = 'none';
      }
    }

    if (calcPanWarning) {
      if (totalRent > 100000) {
        calcPanWarning.classList.remove('hidden');
        calcPanWarning.style.display = 'flex';
      } else {
        calcPanWarning.classList.add('hidden');
        calcPanWarning.style.display = 'none';
      }
    }
  }

  // ─── Tab Switching ──────────────────────────────────────────────────
  function initTabSwitching() {
    const tabs = [
      { btnId: 'tabReceipt', panelId: 'receiptPreview', key: 'receipt' },
      { btnId: 'tabForm12BB', panelId: 'form12bbPreview', key: 'form12bb' },
      { btnId: 'tabDeclaration', panelId: 'declarationPreview', key: 'declaration' },
    ];

    tabs.forEach(({ btnId, panelId, key }) => {
      const btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.selectedTab = key;
        tabs.forEach(({ btnId: bId }) => {
          const b = $(bId);
          if (b) {
            b.classList.remove('active');
            b.classList.remove('text-blue-600', 'dark:text-blue-400', 'border-blue-600');
          }
        });
        btn.classList.add('active');

        tabs.forEach(({ panelId: pId }) => {
          const p = $(pId);
          if (p) {
            p.classList.remove('active');
            p.classList.add('hidden');
            p.style.display = 'none';
          }
        });
        const panel = $(panelId);
        if (panel) {
          panel.classList.remove('hidden');
          panel.classList.add('active');
          panel.style.display = 'block';
        }
      });
    });
  }

  // ─── Export / Download ──────────────────────────────────────────────
  function validateBeforeDownload() {
    const fd = state.formData;
    if (!fd.tenantName || !fd.tenantName.trim()) {
      showToast('⚠️ Please enter your full Tenant Name before downloading.', 4000);
      const el = $('tenantName');
      if (el) el.focus();
      return false;
    }
    if (!fd.landlordName || !fd.landlordName.trim()) {
      showToast('⚠️ Please enter Landlord Name before downloading.', 4000);
      const el = $('landlordName');
      if (el) el.focus();
      return false;
    }
    if (!fd.cityId) {
      showToast('⚠️ Please select your Rental City / Location before downloading.', 4000);
      const el = $('cityPicker');
      if (el) el.focus();
      return false;
    }
    if (!fd.propertyAddress || !fd.propertyAddress.trim()) {
      showToast('⚠️ Please enter Rental Address before downloading.', 4000);
      const el = $('propertyAddress');
      if (el) el.focus();
      return false;
    }
    if (!fd.monthlyRent || parseFloat(fd.monthlyRent) <= 0) {
      showToast('⚠️ Please enter a valid Monthly Rent amount.', 4000);
      const el = $('monthlyRent');
      if (el) el.focus();
      return false;
    }

    // Check for demo sample data
    const sampleNames = ['vikram malhotra', 'rajesh kumar', 'anil deshmukh', 'suresh sharma'];
    const tName = (fd.tenantName || '').trim().toLowerCase();
    const lName = (fd.landlordName || '').trim().toLowerCase();
    const pan = (fd.landlordPan || '').trim().toUpperCase();

    if (sampleNames.includes(tName) || sampleNames.includes(lName) || pan === 'ABCDE1234F') {
      const confirmSample = window.confirm(
        '⚠️ Notice: You are generating documents with sample/demo details ("' + fd.tenantName + '" / "' + fd.landlordName + '").\n\nClick OK to download as demo sample, or Cancel to enter your real details.'
      );
      if (!confirmSample) return false;
    }

    return true;
  }

  function showChecklistModal() {
    const modal = $('checklistModal');
    if (!modal) return;
    const is2026 = (parseInt((state.formData.financialYear || '').split('-')[0], 10) || 2026) >= 2026;
    const titleEl = $('checklistFormTitle');
    if (titleEl) {
      titleEl.textContent = is2026 ? 'Form 124 (2026 Rules):' : 'Form 12BB:';
    }
    const tdsItem = $('checklistTdsItem');
    if (tdsItem) {
      const maxRent = Math.max(
        parseFloat(state.formData.monthlyRent) || 0,
        state.formData.hasSplitRentHike ? (parseFloat(state.formData.splitNewRent) || 0) : 0
      );
      if (maxRent > 50000) {
        tdsItem.classList.remove('hidden');
      } else {
        tdsItem.classList.add('hidden');
      }
    }
    modal.classList.remove('hidden');
    modal.classList.add('active');
  }

  function initChecklistModal() {
    const modal = $('checklistModal');
    const closeBtn = $('closeChecklistModal');
    const gotItBtn = $('btnGotItChecklist');
    const printBtn = $('btnPrintChecklist');

    function closeModal() {
      if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
      }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (gotItBtn) gotItBtn.addEventListener('click', closeModal);
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
  }

  function initExportButtons() {
    const btnSingle = $('btnDownloadSingle');
    const btnAll = $('btnDownloadAll');

    if (btnSingle) {
      btnSingle.addEventListener('click', async () => {
        if (!validateBeforeDownload()) return;
        const originalHTML = btnSingle.innerHTML;
        try {
          btnSingle.disabled = true;
          btnSingle.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span> Generating...';

          if (!window.generateReceiptPDF) {
            throw new Error('PDF generator is initializing. Please wait a moment and try again.');
          }

          const months = getActiveMonths();
          const monthData = (months && months.find(m => m.indexInFY === state.selectedMonth)) || (months && months[0]) || { label: 'Receipt' };
          const seqNum = monthData.indexInFY !== undefined ? monthData.indexInFY : state.selectedMonth;
          const pdfBytes = await window.generateReceiptPDF(state.formData, seqNum, months);
          const monthName = String(monthData.label || 'Receipt').replace(/\s+/g, '_');
          const fileName = `Rent_Receipt_${monthName}.pdf`;
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          downloadBlob(blob, fileName);
          showToast('Receipt downloaded successfully!');
          showChecklistModal();
        } catch (err) {
          console.error('Download error:', err);
          showToast('Notice: ' + (err.message || 'Please check inputs and try again.'), 6000);
        } finally {
          btnSingle.disabled = false;
          btnSingle.innerHTML = originalHTML;
        }
      });
    }

    if (btnAll) {
      btnAll.addEventListener('click', async () => {
        if (!validateBeforeDownload()) return;
        const originalText = btnAll.innerHTML;
        try {
          btnAll.disabled = true;
          btnAll.innerHTML = '<span class="spinner inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span> Packaging Receipts &amp; Forms...';

          const zipConstructor = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
          if (!zipConstructor) {
            throw new Error('Zip library is still loading. Please wait a moment and try again.');
          }
          const zip = new zipConstructor();

          const months = getActiveMonths();
          const fd = state.formData;

          // Generate receipt PDFs for active months
          for (let i = 0; i < months.length; i++) {
            const monthData = months[i];
            const seqNum = monthData.indexInFY !== undefined ? monthData.indexInFY : i;
            const pdfBytes = await window.generateReceiptPDF(fd, seqNum, months);
            const monthName = String(monthData.label).replace(/\s+/g, '_');
            zip.file(`Receipts/Rent_Receipt_${monthName}.pdf`, pdfBytes);
          }

          // Generate Form 124 or Form 12BB
          const framework = window.getTaxLawFramework ? window.getTaxLawFramework(fd.financialYear) : { is2026Rules: true };
          const form12bbBytes = await window.generateForm12BBPDF(fd, months);
          const formFileName = framework.is2026Rules ? `Form_124_${fd.financialYear}.pdf` : `Form_12BB_${fd.financialYear}.pdf`;
          zip.file(formFileName, form12bbBytes);

          // Generate Declaration if landlord has no PAN
          if (fd.landlordHasNoPan) {
            const declBytes = await window.generateDeclarationPDF(fd, months);
            zip.file(`Landlord_Declaration_${fd.financialYear}.pdf`, declBytes);
          }

          // Generate Summary
          const totalRent = months.reduce((acc, m) => acc + (parseFloat(m.rentAmount) || 0), 0);
          const effectiveMonthlyRent = months.length ? (totalRent / months.length) : (parseFloat(fd.monthlyRent) || 0);
          const isMetro = fd.cityCategory === 'metro';
          const hraCalc = window.calculateHRA(
            fd.basicSalary,
            fd.daAmount,
            fd.hraReceived,
            effectiveMonthlyRent,
            isMetro,
            fd.financialYear
          );
          if (window.generateSummaryPDF) {
            const summaryBytes = await window.generateSummaryPDF(fd, months, hraCalc);
            zip.file(`HRA_Summary_${fd.financialYear}.pdf`, summaryBytes);
          }

          // Generate and download ZIP
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipBlob, `HRAPack_${fd.financialYear}.zip`);
          showToast('Full HRA Pack downloaded successfully!');
          showChecklistModal();
        } catch (err) {
          console.error('Batch export error:', err);
          showToast('Notice: ' + (err.message || 'Please try again.'), 6000);
        } finally {
          btnAll.disabled = false;
          btnAll.innerHTML = originalText;
        }
      });
    }
  }

  // ─── Share Modal & Actions ──────────────────────────────────────────
  function initShareModal() {
    const modal = $('shareModal');
    const closeBtn = $('closeShareModal');
    const btnShareWA = $('btnShareWhatsApp');
    const btnCopy = $('btnCopyLink');
    const modalWA = $('modalShareWhatsApp');
    const modalLI = $('modalShareLinkedIn');
    const modalCopy = $('modalCopyLink');

    const shareUrl = 'https://hrapack.netlify.app/';
    const shareText = 'Claiming HRA tax exemption? Check out HRAPack! It generates all 12 monthly rent receipts, Form 12BB, and Landlord Declarations 100% free in your browser with zero spam: ' + shareUrl;

    function openModal() {
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
      }
    }

    function closeModal() {
      if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
      }
    }

    function shareViaWhatsApp() {
      const waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText);
      window.open(waUrl, '_blank');
    }

    function shareViaLinkedIn() {
      const liUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl);
      window.open(liUrl, '_blank');
    }

    function copyLink() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('🔗 Link copied to clipboard! Share it with your colleagues.');
          closeModal();
        }).catch(() => {
          fallbackCopyText(shareUrl);
        });
      } else {
        fallbackCopyText(shareUrl);
      }
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('🔗 Link copied to clipboard!');
      closeModal();
    }

    if (btnShareWA) btnShareWA.addEventListener('click', shareViaWhatsApp);
    if (btnCopy) btnCopy.addEventListener('click', copyLink);
    if (modalWA) modalWA.addEventListener('click', shareViaWhatsApp);
    if (modalLI) modalLI.addEventListener('click', shareViaLinkedIn);
    if (modalCopy) modalCopy.addEventListener('click', copyLink);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Print Receipt button
    const printBtn = $('btnPrintReceipt');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }
  }

  // ─── Form Utilities (Sample Data & Reset) ───────────────────────────
  function initFormUtilities() {
    const btnSample = $('btnLoadSample');
    const btnClear = $('btnClearForm');

    const SAMPLE_DATA = {
      taxRegime: 'old',
      financialYear: '2026-27',
      cityId: 'bengaluru',
      cityCategory: 'metro',
      salaryFrequency: 'monthly',
      basicSalary: 65000,
      daAmount: 0,
      hraReceived: 26000,
      tenantName: 'Vikram Malhotra',
      landlordName: 'Anil Deshmukh',
      landlordRelationship: 'unrelated',
      landlordPan: 'ABCDE1234F',
      landlordHasNoPan: false,
      propertyAddress: 'A-402, Prestige Lakeside Habitat, Varthur, Bengaluru, Karnataka - 560087',
      monthlyRent: 28000,
      receiptDayType: 'last',
      customReceiptDay: 1,
      paymentMode: 'upi',
      paymentReference: 'UPI/409283741829',
      signatureType: 'typed',
      signatureText: 'Anil Deshmukh',
      signatureImage: null,
    };

    if (btnSample) {
      btnSample.addEventListener('click', () => {
        Object.assign(state.formData, SAMPLE_DATA);
        state.lastAutoLandlordName = SAMPLE_DATA.landlordName;
        syncFormElementsFromState();
        saveFormState();
        showToast('✨ Loaded sample data! You can edit any field or download test receipts.');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        state.formData.tenantName = '';
        state.formData.landlordName = '';
        state.formData.landlordRelationship = 'unrelated';
        state.formData.landlordPan = '';
        state.formData.landlordHasNoPan = false;
        state.formData.propertyAddress = '';
        state.formData.monthlyRent = 0;
        state.formData.basicSalary = 0;
        state.formData.daAmount = 0;
        state.formData.hraReceived = 0;
        state.formData.paymentReference = '';
        state.formData.signatureText = '';
        state.formData.signatureImage = null;
        state.lastAutoLandlordName = '';
        syncFormElementsFromState();
        try {
          localStorage.removeItem('hrapack_formData');
        } catch (e) {}
        showToast('Form reset! Ready for your details.');
      });
    }
  }

  function saveFormState() {
    try {
      localStorage.setItem('hrapack_formData', JSON.stringify(state.formData));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  function loadFormState() {
    try {
      const saved = localStorage.getItem('hrapack_formData');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.assign(state.formData, parsed);
          state.lastAutoLandlordName = state.formData.landlordName || '';
        }
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
    }
  }

  function syncFormElementsFromState() {
    const textInputs = [
      { id: 'basicSalary', key: 'basicSalary' },
      { id: 'daAmount', key: 'daAmount' },
      { id: 'hraReceived', key: 'hraReceived' },
      { id: 'tenantName', key: 'tenantName' },
      { id: 'landlordName', key: 'landlordName' },
      { id: 'landlordPan', key: 'landlordPan' },
      { id: 'propertyAddress', key: 'propertyAddress' },
      { id: 'monthlyRent', key: 'monthlyRent' },
      { id: 'paymentReference', key: 'paymentReference' },
      { id: 'signatureText', key: 'signatureText' },
    ];
    textInputs.forEach(({ id, key }) => {
      const el = $(id);
      if (el && state.formData[key] !== undefined) {
        el.value = state.formData[key] === 0 ? '' : state.formData[key];
      }
    });

    const cityPicker = $('cityPicker');
    if (cityPicker && state.formData.cityId) {
      cityPicker.value = state.formData.cityId;
    }

    const relSelect = $('landlordRelationship');
    if (relSelect && state.formData.landlordRelationship) {
      relSelect.value = state.formData.landlordRelationship;
    }

    const receiptDay = $('receiptDay');
    if (receiptDay && state.formData.receiptDayType) {
      receiptDay.value = state.formData.receiptDayType;
    }

    const paymentModeSelect = $('paymentMode');
    if (paymentModeSelect && state.formData.paymentMode) {
      paymentModeSelect.value = state.formData.paymentMode;
    }

    const fySelect = $('financialYear');
    if (fySelect && state.formData.financialYear) {
      fySelect.value = state.formData.financialYear;
    }

    const periodSelect = $('tenancyPeriod');
    const customPeriodWrap = $('customPeriodWrap');
    if (periodSelect) {
      periodSelect.value = state.formData.tenancyPeriod || 'all';
      if (customPeriodWrap) customPeriodWrap.classList.toggle('hidden', periodSelect.value !== 'custom');
    }
    const periodStart = $('periodStartMonth');
    if (periodStart && state.formData.periodStartMonth !== undefined) periodStart.value = state.formData.periodStartMonth;
    const periodEnd = $('periodEndMonth');
    if (periodEnd && state.formData.periodEndMonth !== undefined) periodEnd.value = state.formData.periodEndMonth;

    const splitToggle = $('splitRentHikeToggle');
    const splitWrap = $('splitRentHikeWrap');
    if (splitToggle) {
      splitToggle.checked = !!state.formData.hasSplitRentHike;
      if (splitWrap) splitWrap.classList.toggle('hidden', !splitToggle.checked);
    }
    const splitStart = $('splitStartMonth');
    if (splitStart && state.formData.splitStartMonth !== undefined) splitStart.value = state.formData.splitStartMonth;
    const splitRent = $('splitNewRent');
    if (splitRent) splitRent.value = state.formData.splitNewRent || '';

    const landlordNoPan = $('landlordNoPan');
    const panSection = $('panSection');
    if (landlordNoPan) {
      landlordNoPan.checked = !!state.formData.landlordHasNoPan;
      if (panSection) {
        panSection.style.display = state.formData.landlordHasNoPan ? 'none' : 'block';
      }
    }

    // Restore Salary Frequency Toggle
    const freqMonthly = $('freqMonthly');
    const freqAnnual = $('freqAnnual');
    if (freqMonthly && freqAnnual) {
      if (state.formData.salaryFrequency === 'annual') {
        freqAnnual.className = 'px-2 py-0.5 rounded font-semibold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs';
        freqMonthly.className = 'px-2 py-0.5 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800';
      } else {
        freqMonthly.className = 'px-2 py-0.5 rounded font-semibold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs';
        freqAnnual.className = 'px-2 py-0.5 rounded font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800';
      }
    }

    const bSalEl = $('basicSalary');
    if (bSalEl && state.formData.basicSalary) {
      bSalEl.value = state.formData.salaryFrequency === 'annual' ? Math.round(state.formData.basicSalary * 12) : state.formData.basicSalary;
    }
    const hRecEl = $('hraReceived');
    if (hRecEl && state.formData.hraReceived) {
      hRecEl.value = state.formData.salaryFrequency === 'annual' ? Math.round(state.formData.hraReceived * 12) : state.formData.hraReceived;
    }

    // Restore Upfront Tax Regime switcher
    const btnRegimeOld = $('regimeOldBtn');
    const btnRegimeNew = $('regimeNewBtn');
    const regimeNotice = $('newRegimeNotice');
    if (btnRegimeOld && btnRegimeNew) {
      if (state.formData.taxRegime === 'new') {
        btnRegimeOld.className = 'py-2 px-3 text-xs sm:text-sm font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all text-center';
        btnRegimeNew.className = 'py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg bg-amber-600 text-white shadow-sm transition-all text-center';
        if (regimeNotice) regimeNotice.classList.remove('hidden');
      } else {
        btnRegimeOld.className = 'py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 text-white shadow-sm transition-all text-center';
        btnRegimeNew.className = 'py-2 px-3 text-xs sm:text-sm font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all text-center';
        if (regimeNotice) regimeNotice.classList.add('hidden');
      }
    }

    updateCityMetroClassification();
    updateRelationshipAdvisory();
    updateAnnualRentInfo();
    debouncedUpdate();
  }

  // ─── Dark Mode ─────────────────────────────────────────────────────
  function initDarkMode() {
    const toggle = $('darkModeToggle');
    if (!toggle) return;

    // Check localStorage or system preference
    const savedDark = localStorage.getItem('hrapack_dark');
    if (savedDark === 'true') {
      state.isDark = true;
    } else if (savedDark === 'false') {
      state.isDark = false;
    } else {
      state.isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyDarkMode(state.isDark);

    toggle.addEventListener('click', () => {
      state.isDark = !state.isDark;
      applyDarkMode(state.isDark);
      localStorage.setItem('hrapack_dark', state.isDark ? 'true' : 'false');
    });
  }

  function applyDarkMode(isDark) {
    const html = document.documentElement;
    const toggle = $('darkModeToggle');
    if (isDark) {
      html.classList.add('dark');
      html.setAttribute('data-theme', 'dark');
      if (toggle) {
        toggle.innerHTML = '<i data-lucide="sun" class="w-5 h-5 text-amber-400"></i>';
      }
    } else {
      html.classList.remove('dark');
      html.removeAttribute('data-theme');
      if (toggle) {
        toggle.innerHTML = '<i data-lucide="moon" class="w-5 h-5 text-gray-600"></i>';
      }
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // ─── Mobile Panel Switching ─────────────────────────────────────────
  function initMobilePanelSwitching() {
    const formTab = $('mobileFormTab');
    const previewTab = $('mobilePreviewTab');
    const btnGoToPreview = $('btnGoToPreview');
    const btnBackToForm = $('btnBackToForm');
    const formPanel = document.querySelector('.form-panel');
    const previewPanel = document.querySelector('.preview-panel');

    function setMobileTab(tab, smoothScroll = false) {
      if (tab === 'form') {
        if (formPanel) {
          formPanel.classList.add('mobile-active');
          formPanel.style.display = 'block';
        }
        if (previewPanel) {
          previewPanel.classList.remove('mobile-active');
          previewPanel.style.display = '';
        }
        if (formTab) {
          formTab.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-xl bg-blue-600 text-white shadow-sm transition-all';
        }
        if (previewTab) {
          previewTab.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all';
        }
        if (smoothScroll && formPanel) {
          formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        if (previewPanel) {
          previewPanel.classList.add('mobile-active');
          previewPanel.style.display = 'block';
        }
        if (formPanel) {
          formPanel.classList.remove('mobile-active');
          formPanel.style.display = '';
        }
        if (previewTab) {
          previewTab.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-xl bg-blue-600 text-white shadow-sm transition-all';
        }
        if (formTab) {
          formTab.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all';
        }
        if (smoothScroll && previewPanel) {
          previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }

    if (formTab) formTab.addEventListener('click', () => setMobileTab('form'));
    if (previewTab) previewTab.addEventListener('click', () => setMobileTab('preview'));
    if (btnGoToPreview) btnGoToPreview.addEventListener('click', () => setMobileTab('preview', true));
    if (btnBackToForm) btnBackToForm.addEventListener('click', () => setMobileTab('form', true));
  }

  // ─── FAQ Accordion ──────────────────────────────────────────────────
  function initFAQAccordion() {
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (!item) return;
        const isOpen = item.classList.contains('open');

        // Close all other items
        document.querySelectorAll('.faq-item.open').forEach((openItem) => {
          if (openItem !== item) {
            openItem.classList.remove('open');
            const ans = openItem.querySelector('.faq-answer');
            if (ans) {
              ans.classList.add('hidden');
              ans.style.display = 'none';
            }
            const icon = openItem.querySelector('[data-lucide="chevron-down"], .faq-icon');
            if (icon) icon.style.transform = 'rotate(0deg)';
          }
        });

        // Toggle current
        item.classList.toggle('open', !isOpen);
        const ans = item.querySelector('.faq-answer');
        if (ans) {
          if (isOpen) {
            ans.classList.add('hidden');
            ans.style.display = 'none';
          } else {
            ans.classList.remove('hidden');
            ans.style.display = 'block';
          }
        }
        const icon = item.querySelector('[data-lucide="chevron-down"], .faq-icon');
        if (icon) {
          icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      });
    });
  }

  // ─── Smooth Scroll for Nav Links / Hero CTA ────────────────────────
  function initSmoothScroll() {
    // Hero CTA — 'Start Generating →'
    document.querySelectorAll('a[href="#app-section"], button[data-scroll="#app-section"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector('#app-section');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Nav links
    document.querySelectorAll('nav a[href^="#"], .nav-links a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // ─── Mobile Menu Drawer Toggle ──────────────────────────────────────
  function initMobileMenu() {
    const btn = $('mobileMenuBtn');
    const drawer = $('mobileNavDrawer');
    if (!btn || !drawer) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = drawer.classList.contains('hidden');
      if (isHidden) {
        drawer.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      } else {
        drawer.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i data-lucide="menu" class="w-6 h-6"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    // Close when clicking outside drawer
    document.addEventListener('click', (e) => {
      if (!drawer.classList.contains('hidden') && !drawer.contains(e.target) && !btn.contains(e.target)) {
        drawer.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i data-lucide="menu" class="w-6 h-6"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    // Close when clicking any link inside drawer
    drawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        drawer.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i data-lucide="menu" class="w-6 h-6"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      });
    });
  }

  // ─── Initialization ─────────────────────────────────────────────────
  function init() {
    // Populate financial years dropdown
    populateFinancialYears();

    // Initialize dark mode
    initDarkMode();

    // Populate month selector buttons
    populateMonthButtons();

    // Load saved form state from localStorage
    loadFormState();

    // Bind form inputs
    bindFormInputs();

    // Initialize signature switching
    initSignatureSwitching();

    // Sync restored state to all UI controls
    syncFormElementsFromState();

    // Initialize tab switching
    initTabSwitching();

    // Initialize export buttons
    initExportButtons();

    // Initialize share modal & actions
    initShareModal();

    // Initialize form utilities (sample data, reset)
    initFormUtilities();

    // Initialize mobile panel switching
    initMobilePanelSwitching();

    // Initialize FAQ accordion
    initFAQAccordion();

    // Initialize smooth scroll
    initSmoothScroll();

    // Initialize mobile menu drawer
    initMobileMenu();

    // Update footer year
    const fyEl = $('footerYear');
    if (fyEl) {
      fyEl.textContent = new Date().getFullYear();
    }

    // Initial city metro classification and relationship advisory
    updateCityMetroClassification();
    updateRelationshipAdvisory();

    // Initialize checklist modal
    initChecklistModal();

    // Initial annual rent info
    updateAnnualRentInfo();

    // Initial preview render
    updatePreview();

    // Initial calculator render
    updateCalculator();

    // Render lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Register Service Worker for PWA Offline capability
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    }

    // Handle SEO deep link URL params
    handleUrlParameters();
  }

  // ─── Handle Deep Link URL Parameters (SEO routing) ─────────────────
  function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const noPan = urlParams.get('noPan');

    if (noPan === 'true') {
      const noPanCb = $('landlordNoPan');
      if (noPanCb) {
        noPanCb.checked = true;
        state.formData.landlordHasNoPan = true;
        const panSection = $('panSection');
        if (panSection) panSection.style.display = 'none';
        updateAnnualRentInfo();
      }
    }

    if (tab === 'form12bb') {
      const btn = $('tabForm12BB');
      if (btn) btn.click();
    } else if (tab === 'declaration') {
      const btn = $('tabDeclaration');
      if (btn) btn.click();
    }

    // If deep linked, scroll smoothly to the generator section
    if (tab || noPan) {
      setTimeout(() => {
        const appSection = $('app-section');
        if (appSection) appSection.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }

  init();
});
