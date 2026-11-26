/* DemoShield Blur — Popup Controller (Zero External Calls) */
(function () {
  'use strict';

  const STORAGE_SETTINGS_KEY = 'demoshield_settings_v1';
  const Rules = window.DemoShieldRules;

  const $ = (id) => document.getElementById(id);
  const errorBanner = $('errorBanner');
  const originLabel = $('originLabel');
  const maskedBadge = $('maskedBadge');
  const savedMeta = $('savedMeta');
  const btnPicker = $('btnPicker');
  const btnHud = $('btnHud');
  const btnModeBlur = $('btnModeBlur');
  const btnModeRedact = $('btnModeRedact');
  const btnMaskAll = $('btnMaskAll');
  const btnSaveOrigin = $('btnSaveOrigin');
  const btnApplyOrigin = $('btnApplyOrigin');
  const btnUnblurAll = $('btnUnblurAll');
  const blurSlider = $('blurSlider');
  const blurVal = $('blurVal');
  const redactLabelInput = $('redactLabelInput');
  const proKeyInput = $('proKeyInput');
  const btnActivatePro = $('btnActivatePro');
  const proBadge = $('proBadge');
  const proMsg = $('proMsg');
  const catButtons = Array.from(document.querySelectorAll('.cat-btn'));

  let currentSettings = { ...Rules.DEFAULT_SETTINGS };

  function showError(msg) {
    if (!msg) {
      errorBanner.classList.add('hidden');
      errorBanner.textContent = '';
      return;
    }
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function dispatchToActive(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'BG_DISPATCH_TO_ACTIVE', payload }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false, error: 'No response from tab.' });
      });
    });
  }

  function renderTabState(st) {
    if (!st || !st.ok) {
      if (st && st.error) showError(st.error);
      return;
    }
    showError('');
    if (st.origin) originLabel.textContent = st.origin.replace(/^https?:\/\//, '');
    maskedBadge.textContent = `${st.maskedCount || 0} masked`;
    savedMeta.textContent = `${st.savedOriginCount || 0} saved`;

    btnPicker.textContent = st.pickerActive ? 'Stop Picking (Esc)' : 'Click-to-Blur Mode';
    btnModeBlur.classList.toggle('active', st.mode !== 'redact');
    btnModeRedact.classList.toggle('active', st.mode === 'redact');
    btnModeBlur.textContent = `Blur (${st.blurPx || currentSettings.blurPx}px)`;

    const cats = st.activeAutoCats || {};
    catButtons.forEach((btn) => {
      const c = btn.getAttribute('data-cat');
      btn.classList.toggle('active', Boolean(cats[c]));
    });
  }

  function renderProState() {
    if (currentSettings.proUnlocked) {
      proBadge.textContent = 'PRO';
      proBadge.classList.add('unlocked');
      proMsg.textContent = 'Pro lifetime key verified offline.';
    } else {
      proBadge.textContent = 'FREE';
      proBadge.classList.remove('unlocked');
    }
  }

  async function saveSettings(partial) {
    currentSettings = { ...currentSettings, ...partial };
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: currentSettings }, resolve);
    });
  }

  async function init() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_SETTINGS_KEY], (r) => resolve(r || {}));
    });
    if (stored[STORAGE_SETTINGS_KEY]) {
      currentSettings = { ...currentSettings, ...stored[STORAGE_SETTINGS_KEY] };
    }
    blurSlider.value = String(currentSettings.blurPx || 8);
    blurVal.textContent = `${currentSettings.blurPx || 8}px`;
    btnModeBlur.textContent = `Blur (${currentSettings.blurPx || 8}px)`;
    redactLabelInput.value = currentSettings.redactLabel || '••••••';
    if (currentSettings.proKey) proKeyInput.value = currentSettings.proKey;
    renderProState();

    // Auto-attach & replay any saved per-origin profile on popup open (<10ms)
    const st = await dispatchToActive({ type: 'DEMOSHIELD_GET_STATE', applySaved: true });
    renderTabState(st);
  }

  btnPicker.addEventListener('click', async () => {
    const st = await dispatchToActive({ type: 'DEMOSHIELD_START_PICKER' });
    renderTabState(st);
    if (st && st.ok) window.close();
  });

  btnHud.addEventListener('click', async () => {
    const st = await dispatchToActive({ type: 'DEMOSHIELD_TOGGLE_HUD', applySaved: true });
    renderTabState(st);
  });

  btnModeBlur.addEventListener('click', async () => {
    await saveSettings({ mode: 'blur' });
    const st = await dispatchToActive({ type: 'DEMOSHIELD_SET_MODE', mode: 'blur' });
    renderTabState(st);
  });

  btnModeRedact.addEventListener('click', async () => {
    await saveSettings({ mode: 'redact' });
    const st = await dispatchToActive({ type: 'DEMOSHIELD_SET_MODE', mode: 'redact' });
    renderTabState(st);
  });

  catButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = btn.getAttribute('data-cat');
      const st = await dispatchToActive({ type: 'DEMOSHIELD_AUTO_MASK', toggleCategory: cat, showHud: true });
      renderTabState(st);
    });
  });

  btnMaskAll.addEventListener('click', async () => {
    const st = await dispatchToActive({
      type: 'DEMOSHIELD_AUTO_MASK',
      categories: ['apiKeys', 'emails', 'currency', 'phonesCards'],
      showHud: true
    });
    renderTabState(st);
  });

  btnSaveOrigin.addEventListener('click', async () => {
    const st = await dispatchToActive({ type: 'DEMOSHIELD_SAVE_ORIGIN' });
    renderTabState(st);
  });

  btnApplyOrigin.addEventListener('click', async () => {
    const st = await dispatchToActive({ type: 'DEMOSHIELD_APPLY_ORIGIN' });
    renderTabState(st);
  });

  btnUnblurAll.addEventListener('click', async () => {
    const st = await dispatchToActive({ type: 'DEMOSHIELD_UNBLUR_ALL' });
    renderTabState(st);
  });

  blurSlider.addEventListener('input', async () => {
    const px = Number(blurSlider.value);
    blurVal.textContent = `${px}px`;
    btnModeBlur.textContent = `Blur (${px}px)`;
    await saveSettings({ blurPx: px });
    const st = await dispatchToActive({ type: 'DEMOSHIELD_UPDATE_SETTINGS', blurPx: px });
    renderTabState(st);
  });

  redactLabelInput.addEventListener('change', async () => {
    const val = redactLabelInput.value.trim() || '••••••';
    await saveSettings({ redactLabel: val });
    const st = await dispatchToActive({ type: 'DEMOSHIELD_UPDATE_SETTINGS', redactLabel: val });
    renderTabState(st);
  });

  btnActivatePro.addEventListener('click', async () => {
    const key = proKeyInput.value.trim().toUpperCase();
    if (Rules.verifyProKey(key)) {
      await saveSettings({ proKey: key, proUnlocked: true });
      renderProState();
      proMsg.textContent = 'Unlocked! Pro features enabled offline.';
    } else {
      proMsg.textContent = 'Invalid key format/checksum. Expected DSPRO-XXXX-XXXX-XXXX.';
    }
  });

  init();
})();