/* Settings: API keys + backend config for the live service.
   Keys are never stored in the browser and never in the repo. This panel
   talks to the SAM service (default http://localhost:8000) and the service
   saves keys to settings.local.json on its own machine (gitignored, mode
   0600). The service URL itself is the only thing kept in localStorage.
   After pulling the repo on a new machine, open Settings here, paste the
   keys, save, and the app runs. Test buttons verify a key without saving
   it; an empty key field on Save leaves the saved value unchanged. */
(function () {
  'use strict';
  var TT = window.TT;
  var H = TT.h;
  var LS_KEY = 'terraterm.samBase';
  var DEF_BASE = 'http://localhost:8000';

  function base() {
    try { return localStorage.getItem(LS_KEY) || DEF_BASE; } catch (e) { return DEF_BASE; }
  }
  function saveBase(v) {
    try { localStorage.setItem(LS_KEY, v); } catch (e) { /* private mode */ }
  }
  function req(path, init) {
    return fetch(base() + path, init).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error('HTTP ' + r.status + (j.detail ? ' ' + j.detail : ''));
      });
      return r.json();
    });
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  function setCls(id, c) { var el = document.getElementById(id); if (el) el.className = c; }

  function row(label, input, hint) {
    return H('label', { class: 'set-row' },
      H('span', { class: 'set-lab' }, label),
      input,
      hint ? H('span', { class: 'set-note' }, hint) : null);
  }
  function inp(id, type, placeholder) {
    return H('input', { class: 'input', id: id, type: type || 'text', placeholder: placeholder || '', autocomplete: 'off', spellcheck: false });
  }
  function providerSec(title, statusId, fields, testId, resultId) {
    var kids = [H('h3', null, title), H('div', { class: 'set-line' }, H('span', { id: statusId, class: 'set-status' }, '…'))];
    fields.forEach(function (f) { kids.push(f); });
    kids.push(H('div', { class: 'set-line' },
      H('button', { class: 'btn', type: 'button', id: testId }, 'TEST'),
      H('span', { id: resultId, class: 'set-status' }, '')));
    return H('section', { class: 'set-sec' }, kids);
  }

  function refresh() {
    return req('/api/settings').then(function (s) {
      var p = s.providers || {};
      setText('set-st-svc', 'Service reachable · backend ' + (s.backend || '?') + ' (' + (s.backend_source || '?') + ')');
      setCls('set-st-svc', 'set-status set-ok');
      var sam = p.sam || {}, eia = p.eia || {}, cop = p.copernicus || {}, bas = p.baseten || {};
      setText('set-st-sam', sam.configured ? 'SET (' + sam.source + ')' : 'NOT SET');
      setCls('set-st-sam', 'set-status' + (sam.configured ? ' set-ok' : ' set-bad'));
      setText('set-st-eia', eia.configured ? 'SET (' + eia.source + ')' : 'NOT SET');
      setCls('set-st-eia', 'set-status' + (eia.configured ? ' set-ok' : ' set-bad'));
      setText('set-st-cop', (cop.user_configured && cop.configured) ? 'SET (' + cop.source + ')' : 'NOT SET');
      setCls('set-st-cop', 'set-status' + ((cop.user_configured && cop.configured) ? ' set-ok' : ' set-bad'));
      setText('set-st-bas', bas.configured ? 'SET (' + bas.source + ')' : 'NOT SET');
      setCls('set-st-bas', 'set-status' + (bas.configured ? ' set-ok' : ' set-bad'));
      setVal('set-sam-base', sam.sam_base_url || '');
      setVal('set-eia-series', eia.eia_series || '');
      setVal('set-bas-base', bas.baseten_base_url || '');
      setVal('set-bas-model', bas.baseten_model || '');
      var be = document.getElementById('set-backend');
      if (be) be.value = s.backend || 'mock';
      var ps = s.parser || {};
      setText('set-st-parser', ps.parser ? 'Mask decoding ready (node + @meta-sam/parser)' : (ps.node ? 'Parser package missing: run npm install at the repo root' : 'node not found: mask decoding unavailable'));
      setCls('set-st-parser', 'set-status' + (ps.parser ? ' set-ok' : ' set-bad'));
      var ph = function (id, configured) {
        var el = document.getElementById(id);
        if (el) el.placeholder = configured ? 'Saved (type to replace)' : 'Not set';
      };
      ph('set-sam-key', sam.configured);
      ph('set-eia-key', eia.configured);
      ph('set-cop-user', cop.user_configured);
      ph('set-cop-pw', cop.configured);
      ph('set-bas-key', bas.configured);
      return s;
    }).catch(function (e) {
      setText('set-st-svc', 'Service unreachable at ' + base() + ' (' + e.message + '). Start it: uvicorn server:app --port 8000, from services/sam31.');
      setCls('set-st-svc', 'set-status set-bad');
      throw e;
    });
  }

  function save() {
    var body = {};
    var samKey = val('set-sam-key'), eiaKey = val('set-eia-key'), copPw = val('set-cop-pw'), basKey = val('set-bas-key');
    if (samKey) body.sam_api_key = samKey;
    if (eiaKey) body.eia_api_key = eiaKey;
    if (copPw) body.copernicus_password = copPw;
    if (basKey) body.baseten_api_key = basKey;
    var copUser = val('set-cop-user');
    if (copUser) body.copernicus_user = copUser;
    body.sam_base_url = val('set-sam-base');
    body.sam_backend = val('set-backend');
    body.eia_series = val('set-eia-series');
    body.baseten_base_url = val('set-bas-base');
    body.baseten_model = val('set-bas-model');
    return req('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () {
        ['set-sam-key', 'set-eia-key', 'set-cop-pw', 'set-bas-key'].forEach(function (id) { setVal(id, ''); });
        if (TT.ui && TT.ui.toast) TT.ui.toast('Settings saved on the service machine.');
        return refresh();
      })
      .catch(function (e) { if (TT.ui && TT.ui.toast) TT.ui.toast('Save failed: ' + e.message); });
  }

  function test(provider, resultId, extra) {
    setText(resultId, 'Testing…');
    setCls(resultId, 'set-status');
    var body = { provider: provider };
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) body[k] = extra[k]; });
    return req('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        setText(resultId, r.ok ? 'OK: ' + r.detail : 'FAILED: ' + r.detail);
        setCls(resultId, 'set-status' + (r.ok ? ' set-ok' : ' set-bad'));
      })
      .catch(function (e) {
        setText(resultId, 'FAILED: ' + e.message);
        setCls(resultId, 'set-status set-bad');
      });
  }

  function clearKeys() {
    if (!window.confirm('Clear all saved API keys from this machine? The app will fall back to mock until keys are added again.')) return;
    req('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sam_api_key: '', eia_api_key: '', copernicus_password: '', baseten_api_key: '' }) })
      .then(function () {
        if (TT.ui && TT.ui.toast) TT.ui.toast('Saved keys cleared.');
        return refresh();
      })
      .catch(function (e) { if (TT.ui && TT.ui.toast) TT.ui.toast('Clear failed: ' + e.message); });
  }

  function open() {
    var backendSel = H('select', { id: 'set-backend' },
      H('option', { value: 'mock' }, 'mock (local/fake, no API calls)'),
      H('option', { value: 'api' }, 'api (hosted Meta Model API, spends calls)'));
    var body = H('div', { class: 'settings' },
      H('div', { class: 'set-line' }, H('span', { id: 'set-st-svc', class: 'set-status' }, '…')),
      H('div', { class: 'set-line' }, H('span', { id: 'set-st-parser', class: 'set-status' }, '…')),
      H('section', { class: 'set-sec' },
        H('h3', null, 'SERVICE'),
        row('Service URL', inp('set-service-url', 'text', DEF_BASE), 'Where the SAM service runs. Stored only in this browser.'),
        H('div', { class: 'set-line' },
          H('button', { class: 'btn', type: 'button', onclick: function () { saveBase(val('set-service-url') || DEF_BASE); refresh().catch(function () {}); } }, 'APPLY URL'))),
      H('section', { class: 'set-sec' },
        H('h3', null, 'BACKEND'),
        row('Segmentation backend', backendSel, 'mock is the default: UI work never accidentally spends API calls or shows mock data as live. Applies immediately, no restart.')),
      providerSec('META MODEL API · SAM 3.1', 'set-st-sam', [
        row('API key', inp('set-sam-key', 'password'), 'Segments tanks from satellite imagery. Get one at dev.meta.ai/api-keys.'),
        row('Base URL', inp('set-sam-base', 'text', 'https://api.meta.ai/v1')),
      ], 'set-test-sam', 'set-res-sam'),
      providerSec('EIA · CUSHING INVENTORY', 'set-st-eia', [
        row('API key', inp('set-eia-key', 'password'), 'Weekly crude stocks at Cushing, OK. Get one at eia.gov/opendata.'),
        row('Series', inp('set-eia-series', 'text', 'W_EPC0_SAX_YCUOK_MBBL')),
      ], 'set-test-eia', 'set-res-eia'),
      providerSec('COPERNICUS · SENTINEL-2 TILES', 'set-st-cop', [
        row('Username (email)', inp('set-cop-user', 'text'), 'Copernicus Data Space account. Tiles over Cushing.'),
        row('Password', inp('set-cop-pw', 'password'), 'Never echoed back. Retype to change.'),
      ], 'set-test-cop', 'set-res-cop'),
      providerSec('BASETEN · MUSE SPARK (AGENT CHAT)', 'set-st-bas', [
        row('API key', inp('set-bas-key', 'password'), 'Chat/reasoning model only. It cannot segment tanks; SAM stays on the Meta API.'),
        row('Base URL', inp('set-bas-base', 'text', 'https://inference.baseten.co/v1')),
        row('Model', inp('set-bas-model', 'text', 'meta-models/muse-spark-open-1026')),
      ], 'set-test-bas', 'set-res-bas'),
      H('div', { class: 'set-actions' },
        H('button', { class: 'btn btn-amber', type: 'button', onclick: save }, 'SAVE SETTINGS'),
        H('button', { class: 'btn', type: 'button', onclick: clearKeys }, 'CLEAR SAVED KEYS')),
      H('p', { class: 'set-note' }, 'Keys are saved to settings.local.json on the service machine (gitignored, mode 0600). They are never committed to git and never stored in this browser. After pulling the repo on a new machine, paste the keys here once and the app runs.'));
    var modal = TT.ui.modal({ title: 'SETTINGS', body: body });
    setVal('set-service-url', base());
    document.getElementById('set-test-sam').addEventListener('click', function () { test('sam', 'set-res-sam', { key: val('set-sam-key') }); });
    document.getElementById('set-test-eia').addEventListener('click', function () { test('eia', 'set-res-eia', { key: val('set-eia-key') }); });
    document.getElementById('set-test-cop').addEventListener('click', function () { test('copernicus', 'set-res-cop', { username: val('set-cop-user'), password: val('set-cop-pw') }); });
    document.getElementById('set-test-bas').addEventListener('click', function () { test('baseten', 'set-res-bas', { key: val('set-bas-key') }); });
    refresh().catch(function () { /* service line already shows the error */ });
    return modal;
  }

  TT.settings = { open: open, base: base };
})();
