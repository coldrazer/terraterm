/* TERRATERM live backend adapter wired to the SAM 3.1 service.
   Load this before the app scripts (src/index.html) or paste it above the inlined
   bundle in dist/terraterm.html.

   The SAM service (services/sam31) answers imagery(), sites() and system().
   Market data comes from your own backend at API_BASE. Shapes: CONTRACT.md. */
(function () {
  'use strict';
  const SAM = 'http://localhost:8000'; // the SAM 3.1 service (see services/sam31)
  const API = '/api'; // your market/data backend

  const json = (path, init) =>
    fetch(path, init).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + path);
      return r.json();
    });

  window.TERRATERM = {
    mode: 'live',
    config: {
      org: 'APEX STUDIO',
      sensorLabel: 'SAT VHR',
      segmentationModel: 'SAM 3.1',
      defaultSite: 'ela-segundo-tanks',
      allowDemo: false,
    },
    api: {
      watchlist: ({ symbols }) =>
        json(API + '/watchlist?symbols=' + encodeURIComponent(symbols.join(','))),
      macro: ({ tf }) => json(API + '/macro?tf=' + tf),

      // Segments come from SAM 3.1. The service already returns the contract
      // shape (asOf, site, passes, pass, prior) with normalized polygons.
      imagery: ({ site, pass }) =>
        json(
          SAM +
            '/imagery/' +
            encodeURIComponent(site) +
            (pass != null ? '?pass=' + encodeURIComponent(pass) : '')
        ),

      sites: () => json(SAM + '/sites'),
      system: () => json(SAM + '/system'),

      // Streams newline-delimited JSON: {"token":"..."} lines, then a final
      // {"done":true,"sources":[...],"confidence":0.82}.
      async ask({ prompt, context, onToken, signal }) {
        const res = await fetch(API + '/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt, context: context }),
          signal: signal,
        });
        if (!res.ok || !res.body) throw new Error('Agent unreachable (' + res.status + ')');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '',
          text = '',
          final = null;
        const handle = (line) => {
          line = line.trim();
          if (!line) return;
          const msg = JSON.parse(line);
          if (msg.token) {
            text += msg.token;
            if (onToken) onToken(msg.token, text);
          }
          if (msg.done) final = msg;
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            handle(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
          }
        }
        handle(buf + dec.decode()); // the last line may arrive without a trailing newline
        return {
          text: text,
          sources: (final && final.sources) || [],
          confidence: final ? final.confidence : 0,
          missing: (final && final.missing) || [],
        };
      },
    },
  };
})();
