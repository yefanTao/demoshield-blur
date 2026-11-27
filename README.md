# DemoShield Blur (`blur_demo`) — Zero-Host-Permission Screen-Share & Demo Privacy Chrome MV3 Extension

> **STATUS: READY FOR CHROME WEB STORE UPLOAD — HOLDING PER SUBMISSION CADENCE RULE**
> Packaged & verified at `dist/demoshield-blur-v1.0.0.zip`. **Do NOT upload to Chrome Web Store until sister extension `CleanSave Image` passes initial CWS review.** Once `CleanSave Image` is approved, upload `dist/demoshield-blur-v1.0.0.zip` + `store-assets/` immediately.

Mask **Stripe revenue, API keys (`sk_live_*`, `sk-proj-*`, `ghp_*`, `AKIA*`, `AIza*`, Bearer JWTs), customer emails, phone numbers, and Luhn-validated payment cards** before Zoom, Loom, or livestreams — with **ZERO broad host permissions** (`<all_urls>` is NEVER requested).

---

## Live Landing Page & Chrome Web Store URLs

- **Homepage / Live Interactive Demo**: https://yefantao.github.io/demoshield-blur/
- **Privacy Policy URL (for CWS Dashboard)**: https://yefantao.github.io/demoshield-blur/privacy-policy.html (also anchored at https://yefantao.github.io/demoshield-blur/#privacy)
- **Instant Post-Payment Key Delivery**: https://yefantao.github.io/demoshield-blur/success.html
- **Stripe Pro Checkout ($9 One-Time)**: https://buy.stripe.com/9B6fZjgJmaAh49AaAL1sQ02
- **Stripe Team 5-Pack Checkout ($29 One-Time)**: https://buy.stripe.com/dRm6oJ78MdMt35wgZ91sQ03
- **BlurWeb Alternatives SEO Page**: https://yefantao.github.io/demoshield-blur/alternatives.html
- **Open-Source Repository**: https://github.com/yefanTao/demoshield-blur
- **Ready-to-Upload Archive**: `dist/demoshield-blur-v1.0.0.zip` (HOLD until `CleanSave Image` passes initial CWS review)

---

## Permission Audit (`extension/manifest.json`)

DemoShield Blur requests **ONLY** these 4 minimal Manifest V3 permissions:

```json
"permissions": [
  "activeTab",
  "storage",
  "scripting",
  "contextMenus"
]
```

**Explicitly FORBIDDEN and enforced by `tests/manifest.test.mjs`:**
- Zero `host_permissions` (`<all_urls>`, `http://*/*`, `https://*/*`)
- Zero `optional_host_permissions` or persistent `content_scripts`
- Zero `tabs`, `cookies`, `webRequest`, `history`, or `bookmarks`
- Zero `fetch()`, `XMLHttpRequest`, `WebSocket`, analytics, or cloud AI endpoints

---

## Features

### Free Forever (No Account, Open Source)
- **Click-to-Blur & Click-to-Redact Inspector**: DevTools-style Cobalt Blue hover highlight; click any element to toggle blur (`8px`) or clean Solid Redact pill (`••••••`). Right-click or press `Esc` to exit picker mode.
- **Shadow-DOM Floating HUD**: Draggable, style-isolated HUD toggled via toolbar icon, right-click menu, or `Alt+Shift+B`.
- **Non-Destructive SPA-Safe Masking**: Uses CSS attributes on elements/inputs so React/Vue state and `.value` are never corrupted; 1-click **Unblur All** restores the DOM cleanly.

### DemoShield Pro (`$9` One-Time Lifetime — 7× Cheaper Than BlurWeb's `$67`)
- **1-Click Local Regex Auto-Mask**: Detects API Keys & Secrets, Emails, Revenue/Currency (`$`, `€`, `£`, `USD`), Phones, SSNs, and Luhn-valid payment cards in `<2ms` with 0 bytes uploaded.
- **Per-Origin Saved Blur Profiles**: Save stable CSS selectors + auto-mask toggles in `chrome.storage.local` and re-apply in `<10ms` when activating DemoShield on that origin.
- **Custom Blur Strength (`4–20px`) & Solid Redact Labels** (`••••••`, `REDACTED`, custom text).
- **100% Offline License Verification** (`DSPRO-XXXX-XXXX-XXXX`) in `extension/rules.js`.

---

## Project Structure

```text
blur_demo/
├── extension/
│   ├── manifest.json       # Strict 4-permission MV3 manifest (zero host_permissions)
│   ├── background.js       # Service worker: Alt+Shift+B hotkey, context menus & activeTab scripting injector
│   ├── content.js          # Shadow-DOM floating HUD, click-to-blur inspector, local regex auto-mask & origin replay
│   ├── rules.js            # Pure regex/Luhn detectors, stable CSS selector builder & offline Pro key verifier
│   ├── popup.html/.css/.js # Popup controller (picker, Blur vs Solid Redact, Auto-Mask, per-site rules, Pro key)
│   └── icons/              # 16 / 32 / 48 / 128 px vector-rendered PNG icons
├── landing/                # SoldComps-style static site with live interactive AcmePay SaaS dashboard demo
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── __forms.html        # Netlify Forms declaration for Pro $9 waitlist / license inquiries
│   └── netlify.toml
├── tests/
│   ├── manifest.test.mjs   # Automated MV3 zero-host-permission & zero-telemetry audit
│   ├── rules.test.mjs      # Automated regex, Luhn, CSS selector & offline Pro key tests
│   ├── e2e-chrome.html     # Real-Chrome headless Shadow-DOM, Auto-Mask & per-origin replay E2E harness
│   └── verify.ps1          # One-command full test + Chrome E2E + ZIP packaging runner
├── store-assets/           # 1280×800 screenshots (×4), 440×280 & 1400×560 promo tiles, 128×128 icon, privacy-policy.html
└── dist/
    └── demoshield-blur-v1.0.0.zip  # Chrome Web Store upload archive (HOLD until CleanSave Image passes review)
```

---

## Local Verification & Packaging

```powershell
# Run Node manifest security audit & rules unit tests
node --test tests/manifest.test.mjs tests/rules.test.mjs

# Run full suite (Node tests + icon check + real-Chrome headless E2E + ZIP build)
powershell -ExecutionPolicy Bypass -File .\tests\verify.ps1
```

## Chrome Web Store Listing Copy (Ready to Paste After CleanSave Approval)
- **Title**: `DemoShield Blur — Screen-Share & Demo Privacy · Open Source`
- **Summary (≤ 132 chars)**: `Zero host permissions, zero tracking. Click-to-blur, solid redact, and local regex auto-mask for API keys, emails & revenue.`
- **Category**: Productivity
- **Permission Justifications**:
  - `activeTab`: Grants temporary access strictly to the current tab only when the user clicks the toolbar icon, presses `Alt+Shift+B`, or chooses a right-click menu action.
  - `scripting`: Injects `rules.js` and `content.js` on demand into the active tab without requesting `<all_urls>`.
  - `storage`: Stores user preferences (blur intensity, solid redact label, offline Pro unlock) and opt-in per-origin CSS selector profiles locally in `chrome.storage.local`.
  - `contextMenus`: Adds the `DemoShield Blur` right-click menu shortcuts (`Click-to-Blur Element`, `Auto-Mask Secrets`, `Toggle HUD`, `Unblur All`).
