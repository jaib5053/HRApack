/**
 * HRAPack — Utility Library
 * Number-to-words, validators, formatters, HRA calculator
 */

// ── Number to Words (Indian English) ──────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? '-' + ONES[o] : '');
}

function threeDigitWords(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let result = '';
  if (h > 0) result += ONES[h] + ' Hundred';
  if (rest > 0) result += (h > 0 ? ' and ' : '') + twoDigitWords(rest);
  return result;
}

/**
 * Convert a number to Indian English words.
 * Supports up to 99,99,99,999 (99 crore).
 * @param {number} num
 * @returns {string}
 */
window.numberToWords = function (num) {
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + window.numberToWords(-num);

  num = Math.round(num);
  let result = '';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  if (crore > 0) result += twoDigitWords(crore) + ' Crore ';
  if (lakh > 0) result += twoDigitWords(lakh) + ' Lakh ';
  if (thousand > 0) result += twoDigitWords(thousand) + ' Thousand ';
  if (remainder > 0) {
    if (crore > 0 || lakh > 0 || thousand > 0) {
      if (remainder < 100) result += 'and ';
    }
    result += threeDigitWords(remainder);
  }

  return result.trim();
};

/**
 * Convert number to "Rupees ... Only" format.
 * @param {number} num
 * @returns {string}
 */
window.numberToWordsRupees = function (num) {
  if (num === 0) return 'Rupees Zero Only';
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);
  let result = 'Rupees ' + window.numberToWords(whole);
  if (paise > 0) {
    result += ' and ' + window.numberToWords(paise) + ' Paise';
  }
  result += ' Only';
  return result;
};


// ── Validation ────────────────────────────────────────────────────────

/**
 * Validate Indian PAN format: ABCDE1234F
 * @param {string} pan
 * @returns {boolean}
 */
window.validatePAN = function (pan) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test((pan || '').toUpperCase().trim());
};


// ── Currency Formatting ───────────────────────────────────────────────

/**
 * Format a number in Indian numbering system with ₹ symbol.
 * @param {number} amount
 * @returns {string}
 */
window.formatCurrency = function (amount) {
  return '₹' + window.formatIndianNumber(amount);
};

/**
 * Format a number with Indian comma grouping (e.g., 1,25,000).
 * @param {number} num
 * @returns {string}
 */
window.formatIndianNumber = function (num) {
  num = Math.round(num);
  const str = num.toString();
  if (str.length <= 3) return str;

  let lastThree = str.slice(-3);
  let remaining = str.slice(0, -3);

  // Insert commas every 2 digits in the remaining part
  if (remaining.length > 0) {
    lastThree = ',' + lastThree;
  }
  let formatted = '';
  while (remaining.length > 2) {
    formatted = ',' + remaining.slice(-2) + formatted;
    remaining = remaining.slice(0, -2);
  }
  formatted = remaining + formatted + lastThree;
  return formatted;
};


// ── Financial Year Helpers ────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Standard City directory with Metro classification by Financial Year.
 * Under Income-tax Rules, 2026 (effective FY 2026-27):
 * 8 cities qualify for the 50% rate: Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad.
 * Under legacy Income-tax Rules, 1962 (FY 2025-26 and prior):
 * 4 statutory metros qualify for 50%: Mumbai, Delhi, Kolkata, Chennai.
 */
window.TOP_CITIES = [
  { id: 'delhi', name: 'Delhi / New Delhi / NCR', metroFrom2026: true, metroLegacy: true },
  { id: 'mumbai', name: 'Mumbai (MMR / Thane / Navi Mumbai)', metroFrom2026: true, metroLegacy: true },
  { id: 'kolkata', name: 'Kolkata', metroFrom2026: true, metroLegacy: true },
  { id: 'chennai', name: 'Chennai', metroFrom2026: true, metroLegacy: true },
  { id: 'bengaluru', name: 'Bengaluru (Bangalore)', metroFrom2026: true, metroLegacy: false },
  { id: 'hyderabad', name: 'Hyderabad', metroFrom2026: true, metroLegacy: false },
  { id: 'pune', name: 'Pune', metroFrom2026: true, metroLegacy: false },
  { id: 'ahmedabad', name: 'Ahmedabad', metroFrom2026: true, metroLegacy: false },
  { id: 'other', name: 'Other City / Town (Non-Metro - 40%)', metroFrom2026: false, metroLegacy: false },
];

