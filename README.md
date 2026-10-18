# HRAPack — Automated Monthly Rent Receipt & HRA Compliance Kit

[![Live App](https://img.shields.io/badge/Live%20App-hrapack.netlify.app-2563eb?style=for-the-badge&logo=netlify)](https://hrapack.netlify.app/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-10b981?style=for-the-badge)](https://hrapack.netlify.app/)
[![License](https://img.shields.io/badge/Cost-100%25%20Free-f59e0b?style=for-the-badge)](https://hrapack.netlify.app/)

**HRAPack** is a production-ready, privacy-first, zero-spam tax compliance micro-SaaS web application designed for salaried Indian employees claiming House Rent Allowance (HRA) tax exemptions under Section 10(13A) of the Income Tax Act.

Unlike traditional portals that collect phone numbers to spam users with telemarketing loan calls, **HRAPack is 100% client-side**. All document generation and calculations happen exclusively inside your browser. No server storage. No tracking. No phone numbers required.

---

## 🌟 Key Features

### 1. Complete HRA Compliance Suite (100% Free)
- **12 Sequential Monthly Rent Receipts**:
  - Sequential receipt numbering (`RR-YYYYYY-001` through `012`).
  - Correct calendar dates for each month (e.g., 30th April, 31st May).
  - Monthly rent amount in figures and auto-converted Indian English words (`Rupees Twenty-Eight Thousand Only`).
  - Designated revenue stamp placeholder with stamp acknowledgement box.
  - Digital signature preview (custom cursive font signature or uploaded signature image).
  - Tenant name, Landlord name, full property address, and payment method.
  - Landlord PAN inclusion with conditional formatting.
- **Statutory Tax Framework (Dual FY Support)**:
  - **FY 2026-27+ (Income-tax Rules, 2026)**: Auto-generates **Form No. 124** (Sec 392(5)(b) / Rule 205), mandates landlord relationship disclosure, and classifies **8 Metros at 50% rate** (Delhi-NCR, Mumbai-MMR, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad).
  - **FY 2025-26 & Prior (Income-tax Act, 1961)**: Form No. 12BB (Rule 26C) with 4 statutory Metros.
- **Tenancy Period & Month Selection**:
  - Full FY (12 Months, Apr–Mar).
  - Corporate HR Submission Window (9 Months, Apr–Dec for January proofs submission).
  - Year-End Reconciliation (3 Months, Jan–Mar) or Custom month ranges.
- **Mid-Year Rent Hike & Address Changes**:
  - Supports mid-tenancy rent revisions with custom starting month and separate rent amounts.
- **HTML5 Canvas Digital Signature Pad**:
  - Draw real landlord signatures via touch or mouse with smoothing, typed cursive signatures, or image uploads.
- **Upfront Tax Regime Checker**:
  - Clear guidance on Old Tax Regime eligibility vs default New Tax Regime (Section 115BAC) disallowance.
- **Section 194-IB TDS Compliance Engine**:
  - Displays monthly TDS (2%), total annual TDS, Form 26QC deposit deadline (within 30 days / April 30th), and Form 16C certificate rules.
- **Post-Download HR Submission Checklist**:
  - Interactive submission checklist ensuring all statutory attachments (receipts, Form 124/12BB, PAN copy / Declaration, TDS challan) are ready.
- **Offline PWA & Local Storage**:
  - Service Worker (`sw.js`) provides 100% offline functionality. All inputs persist in local storage with zero server tracking.

---

## 🚀 Programmatic SEO & Resource Architecture

HRAPack includes high-intent programmatic landing pages targeting the top search queries for Indian taxpayers:

| Page | Target Keyword | Statutory Basis |
| :--- | :--- | :--- |
| [`index.html`](https://hrapack.netlify.app/) | HRA rent receipt generator online | Section 10(13A), Rule 2A |
| [`form-12bb.html`](https://hrapack.netlify.app/form-12bb.html) | form 12bb download, form 12bb hra section | Rule 26C, Section 192 |
| [`landlord-declaration.html`](https://hrapack.netlify.app/landlord-declaration.html) | landlord declaration for hra without pan format | CBDT Circular 8/2013, Sec 206AA |
| [`revenue-stamp-rules.html`](https://hrapack.netlify.app/revenue-stamp-rules.html) | revenue stamp on rent receipt rules & limits | Indian Stamp Act 1899, Item 53 |

All pages feature:
- Canonical domain: `https://hrapack.netlify.app/`
- Validated Schema.org structured data (`WebApplication`, `FAQPage`, `HowTo`, `BreadcrumbList`)
- Dynamic Open Graph and Twitter Card tags (`1200x630` banner)
- Comprehensive 4-column directory footer

---

## 🛠️ Pure Client-Side Architecture

HRAPack runs entirely on client-side web standards with zero backend dependencies:
- **Core Technologies**: HTML5, Modern Vanilla JavaScript (ES6+), CSS3.
- **Styling**: Tailwind CSS + Custom stylesheet (`css/styles.css`).
- **Icons**: Lucide Icons (`lucide.dev`).
- **PDF Engine**: `pdf-lib` (client-side PDF document construction, zero server storage).
- **Compression & Bundle**: `jszip` + `FileSaver.js` (bundles all 12 receipts, Form 12BB, Declaration, and Summary into `HRAPack_YYYY-YY.zip`).
- **Typography**: Inter (UI font) + Dancing Script (cursive digital signatures) via Google Fonts.

---

## 📁 File Structure

```
├── index.html                  # Main single-page application & receipt builder
├── form-12bb.html              # Dedicated Form 12BB landing page & guide
├── landlord-declaration.html   # Dedicated Landlord Declaration (No PAN) page & guide
├── revenue-stamp-rules.html    # Dedicated Revenue Stamp rules guide
├── sitemap.xml                 # XML sitemap with 4 canonical URLs
├── robots.txt                  # Search engine crawl rules & sitemap pointer
├── manifest.json               # Progressive Web App manifest
├── netlify.toml                # Netlify edge headers, caching & security rules
├── assets/
│   ├── favicon.svg             # Branded SVG favicon
│   └── og-image.svg            # High-resolution social share banner (1200x630)
├── css/
│   └── styles.css              # Custom styling, dark mode, print rules, previews
├── js/
│   ├── utils.js                # Indian number-to-words, PAN validation, HRA calculator
│   ├── pdf-engine.js           # Pure client-side PDF builder (pdf-lib)
│   └── app.js                  # State management, local storage, event handlers
└── vendor/
    ├── lucide.min.js           # Bundled icons
    ├── pdf-lib.min.js          # Bundled PDF creation library
    ├── jszip.min.js            # Bundled ZIP compression
    └── FileSaver.min.js        # Bundled client-side file saver
```

---

## 💻 Running the App Locally

Because HRAPack is 100% client-side, you can run it immediately without installing any server runtime:

```bash
# Option 1: Open directly
open index.html

# Option 2: Run a quick local static server
npx serve .
# or
python3 -m http.server 8080
```
