# Kerb 🚗💷

**A private, offline-first money & tax tracker for UK self-employed delivery drivers** (Amazon Flex, Uber Eats, Deliveroo, Just Eat…).

Kerb works out — to the penny — your income, expenses, allowable deductions, tax, National Insurance, what to keep and what's safe to spend, and it can **read your receipts with Claude** just by taking a photo. Everything stays on your device.

> **بالعربي:** تطبيق ذكي وخاص لسائقي التوصيل في بريطانيا يعملون لحسابهم الخاص. يحسب لك بالبنس: مدخولك، مصاريفك، الضرائب والتأمين الوطني، صافي أرباحك، كم تحتفظ للضريبة وكم يمكنك أن تصرف — ويقرأ فواتيرك تلقائياً عبر كلود بمجرد تصويرها. كل بياناتك تبقى على جهازك فقط.

---

## ✨ Features

- **Dashboard** — estimated take-home for the tax year, tax to set aside, "safe to spend", last-7-days performance, income mix and recent activity.
- **Smart receipt scanning** — photograph a receipt and Claude extracts the amount, date, vendor, category and VAT, ready to save. (Uses **your own** Anthropic API key.)
- **Tax engine (2026/27)** — Income Tax, Class 4 & Class 2 NIC, the £1,000 trading allowance, personal-allowance interaction with a **PAYE job**, and **Payments on Account** — all computed the way Self Assessment does it.
- **Mileage or actual costs** — simplified per-mile relief (car 55p/25p, motorcycle 24p, bicycle 20p) with the vehicle-cost rule handled correctly, or actual costs.
- **Pots** — a weekly plan (how much to keep for tax / vehicle / savings vs. spend) and saved-so-far trackers.
- **Insights** — £/hour, £/mile, £/drop, **net £/hour after tax**, best weekday, platform comparison and a full-year projection.
- **Deadlines** — countdowns to HMRC registration (5 Oct), filing & payment (31 Jan) and the 2nd payment on account (31 Jul).
- **Private & offline** — a PWA you install on your phone; all data lives in your browser (IndexedDB). Export/import a JSON backup and CSVs for your accountant.
- **Editable tax rates** — every rate/threshold is stored per tax year and editable, so Kerb stays correct as HMRC figures change.

## 📱 Install on your phone

Kerb is a Progressive Web App — no app store needed.

1. Host the folder over HTTPS (see **Deploy** below) and open it in your phone's browser.
2. **iPhone (Safari):** Share → *Add to Home Screen*.
   **Android (Chrome):** menu → *Install app* / *Add to Home screen*.
3. It opens like a normal app, works offline, and keeps its own private storage.

> The camera, install and offline features need HTTPS (or `localhost`). Opening `index.html` directly from disk won't work — serve it.

## 🤖 Turn on receipt scanning (Claude)

1. Create an API key at **console.anthropic.com → API keys** and add a small amount of credit.
2. In Kerb: **Settings → Receipt scanning** → paste the key → *Save key* → *Test*.
3. Now **Add → Scan a receipt**: take a photo and Claude fills in the expense.

Your key is stored **only on your device** and is sent **only to Anthropic** (never to any Kerb server — there isn't one). A scan costs a fraction of a penny.

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
  claude.js             Anthropic receipt extraction
  charts.js             dependency-free SVG charts
  util.js               formatting, dates, UK tax-year math
  ui/                   screens: dashboard, income, expenses, tax, pots,
                        insights, settings, onboarding, forms, shared
icons/                  app icon (scalable SVG)
scripts/                dev tooling (server, tests, optional PNG icon generator)
```

## ⚠️ Disclaimer

Kerb gives **estimates to help you budget and stay organised**. It is not tax advice. Always confirm the final figures on your HMRC Self Assessment or with an accountant. Tax rates are seeded for **2026/27 (England/Wales/Northern Ireland)** and are editable in Settings; Scottish bands and student-loan thresholds are provided as defaults to verify per year.

## 🔒 Privacy

- All entries stay in your browser's local database on your device.
- Backups you export are plain files you control; they never include your API key.
- The only network call the app makes is your optional receipt scan, straight to Anthropic with your key.

## License

MIT