/**
 * Returns the statutory tax framework governing a given financial year.
 * FY 2026-27+: Income-tax Rules, 2026 (Rule 205, Form 124, 8 Metros)
 * FY 2025-26-: Income-tax Act, 1961 (Rule 26C, Form 12BB, 4 Metros)
 * @param {string} fy - Financial year string (e.g. '2026-27' or '2025-26')
 * @returns {Object}
 */
window.getTaxLawFramework = function (fy) {
  const fyStart = parseInt((fy || '').split('-')[0], 10) || 2026;
  if (fyStart >= 2026) {
    return {
      actName: 'Income-tax Act',
      rulesName: 'Income-tax Rules, 2026',
      section: 'Section 392(5)(b)',
      rule: 'Rule 205',
      formNumber: '124',
      formTitle: 'Form No. 124',
      formSubtitle: '[See section 392(5)(b) and rule 205]',
      metroCount: 8,
      metroCitiesDisplay: 'Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad',
      hasRelationshipField: true,
      is2026Rules: true,
    };
  } else {
    return {
      actName: 'Income-tax Act, 1961',
      rulesName: 'Income-tax Rules, 1962',
      section: 'Section 192',
      rule: 'Rule 26C / Rule 2A',
      formNumber: '12BB',
      formTitle: 'Form No. 12BB',
      formSubtitle: '[See section 192 and rule 26C]',
      metroCount: 4,
      metroCitiesDisplay: 'Mumbai, Delhi, Kolkata, Chennai',
      hasRelationshipField: false,
      is2026Rules: false,
    };
  }
};

/**
 * Check if a city qualifies for the 50% salary threshold for a given financial year.
 * @param {string} cityId - City ID or name
 * @param {string} fy - Financial Year string
 * @returns {boolean}
 */
window.isMetroCity = function (cityId, fy) {
  const fyStart = parseInt((fy || '').split('-')[0], 10) || 2026;
  const is2026Rules = fyStart >= 2026;
  const normalized = (cityId || '').toLowerCase().trim();

  // Legacy 4 Metros (always 50%)
  if (/delhi|mumbai|bombay|kolkata|calcutta|chennai|madras/.test(normalized)) {
    return true;
  }

  // Under Income-tax Rules 2026, 4 additional cities qualify for 50%
  if (is2026Rules && /bengaluru|bangalore|hyderabad|pune|ahmedabad/.test(normalized)) {
    return true;
  }

  return false;
};

/**
 * Get array of 12 months for a given Indian Financial Year with optional receipt day.
 * FY format: "2026-27" means Apr 2026 to Mar 2027.
 * @param {string} fy - e.g., "2026-27"
 * @param {string} [receiptDayType='last'] - 'last', '1st', '5th', '10th', or 'custom'
 * @param {number} [customDay] - 1-31
 * @returns {Array<{month: number, year: number, label: string, shortLabel: string, startDate: Date, endDate: Date, receiptDate: Date}>}
 */
window.getFinancialYearMonths = function (fy, receiptDayType = 'last', customDay) {
  const parts = String(fy || '').split('-');
  const startYear = parseInt(parts[0], 10) || new Date().getFullYear();

  const months = [];
  // April to December of startYear
  for (let m = 3; m <= 11; m++) { // JS months: 3=Apr, 11=Dec
    months.push(buildMonthObj(m, startYear, receiptDayType, customDay));
  }
  // January to March of startYear+1
  for (let m = 0; m <= 2; m++) { // JS months: 0=Jan, 2=Mar
    months.push(buildMonthObj(m, startYear + 1, receiptDayType, customDay));
  }
  return months;
};

