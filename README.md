# ระบบตรวจสอบเสาไฟฟ้าพร้อม GPS Tracking
## EXP Streetlight Inspection PWA
**การทางพิเศษแห่งประเทศไทย — สายทางกาญจนาภิเษก**

---

## Directory Structure

```
streetlight-pwa/
├── index.html              ← Single-page PWA shell
├── manifest.json           ← PWA manifest
├── service-worker.js       ← Offline caching & background sync
├── vercel.json             ← Vercel deploy config
├── icons/
│   ├── icon-192.png        ← PWA icon (generate with any icon tool)
│   └── icon-512.png
├── src/
│   └── js/
│       ├── config.js       ← Constants, toll gate data, settings loader
│       ├── data.js         ← GAS API adapter, SW pole cache, Haversine proximity
│       ├── map.js          ← Leaflet init, GPS watch, SW markers (all "sw" prefixed), TTS
│       ├── form.js         ← Dropdown chains, signature canvas, form submit
│       ├── report.js       ← Inspection list render, PDF export (jsPDF)
│       └── app.js          ← Orchestrator, tab system, boot sequence
└── gas/
    └── Code.gs             ← Google Apps Script backend (deploy separately)
```

---

## 1. Google Apps Script (GAS) Backend — Deploy Steps

### A. Create the Spreadsheet
1. Go to [Google Sheets](https://sheets.google.com) → create a new sheet
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**1BxiMVs0XRA5n...**/edit`

### B. Create the Apps Script Project
1. In your Sheets: **Extensions → Apps Script**
2. Delete the default `function myFunction()` placeholder
3. Paste the entire contents of `gas/Code.gs`
4. Replace `'YOUR_GOOGLE_SHEETS_ID_HERE'` with your actual Spreadsheet ID

### C. Initialize the Sheets
1. In Apps Script editor, select function `setupSheets` from the dropdown
2. Click **▶ Run** — this creates both sheets with headers + sample SW data
3. Grant permissions when prompted

### D. Deploy as Web App
1. Click **Deploy → New deployment**
2. Click the gear ⚙️ next to "Type" → select **Web App**
3. Set:
   - **Description:** `EXP Inspect API v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone` *(for field technicians without Google account)*
     — or `Anyone with Google Account` for secured deployments
4. Click **Deploy** → copy the **Web App URL**
   (looks like: `https://script.google.com/macros/s/AKfyc...abc/exec`)

### E. Configure the PWA
Paste the GAS URL into the app's **Settings tab → Google Apps Script URL**.
It is saved to localStorage and persists across sessions.

> **Important:** Every time you edit `Code.gs`, you must create a **new deployment**
> (not just re-deploy the existing one) to get an updated URL with your changes.

---

## 2. SW_Poles Sheet — Column Format

| id | name | tollgate | lat | lng | km | status | lastChecked |
|---|---|---|---|---|---|---|---|
| SW-KAE-001 | เสาไฟ SW-KAE-001 | TG-KAE-01 | 13.8621 | 100.4102 | กม. 0+050 | normal | 2025-06-01 |

**Status values:** `normal` · `warning` · `danger` · `pending`

---

## 3. Inspections Sheet — Column Format

| id | swId | tollgateId | status | bulb | pole | notes | inspector | lat | lng | signature | timestamp | syncStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

---

## 4. Frontend — Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# From project root
cd streetlight-pwa
vercel

# Follow prompts — it auto-detects as a static site.
# On subsequent deploys:
vercel --prod
```

Or connect your GitHub repo to Vercel Dashboard for automatic deployments on push.

---

## 5. PWA Icons — Quick Setup

Generate icons from a logo using https://realfavicongenerator.net or:

```bash
# Using ImageMagick (if installed)
magick convert your-logo.png -resize 192x192 icons/icon-192.png
magick convert your-logo.png -resize 512x512 icons/icon-512.png
```

---

## 6. Key Architecture Decisions

| Decision | Rationale |
|---|---|
| **Vanilla JS modules** | No build step needed — deploy static files directly |
| **`sw` prefix for all pole variables** | Strict naming convention (NOT `sp`) — all marker logic uses `swMarkers`, `swLayer`, `swIconFor()`, `nearestSw`, etc. |
| **Cache-first SW, Network-first GAS** | Poles & tiles work offline; data writes retry automatically |
| **text/plain POST to GAS** | Avoids CORS preflight — GAS does not support OPTIONS pre-flight for JSON content-type |
| **Haversine in `data.js`** | No mapping library dependency for proximity math |
| **TTS lock (8s cooldown)** | Prevents repeated announcements when driving slowly past a pole |

---

## 7. TTS Voice Alert Logic Summary

```
GPS position updated
  → findNearestSw(lat, lng)  [Haversine]
  → if distanceM ≤ CONFIG.ALERT_DISTANCE_M (default 50m)
      AND CONFIG.TTS_ENABLED
      AND NOT ttsLock
    → SpeechSynthesisUtterance: "เสาไฟ หมายเลข XXX สถานะ ปกติ"
    → lang: th-TH (falls back to en-US if Thai voice unavailable)
    → ttsLock = true for 8 seconds
```

Adjust the alert distance in **Settings → ระยะแจ้งเตือน**.

---

## 8. Offline-First Data Flow

```
Submit Form
  ├─ Save to localStorage (always, immediately)
  ├─ POST to GAS
  │   ├─ Success → syncStatus: 'ok'
  │   └─ Fail    → syncStatus: 'pending' (queued for Background Sync)
  └─ Update SW marker color on map
```

---

*Built for highway inspection teams operating at speed. All pole markers and related
variables use the `sw` prefix throughout the codebase.*
