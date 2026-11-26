/* DemoShield Blur — Live Interactive Hero SaaS Dashboard Demo & Netlify Form Handler */
(function () {
  'use strict';

  const dashboard = document.getElementById('demoDashboard');
  const demoModeBlur = document.getElementById('demoModeBlur');
  const demoModeRedact = document.getElementById('demoModeRedact');
  const chipAutoAll = document.getElementById('chipAutoAll');
  const chipKeysEmails = document.getElementById('chipKeysEmails');
  const chipPicker = document.getElementById('chipPicker');
  const chipReset = document.getElementById('chipReset');
  const telMasked = document.getElementById('telMasked');
  const telMs = document.getElementById('telMs');
  const demoStatusText = document.getElementById('demoStatusText');

  const clickableItems = Array.from(document.querySelectorAll('[data-demo-click]'));
  const autoFields = Array.from(document.querySelectorAll('[data-auto-field]'));

  const PATTERNS = {
    apiKeys: /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|(?:ghp|gho)_[A-Za-z0-9]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16})\b/,
    emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/,
    currency: /(?:^|[\s(])[+-]?[$€£]\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,
    phonesCards: /(?:\b(?:\d{4}[\s-]){3}\d{4}\b|\+\d{1,3}\s?\(\d{3}\)\s?\d{3}-\d{4})/
  };

  let currentMode = 'blur'; // 'blur' | 'redact'
  let pickerActive = false;
  const maskedSet = new Set();

  function maskClass() {
    return currentMode === 'redact' ? 'ds-masked-redact' : 'ds-masked-blur';
  }

  function applyVisual(el, masked) {
    el.classList.remove('ds-masked-blur', 'ds-masked-redact');
    if (masked) {
      el.classList.add(maskClass());
      maskedSet.add(el);
    } else {
      maskedSet.delete(el);
    }
  }

  function refreshAllModes() {
    for (const el of maskedSet) {
      el.classList.remove('ds-masked-blur', 'ds-masked-redact');
      el.classList.add(maskClass());
    }
  }

  function updateTelemetry(ms, statusMsg) {
    telMasked.textContent = String(maskedSet.size);
    if (typeof ms === 'number') {
      telMs.textContent = `${ms.toFixed(1)}ms`;
    }
    if (statusMsg) {
      demoStatusText.textContent = statusMsg;
    } else if (maskedSet.size === 0) {
      demoStatusText.textContent = 'All fields visible';
    } else {
      demoStatusText.textContent = `${maskedSet.size} sensitive field${maskedSet.size === 1 ? '' : 's'} protected (${currentMode})`;
    }
  }

  function clearAll() {
    for (const el of Array.from(maskedSet)) {
      applyVisual(el, false);
    }
    chipAutoAll.classList.remove('active');
    chipKeysEmails.classList.remove('active');
    updateTelemetry(0.0, 'All fields visible');
  }

  function runDemoAutoMask(categories, label) {
    const t0 = performance.now();
    clearAll();
    let count = 0;
    for (const el of autoFields) {
      const txt = (el.textContent || '').trim();
      const matched = categories.some((cat) => PATTERNS[cat] && PATTERNS[cat].test(txt));
      if (matched) {
        applyVisual(el, true);
        count++;
      }
    }
    const elapsed = Math.max(0.2, performance.now() - t0);
    updateTelemetry(elapsed, `${label}: ${count} masked in ${elapsed.toFixed(1)}ms`);
  }

  demoModeBlur.addEventListener('click', () => {
    currentMode = 'blur';
    demoModeBlur.classList.add('active');
    demoModeRedact.classList.remove('active');
    refreshAllModes();
    updateTelemetry();
  });

  demoModeRedact.addEventListener('click', () => {
    currentMode = 'redact';
    demoModeRedact.classList.add('active');
    demoModeBlur.classList.remove('active');
    refreshAllModes();
    updateTelemetry();
  });

  chipAutoAll.addEventListener('click', () => {
    runDemoAutoMask(['apiKeys', 'emails', 'currency', 'phonesCards'], 'Auto-Mask All');
    chipAutoAll.classList.add('active');
    chipKeysEmails.classList.remove('active');
  });

  chipKeysEmails.addEventListener('click', () => {
    runDemoAutoMask(['apiKeys', 'emails'], 'Keys & Emails');
    chipKeysEmails.classList.add('active');
    chipAutoAll.classList.remove('active');
  });

  chipPicker.addEventListener('click', () => {
    pickerActive = !pickerActive;
    chipPicker.classList.toggle('active', pickerActive);
    dashboard.classList.toggle('picker-mode', pickerActive);
    chipPicker.textContent = pickerActive ? 'Click-to-Blur: ON (Click any item)' : 'Click-to-Blur Mode';
    updateTelemetry(undefined, pickerActive ? 'Click any card, row, or key to toggle mask' : undefined);
  });

  chipReset.addEventListener('click', () => {
    pickerActive = false;
    chipPicker.classList.remove('active');
    dashboard.classList.remove('picker-mode');
    chipPicker.textContent = 'Click-to-Blur Mode';
    clearAll();
  });

  clickableItems.forEach((item) => {
    item.addEventListener('click', () => {
      const t0 = performance.now();
      const isCurrentlyMasked = maskedSet.has(item);
      applyVisual(item, !isCurrentlyMasked);
      const elapsed = Math.max(0.1, performance.now() - t0);
      updateTelemetry(elapsed);
    });
  });

  // Contact & Pro license request handler (supports Netlify Forms when hosted on Netlify,
  // and clean pre-filled email fallback when hosted on GitHub Pages)
  const proForm = document.getElementById('proForm');
  const formStatus = document.getElementById('formStatus');
  const formSubmitBtn = document.getElementById('formSubmitBtn');

  if (proForm) {
    proForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(proForm);
      const email = String(fd.get('email') || '').trim();
      const interest = String(fd.get('interest') || 'pro-9-lifetime');
      const message = String(fd.get('message') || '').trim();

      const isNetlifyHost = /\.netlify\.app$/i.test(window.location.hostname);
      if (isNetlifyHost) {
        formSubmitBtn.disabled = true;
        formStatus.textContent = 'Submitting...';
        try {
          const data = new URLSearchParams(fd);
          const res = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: data.toString()
          });
          if (res.ok) {
            formStatus.textContent = 'Received! We will reply within 1 business day.';
            proForm.reset();
            return;
          }
        } catch (_) {
          // fall through to mailto fallback
        } finally {
          formSubmitBtn.disabled = false;
        }
      }

      const subjectMap = {
        'free-cws-notify': 'DemoShield Blur — Free v1.0.0 Chrome Web Store Launch Alert',
        'pro-9-lifetime': 'DemoShield Blur Pro — $9 Lifetime License Key Request',
        'team-29-pack': 'DemoShield Blur Team 5-Pack ($29) Request',
        'support-question': 'DemoShield Blur — Question / Feedback'
      };
      const subject = subjectMap[interest] || 'DemoShield Blur Inquiry';
      const bodyLines = [
        `Reply-To Email: ${email}`,
        `Interest: ${interest}`,
        message ? `Notes: ${message}` : '',
        '',
        'Sent from https://yefantao.github.io/demoshield-blur/'
      ].filter(Boolean);

      const mailtoHref = `mailto:yefan.tao@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
      formStatus.innerHTML = `Opening email draft to <strong>yefan.tao@gmail.com</strong> — or <a href="${mailtoHref}" style="color:#1D4ED8;text-decoration:underline;">click here to send</a>. We reply within 1 business day.`;
      window.location.href = mailtoHref;
    });
  }
})();