function buildMonthObj(jsMonth, year, receiptDayType = 'last', customDay) {
  const lastDay = new Date(year, jsMonth + 1, 0).getDate();
  let day = lastDay;

  if (receiptDayType === '1st') {
    day = 1;
  } else if (receiptDayType === '5th') {
    day = Math.min(5, lastDay);
  } else if (receiptDayType === '10th') {
    day = Math.min(10, lastDay);
  } else if (receiptDayType === 'custom' && customDay) {
    const cd = parseInt(customDay, 10);
    if (!isNaN(cd) && cd >= 1 && cd <= 31) {
      day = Math.min(cd, lastDay);
    }
  }

  return {
    month: jsMonth,
    year: year,
    label: MONTH_NAMES[jsMonth] + ' ' + year,
    shortLabel: MONTH_SHORT[jsMonth] + ' ' + year,
    startDate: new Date(year, jsMonth, 1),
    endDate: new Date(year, jsMonth, lastDay),
    receiptDate: new Date(year, jsMonth, day),
  };
}

/**
 * Get Assessment Year for a given Financial Year string.
 * E.g., '2026-27' -> '2027-28'
 * @param {string} fy
 * @returns {string}
 */
window.getAssessmentYear = function (fy) {
  if (!fy) return '';
  const parts = String(fy).split('-');
  const startYear = parseInt(parts[0], 10);
  if (isNaN(startYear)) return '';
  const ayStart = startYear + 1;
  const ayEnd = (ayStart + 1).toString().slice(-2);
  return ayStart + '-' + ayEnd;
};

/**
 * Get available financial years with Assessment Year mapping.
 * Automatically aligns with current Indian fiscal cycle.
 * @returns {Array<{value: string, label: string, ay: string}>}
 */
window.getAvailableFinancialYears = function () {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 3=Apr)
  const currentFYStart = currentMonth < 3 ? currentYear - 1 : currentYear;

  const years = [];
  for (let i = -1; i <= 1; i++) {
    const y = currentFYStart + i;
    const yEnd = (y + 1).toString().slice(-2);
    const ay = window.getAssessmentYear(y + '-' + yEnd);
    years.push({
      value: y + '-' + yEnd,
      label: 'FY ' + y + '-' + yEnd + ' (AY ' + ay + ') • Apr ' + y + ' – Mar ' + (y + 1),
      ay: 'AY ' + ay,
    });
  }
  return years;
};


// ── HRA Exemption Calculator (Year-Aware) ─────────────────────────────

/**
 * Calculate HRA exemption under the Old Tax Regime.
 * Dynamically applies:
 *   - FY 2026-27+: Income-tax Rules, 2026 (50% for 8 cities: Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad)
 *   - FY 2025-26-: Income-tax Rules, 1962 Rule 2A (50% for 4 statutory Metros: Mumbai, Delhi, Kolkata, Chennai)
 *
 * Exemption is the MINIMUM of the following three statutory values:
 *   1. Actual HRA received from employer
 *   2. 50% (Metro) or 40% (Non-Metro) of (Basic Salary + DA)
 *   3. Actual rent paid in excess of 10% of (Basic Salary + DA)
 *
 * Statutory Compliance checks:
 *   - Mandatory Landlord PAN if annual rent > ₹1,00,000 (CBDT Circular 8/2013)
 *   - Section 194-IB TDS: 2% TDS deduction if monthly rent > ₹50,000 (Finance Act 2024 w.e.f. Oct 1, 2024)
 *   - Exclusivity to Old Tax Regime (disallowed under default New Tax Regime Sec 115BAC)
 *
 * @param {number} basicSalary - Monthly Basic Salary
 * @param {number} da          - Monthly Dearness Allowance
 * @param {number} hraReceived - Monthly HRA received from employer
 * @param {number} monthlyRent - Monthly rent paid
 * @param {boolean} isMetro    - whether eligible for 50% rate
 * @param {string} [financialYear] - e.g. '2026-27'
 * @param {number} [numMonths=12]  - Number of tenancy months to calculate for (1-12)
 * @param {number} [totalActualRent] - Total aggregate rent paid over the period
 * @returns {Object}
 */
