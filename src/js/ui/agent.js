/* Agent panel (§8.4, §10): chat log, context chips, suggested prompts, composer, streaming, sources and confidence. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const F = TT.fmt;
  const app = () => TT.app;
  let seq = 0;

  class AgentPanel {
    constructor(o) {
      this.o = o || {};
      this.uid = 'ag' + (++seq);
      this.history = [];
      this.hIdx = -1;
      this.ctxbar = H('div', { class: 'ctxbar', 'aria-label': 'Agent context' });
      this.log = H('div', { class: 'chat-log', role: 'log', 'aria-live': 'off', 'aria-label': 'Agent conversation', tabindex: '0' });
      this.live = H('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
      this.prompts = H('div', { class: 'prompts', role: 'group', 'aria-label': 'Suggested prompts' });
      this.renderPrompts();
      this.input = H('input', { class: 'input', id: this.uid + '-input', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Ask TERRATERM · / for commands', 'aria-label': 'Ask the agent' });
      this.btn = H('button', { class: 'btn-amber', type: 'submit' }, 'ASK');
      this.form = H('form', { class: 'composer' }, this.input, this.btn);
      this.viewonly = H('div', { class: 'viewonly' }, 'View only on small screens. Ask from a desktop.');
      this.el = H('div', { class: 'chat' }, this.ctxbar, this.log, this.live, this.prompts, this.form, this.viewonly);
      this.form.addEventListener('submit', (e) => { e.preventDefault(); if (app().asking) { app().stopAsk(); return; } this.send(this.input.value); });
      this.input.addEventListener('keydown', (e) => this.onKey(e));
      TT.bus.on('chat', (e) => this.onChat(e));
      TT.bus.on('pins', () => this.renderCtx());
      TT.bus.on('mode', () => { this.renderPrompts(); if (!app().chat.length) this.renderAll(); });
      TT.bus.on('system', () => { if (!app().chat.length && !this.welcomed) { this.welcomed = !!app().system; this.renderAll(); } });
      TT.bus.on('asking', (on) => { TT.setText(this.btn, on ? 'STOP' : 'ASK'); this.btn.classList.toggle('btn', on); this.btn.classList.toggle('btn-amber', !on); });
      this.renderAll();
      this.renderCtx();
    }
    renderPrompts() { this.prompts.replaceChildren.apply(this.prompts, TT.labels.prompts().slice(0, 3).map((p) => H('button', { class: 'chip', type: 'button', onclick: () => this.send(p) }, p))); }
    send(text) {
      text = String(text || '').trim();
      if (!text) return;
      this.history.push(text); this.hIdx = -1;
      this.input.value = '';
      app().ask(text);
    }
    focus() { this.input.focus(); }
    onKey(e) {
      if (e.key === '/' && !this.input.value) { e.preventDefault(); TT.palette.open(); return; }
      if (e.key === 'Escape' && app().asking) { e.preventDefault(); e.stopPropagation(); app().stopAsk(); return; }
      if (e.key === 'ArrowUp' && (!this.input.value || this.hIdx >= 0) && this.history.length) {
        e.preventDefault(); this.hIdx = this.hIdx < 0 ? this.history.length - 1 : Math.max(0, this.hIdx - 1); this.input.value = this.history[this.hIdx];
      } else if (e.key === 'ArrowDown' && this.hIdx >= 0) {
        e.preventDefault(); this.hIdx++; if (this.hIdx >= this.history.length) { this.hIdx = -1; this.input.value = ''; } else this.input.value = this.history[this.hIdx];
      }
    }
    renderCtx() {
      const pins = app().pins;
      const sel = app().selected;
      const kids = [H('span', { class: 'lbl', text: 'CONTEXT' })];
      if (sel) kids.push(H('button', { class: 'chip ctx', type: 'button', 'aria-label': 'Clear selected segment ' + sel.id, 'data-tip': 'Selected segment · ' + sel.site, onclick: () => { app().selected = null; TT.bus.emit('pins'); } }, 'SEG ' + sel.id.toUpperCase(), H('span', { class: 'x', 'aria-hidden': 'true' }, '×')));
      if (!pins.length && !sel) kids.push(H('span', { class: 'muted', text: 'Click a watchlist row or pin a segment.' }));
      pins.forEach((p) => kids.push(H('button', { class: 'chip ctx', type: 'button', 'aria-label': 'Remove ' + p.label + ' from agent context', onclick: () => app().togglePin(p) }, p.label, H('span', { class: 'x', 'aria-hidden': 'true' }, '×'))));
      this.ctxbar.replaceChildren.apply(this.ctxbar, kids);
    }
    renderAll() {
      const msgs = app().chat;
      if (!msgs.length) {
        const n = app().sites.length;
        this.log.replaceChildren(H('div', { class: 'msg system' }, H('b', null, 'TERRATERM · ' + TT.labels.agentModel()), n ? ' is watching ' + n + ' site' + (n === 1 ? '' : 's') + ' and the cross-asset tape. Ask, or pick a prompt below.' : ' is watching the cross-asset tape. Ask, or pick a prompt below.'));
        return;
      }
      this.log.replaceChildren.apply(this.log, msgs.map((m) => this.msgEl(m)));
      this.scroll(true);
    }
    onChat(e) {
      if (e.type === 'reset') { this.renderAll(); return; }
      if (e.type === 'add') {
        if (this.log.children.length === 1 && !this.log.firstChild.dataset.id) this.log.replaceChildren();
        const near = this.nearBottom();
        this.log.append(this.msgEl(e.msg));
        this.scroll(near || e.msg.role === 'user');
        if (e.msg.role === 'system') this.live.textContent = 'System: ' + e.msg.text;
        return;
      }
      if (e.type === 'update') {
        const el = this.log.querySelector('[data-id="' + e.msg.id + '"]');
        if (!el) return;
        const near = this.nearBottom();
        this.fill(el, e.msg);
        if (near) this.scroll(true);
        if (!e.msg.streaming && e.msg.role === 'agent') {
          this.live.textContent = 'TERRATERM: ' + (e.msg.error ? e.msg.error : e.msg.text + (e.msg.sources ? ' Sources: ' + e.msg.sources.map((s) => s.label).join(', ') + '.' : '') + (e.msg.confidence != null ? ' Confidence ' + TT.fmt.conf(e.msg.confidence) + '.' : ''));
        }
      }
    }
    nearBottom() { return this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60; }
    scroll(force) { if (force) this.log.scrollTop = this.log.scrollHeight; }
    msgEl(m) { const el = H('div', { class: 'msg ' + m.role, dataset: { id: m.id } }); this.fill(el, m); return el; }
    fill(el, m) {
      if (m.role === 'user') { el.replaceChildren(H('div', { class: 'who' }, H('span', null, 'YOU'), H('span', null, F.utc(m.ts))), H('div', { text: m.text })); return; }
      if (m.role === 'system') {
        const label = m.alertId ? (m.sev === 'high' ? 'ANOMALY' : 'ALERT') : 'SYSTEM';
        el.replaceChildren(H('b', null, '▲ ' + label + ' '), m.text + ' · ' + F.utc(m.ts) + ' ',
          m.route ? H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => TT.router.go(m.route) }, 'VIEW') : null,
          m.alertId ? H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => app().ask('Brief me on this: ' + m.text.split(':')[0]) }, 'ASK') : null);
        return;
      }
      const who = H('div', { class: 'who' }, H('span', { class: 'name' }, 'TERRATERM'), H('span', null, m.model || TT.labels.agentModel()), H('span', null, F.utc(m.ts)));
      const body = H('div', { class: 'body' });
      if (m.reasoning) body.append(H('div', { class: 'reasoning' }, H('span', { class: 'dot pulse' }), 'Reasoning…'));
      else {
        const paras = String(m.text || '').split(/\n\n+/);
        paras.forEach((p, k) => body.append(H('p', { class: m.streaming && k === paras.length - 1 ? 'caret' : null }, p)));
      }
      const kids = [who, body];
      if (m.stopped) kids.push(H('div', { class: 'foot' }, H('span', null, 'Stopped before the answer finished.')));
      if (m.error) kids.push(H('div', { class: 'foot' }, H('div', { class: 'err' }, H('span', null, m.error.trim()), H('button', { class: 'btn', type: 'button', onclick: () => app().retryAsk(m.id) }, 'RETRY'))));
      if (!m.streaming && !m.error && !m.stopped && m.confidence != null) {
        const src = (m.sources || []).length
          ? (m.sources || []).map((s, k) => [k ? ' · ' : '', H('button', { class: 'src', type: 'button', onclick: () => TT.router.go(s.route) }, s.label)])
          : [H('span', null, 'none in context')];
        const foot = H('div', { class: 'foot' },
          H('div', null, H('span', { class: 'k' }, 'Sources'), src),
          H('div', null, H('span', { class: 'k' }, 'Confidence'), H('b', { class: 'conf-val' }, TT.fmt.conf(m.confidence))),
          (m.missing || []).length ? H('div', null, H('span', { class: 'k' }, 'Missing'), m.missing.join(', ')) : null);
        kids.push(foot);
      }
      el.replaceChildren.apply(el, kids);
    }
  }
  TT.AgentPanel = AgentPanel;
})();
