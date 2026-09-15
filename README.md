# Paper Shelf (v2 — Offline + NFC)

Evan’s personal research PDF library. Dark doomscroll PWA. No login.

## Open locally (dev)

```bash
cd evan-paper-shelf
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/` — fine for testing. **Not** the NFC URL (LAN/localhost fail at work).

## Public HTTPS (NFC record)

See `NFC.md` for the live URL once deployed (GitHub Pages / Netlify / Cloudflare Pages). That HTTPS home URL is what you write to the tag.

## Offline

Service worker cache: `paper-shelf-v2`.

Precaches: shell (`index.html`, css, js, manifest, icons, catalog) + **all** `papers/*.pdf` seeds + vendored `vendor/pdfjs/*`.

Home chip: **Ready** / **Caching…** / **Needs Wi‑Fi once**.

After one online visit + Add to Home Screen, airplane mode still opens Growth + VENOM.

User-added PDFs stay IndexedDB-only on that device.

## Install & NFC

Home → **Install & NFC** sheet (not a fourth screen). Short steps also in `NFC.md`.

## Screens (unchanged)

1. Home — subject grid + search + Add PDF + offline chip  
2. Subject — paper list  
3. Reader — vertical pdf.js page strip  

## Paste this to Beta Tester (after HTTPS URL exists)

Beta test this website folder /workspace/artifacts/evan-paper-shelf  
(or the live HTTPS URL)

Must-pass checks  
1. Public HTTPS opens; NFC URL is that HTTPS; Install sheet from Home.  
2. After one online visit, airplane mode: Growth + VENOM scroll.  
3. v1 UX intact; Add PDF online survives refresh; offline chip correct; no login.