window.calculateHRA = function (basicSalary, da, hraReceived, monthlyRent, isMetro, financialYear, numMonths = 12, totalActualRent) {
  const framework = window.getTaxLawFramework(financialYear);
  const periodMonths = Math.max(1, Math.min(12, parseInt(numMonths, 10) || 12));
  const monthlyBasicDA = (parseFloat(basicSalary) || 0) + (parseFloat(da) || 0);

  const periodBasic = monthlyBasicDA * periodMonths;
  const periodHRA = (parseFloat(hraReceived) || 0) * periodMonths;
  const periodRent = totalActualRent !== undefined ? (parseFloat(totalActualRent) || 0) : ((parseFloat(monthlyRent) || 0) * periodMonths);

  // Condition 1: Actual HRA received for the period
  const rule1 = periodHRA;

  // Condition 2: 50% (Metro) or 40% (Non-Metro) of Basic Salary for the period
  const metroRate = isMetro ? 0.5 : 0.4;
  const rule2 = periodBasic * metroRate;

  // Condition 3: Rent paid minus 10% of Basic Salary for the period
  const rule3 = Math.max(0, periodRent - periodBasic * 0.1);

  // Exempt amount is least of the three
  const exemption = Math.min(rule1, rule2, rule3);

  // Taxable HRA component added to salary
  const taxableHRA = Math.max(0, periodHRA - exemption);

  // Mandatory Landlord PAN under CBDT Circular 8/2013 if rent > ₹1,00,000 (or annual equivalent > ₹1L)
  const needsPAN = periodRent > 100000 || ((periodRent / periodMonths) * 12 > 100000);

  // Section 194-IB: 2% TDS on rent if monthly rent > ₹50,000
  const rentPerMonth = parseFloat(monthlyRent) || (periodRent / periodMonths) || 0;
  const needsTDS194IB = rentPerMonth > 50000;
  const monthlyTds = needsTDS194IB ? Math.round(rentPerMonth * 0.02) : 0;
  const tds194IBAmount = needsTDS194IB ? Math.round(periodRent * 0.02) : 0;

  // Tax savings estimation under Old Tax Regime slabs (+ 4% Health & Education Cess)
  const taxSaved30 = Math.round(exemption * 0.312);
  const taxSaved20 = Math.round(exemption * 0.208);

  return {
    framework,
    isMetro: !!isMetro,
    metroRatePercent: isMetro ? 50 : 40,
    periodMonths,
    exemption: Math.round(exemption),
    taxableHRA: Math.round(taxableHRA),
    rule1: Math.round(rule1),
    rule2: Math.round(rule2),
    rule3: Math.round(rule3),
    actualHRA: Math.round(rule1),
    percentOfSalary: Math.round(rule2),
    rentMinus10: Math.round(rule3),
    annualRent: Math.round(periodRent),
    periodRent: Math.round(periodRent),
    annualBasic: Math.round(periodBasic),
    annualHRA: Math.round(periodHRA),
    needsPAN,
    needsTDS194IB,
    monthlyTds,
    tds194IBAmount,
    taxSaved30,
    taxSaved20,
  };
};


// ── Date Formatting ───────────────────────────────────────────────────

/**
 * Get ordinal suffix for a day number.
 * @param {number} day
 * @returns {string}
 */
window.getOrdinalSuffix = function (day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

/**
 * Format a Date object to "30th April 2025" style.
 * @param {Date} date
 * @returns {string}
 */
window.formatDate = function (date) {
  const day = date.getDate();
  const suffix = window.getOrdinalSuffix(day);
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return day + suffix + ' ' + month + ' ' + year;
};

/**
 * Format date as DD/MM/YYYY.
 * @param {Date} date
 * @returns {string}
 */
window.formatDateShort = function (date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return d + '/' + m + '/' + date.getFullYear();
};

/**
 * Generate a receipt number for a given month index.
 * @param {number} monthIndex - 0-11
 * @param {string} fy - financial year string
 * @returns {string}
 */
window.generateReceiptNumber = function (monthIndex, fy) {
  const num = (monthIndex + 1).toString().padStart(3, '0');
  const fyShort = fy.replace('-', '');
  return 'RR-' + fyShort + '-' + num;
};
