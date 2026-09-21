# Kerb 🚗💷

**A private, offline-first money & tax tracker for UK self-employed delivery drivers** (Amazon Flex, Uber Eats, Deliveroo, Just Eat…).

Kerb works out — to the penny — your income, expenses, allowable deductions, tax, National Insurance, what to keep and what's safe to spend, and it can **read your receipts with Claude** just by taking a photo. Everything stays on your device.

> **بالعربي:** تطبيق ذكي وخاص لسائقي التوصيل في بريطانيا يعملون لحسابهم الخاص. يحسب لك بالبنس: مدخولك، مصاريفك، الضرائب والتأمين الوطني، صافي أرباحك، كم تحتفظ للضريبة وكم يمكنك أن تصرف — ويقرأ فواتيرك تلقائياً عبر كلود بمجرد تصويرها. كل بياناتك تبقى على جهازك فقط.

---

## ✨ Features

- **Dashboard** — estimated take-home for the tax year, tax to set aside, "safe to spend", last-7-days performance, income mix and recent activity, with employment (PAYE) kept clearly separate from self-employment.
- **Scan or upload anything** — Claude reads it for you (uses **your own** Anthropic API key):
  - **Receipts** → amount, date, vendor, category, VAT and every itemised line.
  - **Earnings statements** (Amazon Flex, Uber Eats…) → every shift, from a photo or PDF.
  - **Bank / card statements** → every transaction, auto-sorted into delivery income vs. business expenses for you to confirm.
  - **Payslips** → your PAYE salary, tax and NI, from a photo or PDF.
- **Organised Add menu** — one **+** button grouped into *Scan or upload*, *Add manually* and *Track & ask* so every way to add money is one tap away.
- **Tax engine (2026/27)** — Income Tax, Class 4 & Class 2 NIC, the £1,000 trading allowance, personal-allowance interaction with a **PAYE job**, and **Payments on Account** — all computed the way Self Assessment does it.
- **Mileage or actual costs** — simplified per-mile relief (car 55p/25p, motorcycle 24p, bicycle 20p) with the vehicle-cost rule handled correctly, or actual costs.
- **Shift mileage that survives closing the app** — clock in with your odometer reading and enter the end reading when you finish (miles = end − start); no need to keep the app open. Live GPS is offered too, but as a web app it only tracks while Kerb is open, so the odometer is the recommended, accurate method.
- **Pots** — a weekly plan (how much to keep for tax / vehicle / savings vs. spend) and saved-so-far trackers.
- **Insights** — £/hour, £/mile, £/drop, **net £/hour after tax**, best weekday, platform comparison and a full-year projection.
- **Expense-method advisor** — compares simplified **mileage** vs **actual vehicle costs**, tells you which leaves a lower tax bill and by how much per year, and switches method in one tap.
- **Duplicate protection on import** — bank, earnings-statement and CSV imports flag rows that match entries you already have (by date & amount) so the same money is never counted twice.
- **Deadlines** — countdowns to HMRC registration (5 Oct), filing & payment (31 Jan) and the 2nd payment on account (31 Jul).
- **Private & offline** — a PWA you install on your phone; all data lives in your browser (IndexedDB). Export/import a JSON backup and CSVs for your accountant.
- **App lock (PIN)** — optional 4-digit PIN with auto-lock in the background. The PIN is stored only as a salted SHA-256 hash, and is never included in a backup.
- **Editable tax rates** — every rate/threshold is stored per tax year and editable, so Kerb stays correct as HMRC figures change.

## 📱 Install on your phone

Kerb is a Progressive Web App — no app store needed.

1. Host the folder over HTTPS (see **Deploy** below) and open it in your phone's browser.
2. **iPhone (Safari):** Share → *Add to Home Screen*.
   **Android (Chrome):** menu → *Install app* / *Add to Home screen*.
3. It opens like a normal app, works offline, and keeps its own private storage.

> The camera, install and offline features need HTTPS (or `localhost`). Opening `index.html` directly from disk won't work — serve it.

## 🤖 Turn on scanning (Claude)

1. Create an API key at **console.anthropic.com → API keys** and add a small amount of credit.
2. In Kerb: **Settings → Receipt scanning** → paste the key → *Save key* → *Test*.
3. Now the **+** menu's *Scan or upload* group can read receipts, earnings statements, **bank statements** and payslips — from a photo or a PDF — and fill everything in.

Your key is stored **only on your device**, is sent **only to Anthropic** (never to any Kerb server — there isn't one), and is **never** included in a backup file. Each scan costs a fraction of a penny.

## 🚀 Deploy (free options)

Any static host works. Two easy ones:

- **GitHub Pages:** push this repo → *Settings → Pages* → deploy from the branch, root. Your app is live at `https://<user>.github.io/<repo>/`.
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the folder or connect the repo. No build step, no configuration.

There is **no build step** — it's plain HTML/CSS/JS.

## 🧑‍💻 Local development

```bash
npm run serve      # static dev server at http://localhost:8080
npm run test       # tax-engine correctness checks
npm run icons      # regenerate app icons
```

Requires only Node.js (used for the dev server and tooling; the app itself has zero runtime dependencies).

## 🗂️ Project structure

```
index.html              app shell
manifest.webmanifest    PWA manifest
service-worker.js       offline caching
css/styles.css          light + dark theme
js/
  app.js                boot, router, navigation, theme
  store.js              settings + UK tax rate tables (editable)
  tax.js                the calculation engine
  db.js                 IndexedDB (local storage of entries)
  claude.js             Anthropic extraction (receipts, earnings, bank, payslips)
  charts.js             dependency-free SVG charts
  util.js               formatting, dates, UK tax-year math
  ui/                   screens: dashboard, income, expenses, tax, pots,
                        insights, settings, onboarding, forms, shared,
                        scan-earnings, bank-import, payslips, assistant
icons/                  app icon (scalable SVG)
scripts/                dev tooling (server, tests, optional PNG icon generator)
```

## ⚠️ Disclaimer

Kerb gives **estimates to help you budget and stay organised**. It is not tax advice. Always confirm the final figures on your HMRC Self Assessment or with an accountant. Tax rates are seeded for **2026/27 (England/Wales/Northern Ireland)** and are editable in Settings; Scottish bands and student-loan thresholds are provided as defaults to verify per year.

## 🔒 Privacy

- All entries stay in your browser's local database on your device.
- Backups you export are plain files you control; they never include your API key or your PIN.
- An optional **PIN lock** gates access to the app (stored as a salted SHA-256 hash). It keeps casual snoopers out; it is not full encryption of the data at rest, so keep your phone's own screen lock on too.
- The only network call the app makes is your optional scan, straight to Anthropic with your key.

## License

MIT
