# DemoShield Blur (`blur_demo`) — Zero-Host-Permission Screen-Share & Demo Privacy Chrome Extension — Kickoff Spec

> **Verified Market Proof (`radar.db` + Live Check `2026-11-26`)**:
> - **BlurWeb (`blurweb.app`)** (Stripe-verified): **`$34,046` cumulative revenue** (`$504/mo` ongoing) — charges **`$67+` upfront with NO free tier/trial** and requires 100% manual clicking.
> - **New entrants (`DataBlur`, `Safe Screen Share`)** validate strong active demand for a modern alternative with a free tier + automated PII/API-key masking.
> - **Our Wedge (Reusing our `CleanSave Image` Zero-Host-Permission MV3 Playbook)**:
>   - **Auditable Zero-Host-Permission Privacy (`activeTab` + `storage` only — ZERO `<all_urls>` or permanent background spy permissions!)** — open-source extension code on GitHub so security-conscious engineers & founders can inspect every line!
>   - **Free Manual Click-to-Blur + Pro `$9` One-Time Unlock** (7x cheaper than BlurWeb's `$67`!) for **1-Click Auto-Redact PII & Secrets** (Emails, API Keys `sk-*`/`ghp_*`/`AKIA*`, Phone Numbers, Credit Cards, `$` Revenue Figures on Stripe/Analytics dashboards!) + **URL-Pattern Rule Persistence** + **Clean Redact Mode** (solid pill / fake placeholder text instead of ugly blurry smear).
> - **⚠️ Chrome Web Store Submission Cadence Rule**: Build, test, and package the entire extension + landing page NOW, **but WAIT to upload to Chrome Web Store until `CleanSave Image` passes initial review** (avoid triggering Google's new-developer rapid-submission hold!).

---

## Architecture (Zero-Build MV3 Extension + Static Netlify Landing Page)

```text
C:\Users\yefan\.gemini\antigravity\blur_demo\
├── extension/
│   ├── manifest.json          # MV3, ONLY "activeTab", "storage", "scripting", "contextMenus" — ZERO host_permissions!
│   ├── background.js          # Keyboard shortcut (Alt+Shift+B) & toolbar click injector via chrome.scripting
│   ├── content.js             # Lightweight Shadow-DOM floating HUD + click-to-blur inspector + regex auto-secret detector
│   ├── popup.html / popup.js  # Quick toggles: Click-to-Blur Mode, Auto-Mask Secrets/Emails/Money, Blur vs Solid Redact, Clear All
│   ├── rules.js               # Pure regex/DOM detectors (Emails, API keys, Stripe/AWS/GitHub tokens, Currency amounts, Phone/SSN)
│   └── icons/                 # Crisp 16/32/48/128 icons
├── landing/
│   ├── index.html             # SoldComps-style landing page with LIVE interactive in-page fake Stripe/SaaS dashboard demo where visitors can test Click-to-Blur & Auto-Mask Secrets right in the Hero!
│   ├── style.css
│   ├── app.js
│   ├── __forms.html           # Pro $9 waitlist / license checkout hook
│   └── netlify.toml
├── tests/                     # Unit tests for regex secret/PII detectors + CSS selector generator + MV3 manifest permission audit test
└── store-assets/              # 1280x800 Chrome Web Store screenshots + promo tile + privacy policy page
```

---

## Core Functional Requirements

1. **Strict Zero-Host-Permission MV3 Security Guarantee**:
   - `manifest.json` MUST contain **NO** `host_permissions`, **NO** `<all_urls>`, **NO** `webRequest`, **NO** `tabs` (only `activeTab`, `scripting`, `storage`, `contextMenus`).
   - Add an automated test (`tests/manifest.test.mjs`) that FAILS if any disallowed permission ever creeps into `manifest.json`!
2. **Core In-Page Privacy Engine (`content.js` + Shadow DOM HUD)**:
   - **Click-to-Blur / Click-to-Redact**: Hover highlights exact DOM element cleanly (like DevTools inspector); click toggles blur (`filter: blur(8px)`) or clean Solid Redact pill (`••••••`). Right-click or `Esc` exits picker mode cleanly.
   - **1-Click Smart Auto-Mask (Pure Local Regex — Zero Cloud AI!)**:
     - `Emails` (`user@domain.com`)
     - `API Keys & Secrets` (`sk-...`, `pk_live_...`, `ghp_...`, `AKIA...`, `AIza...`, Bearer tokens)
     - `Revenue / Currency` (`$12,345.67`, `€...`, `£...` — huge for indie hackers recording Stripe/Analytics demos!)
     - `Phones / Cards`
   - **Rule Persistence per Origin (Opt-in when user activates extension on that tab)**: Saves stable CSS selectors + auto-mask toggles in `chrome.storage.local` so clicking the extension icon (or `Alt+Shift+B`) re-applies saved blurs in `<10ms` with zero manual re-clicking.
   - **Never mutates underlying page state destructively**: Cleanly restorable with 1 click (`Unblur All`) without breaking React/Vue SPA bindings!
3. **Interactive Zero-Install Landing Page Demo (`landing/index.html`)**:
   - Follow `C:\Users\yefan\.gemini\antigravity\shopify\DESIGN_PLAYBOOK_SOLDCOMPS.md`.
   - Embed a realistic **Interactive Fake SaaS Revenue & API Keys Dashboard** right in the Hero so visitors can click `"Auto-Mask Secrets & Revenue"` or click any card to blur it LIVE on the landing page before installing!
4. **Honest Pricing**:
   - **Free Forever**: Unlimited Click-to-Blur, Solid Redact mode, Keyboard shortcut, 100% local & open source.
   - **Pro (`$9` One-Time)**: 1-Click Auto-Mask (API Keys / Emails / Revenue `$`), Saved Per-Site Blur Profiles, Custom Blur Intensity & Solid Mask Label.
5. **Deliverables & Readiness**:
   - Package clean `dist/demoshield-blur-v1.0.0.zip` ready for Chrome Web Store upload, deploy `landing/` to Netlify, and **STOP before uploading to Chrome Web Store** (mark ready in `README.md` to upload immediately once `CleanSave Image` is approved).
