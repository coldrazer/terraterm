/* Example live backend adapter for TERRATERM.
   Load this before the app scripts (in src/index.html) or paste it above the inlined bundle in dist/terraterm.html.
   Endpoints are placeholders; map them to your services. Shapes are in CONTRACT.md. */
(function () {
  'use strict';
  const BASE = '/api'; // your backend
  const json = (path, init) => fetch(BASE + path, init).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + path);
    return r.json();
  });

  window.TERRATERM = {
    mode: 'live',
    config: { org: 'APEX STUDIO', sensorLabel: 'SAT VHR' },
    api: {
      watchlist: ({ symbols }) => json('/watchlist?symbols=' + encodeURIComponent(symbols.join(','))),
      macro: ({ tf }) => json('/macro?tf=' + tf),
      imagery: ({ site, pass }) => json('/imagery/' + encodeURIComponent(site) + (pass != null ? '?pass=' + encodeURIComponent(pass) : '')),

      // Streams newline-delimited JSON: {"token":"..."} lines, then a final {"done":true,"sources":[...],"confidence":0.82}.
      async ask({ prompt, context, onToken, signal }) {
        const res = await fetch(BASE + '/ask', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt, context: context }), signal: signal,
        });
        if (!res.ok || !res.body) throw new Error('Agent unreachable (' + res.status + ')');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', text = '', final = null;
        const handle = (line) => {
          line = line.trim();
          if (!line) return;
          const msg = JSON.parse(line);
          if (msg.token) { text += msg.token; if (onToken) onToken(msg.token, text); }
          if (msg.done) final = msg;
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
        }
        handle(buf + dec.decode()); // the last line may arrive without a trailing newline
        return { text: text, sources: (final && final.sources) || [], confidence: final ? final.confidence : 0, missing: (final && final.missing) || [] };
      },

      // Optional. Omit any of these and it stays off in live mode: its panel stays empty and the System panel lists it. Live mode never shows synthetic data.
      sites: () => json('/sites'),
      quotes: ({ kind }) => json('/quotes?kind=' + kind),
      series: ({ sym }) => json('/series/' + encodeURIComponent(sym)),
      flow: () => json('/flow'),
      wire: () => json('/wire'),
      events: ({ since }) => json('/events?since=' + since),
      system: () => json('/system'),
    },
  };
})();
