/* Imagery renderer. Draws a pass from pass.imageUrl (live) or from the scaffold scene descriptor.
   Base terrain is cached per site; composited passes are cached in a small LRU. */
(function () {
  'use strict';
  const TT = window.TT;
  const W = 1600, H = 1000, S = 0.8, LRU = 12;
  const baseCache = new Map();
  const passCache = new Map();
  const imgCache = new Map();
  let grain = null;

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  const ih = (seed, k) => { let x = (seed ^ Math.imul(k + 1, 2654435761)) >>> 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };

  function grainTile() {
    if (grain) return grain;
    const c = mk(160, 160), ctx = c.getContext('2d');
    const img = ctx.createImageData(160, 160);
    const rnd = TT.rng(99);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    grain = c;
    return c;
  }
  function overlayGrain(ctx, alpha, w, h) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  function path(ctx, pts) { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
    return 'rgb(' + ch(n >> 16) + ',' + ch((n >> 8) & 255) + ',' + ch(n & 255) + ')';
  }

  /* ---------- item painters (world coordinates) ---------- */
  const paint = {
    ground(ctx, it) {
      ctx.fillStyle = it.color; ctx.fillRect(0, 0, W, H);
      const rnd = TT.rng(it.seed);
      for (let k = 0; k < 240; k++) {
        const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 180;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const light = rnd() < 0.5;
        g.addColorStop(0, light ? 'rgba(255,250,235,' + (0.03 + rnd() * 0.07) + ')' : 'rgba(30,25,20,' + (0.04 + rnd() * 0.08) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.strokeStyle = it.alt; ctx.globalAlpha = 0.35;
      for (let k = 0; k < 40; k++) { ctx.lineWidth = 1 + rnd() * 2; ctx.beginPath(); const x = rnd() * W, y = rnd() * H; ctx.moveTo(x, y); ctx.bezierCurveTo(x + rnd() * 200 - 100, y + rnd() * 200 - 100, x + rnd() * 300 - 150, y + rnd() * 300 - 150, x + rnd() * 400 - 200, y + rnd() * 400 - 200); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
    poly(ctx, it) { ctx.save(); ctx.globalAlpha = it.alpha == null ? 1 : it.alpha; path(ctx, it.pts); ctx.fillStyle = it.fill; ctx.fill(); ctx.restore(); },
    pad(ctx, it) { ctx.fillStyle = '#4c4a46'; ctx.fillRect(it.x, it.y, it.w, it.h); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(it.x, it.y, it.w, it.h); },
    water(ctx, it) {
      ctx.save(); path(ctx, it.pts); ctx.clip();
      let minX = W, minY = H, maxX = 0, maxY = 0; it.pts.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
      const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
      g.addColorStop(0, '#1f3d47'); g.addColorStop(1, '#14293a');
      ctx.fillStyle = g; ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      const rnd = TT.rng(Math.round(minX + minY));
      ctx.strokeStyle = 'rgba(160,200,210,0.07)'; ctx.lineWidth = 1;
      for (let k = 0; k < 900; k++) { const x = minX + rnd() * (maxX - minX), y = minY + rnd() * (maxY - minY), l = 6 + rnd() * 18; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y - l * 0.18); ctx.stroke(); }
      ctx.restore();
      path(ctx, it.pts); ctx.strokeStyle = '#9b968b'; ctx.lineWidth = 3; ctx.stroke();
    },
    breakwater(ctx, it) { path(ctx, it.pts); ctx.fillStyle = '#a19c91'; ctx.fill(); ctx.strokeStyle = '#6d695f'; ctx.lineWidth = 2; ctx.stroke(); },
    quay(ctx, it) {
      ctx.fillStyle = '#a7a297'; ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.fillStyle = '#58554f'; for (let y = it.y + 10; y < it.y + it.h; y += 40) ctx.fillRect(it.x + it.w - 4, y, 3, 3);
    },
    berm(ctx, it) {
      ctx.fillStyle = '#857c6c'; ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = '#a69d8b'; ctx.lineWidth = 7; ctx.strokeRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = 'rgba(30,25,20,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(it.x + 5, it.y + 5, it.w - 10, it.h - 10);
    },
    road(ctx, it) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); it.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = '#5d5a55'; ctx.lineWidth = it.w + 4; ctx.stroke();
      ctx.strokeStyle = '#3e3e40'; ctx.lineWidth = it.w; ctx.stroke();
      ctx.setLineDash([10, 12]); ctx.strokeStyle = 'rgba(214,208,190,0.45)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    },
    pipes(ctx, it) {
      for (let k = 0; k < it.n; k++) {
        const y = it.y + k * it.gap;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(it.x, y + 2); ctx.lineTo(it.x + it.w, y + 2); ctx.stroke();
        ctx.strokeStyle = '#bdb8ad'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(it.x, y); ctx.lineTo(it.x + it.w, y); ctx.stroke();
      }
      ctx.fillStyle = '#6f6b63'; for (let x = it.x; x < it.x + it.w; x += 40) ctx.fillRect(x, it.y - 3, 3, it.n * it.gap + 2);
    },
    bldg(ctx, it) {
      const s = it.ht || 8;
      ctx.fillStyle = 'rgba(15,12,10,0.45)';
      ctx.beginPath(); ctx.moveTo(it.x + it.w, it.y); ctx.lineTo(it.x + it.w + s, it.y + s); ctx.lineTo(it.x + it.w + s, it.y + it.h + s); ctx.lineTo(it.x + s, it.y + it.h + s); ctx.lineTo(it.x, it.y + it.h); ctx.lineTo(it.x + it.w, it.y + it.h); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(it.x, it.y, it.x + it.w, it.y + it.h);
      g.addColorStop(0, shade(it.tone, 0.08)); g.addColorStop(1, shade(it.tone, -0.1));
      ctx.fillStyle = g; ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = shade(it.tone, -0.35); ctx.lineWidth = 1.5; ctx.strokeRect(it.x, it.y, it.w, it.h);
      if (it.detail === 'ridges') { ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1; for (let x = it.x + 8; x < it.x + it.w; x += 8) { ctx.beginPath(); ctx.moveTo(x, it.y + 1); ctx.lineTo(x, it.y + it.h - 1); ctx.stroke(); } }
      if (it.detail === 'hvac') {
        const rnd = TT.rng(Math.round(it.x * 7 + it.y));
        for (let x = it.x + 18; x < it.x + it.w - 20; x += 34) for (let y = it.y + 16; y < it.y + it.h - 16; y += 30) {
          if (rnd() < 0.35) continue;
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + 2, 10, 8);
          ctx.fillStyle = '#e4e1da'; ctx.fillRect(x, y, 10, 8);
        }
      }
    },
    column(ctx, it) {
      circle(ctx, it.x + it.r * 0.35, it.y + it.r * 0.35, it.r); ctx.fillStyle = 'rgba(10,10,10,0.4)'; ctx.fill();
      const g = ctx.createRadialGradient(it.x - it.r * 0.35, it.y - it.r * 0.35, 1, it.x, it.y, it.r);
      g.addColorStop(0, '#e6e3db'); g.addColorStop(1, '#8a867d');
      circle(ctx, it.x, it.y, it.r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#5f5b54'; ctx.lineWidth = 1; ctx.stroke();
    },
    tankpad(ctx, it) {
      circle(ctx, it.x, it.y, it.r + 9); ctx.fillStyle = 'rgba(150,140,124,0.55)'; ctx.fill();
      ctx.save(); ctx.translate(it.x + it.r * 0.2, it.y + it.r * 0.2); ctx.scale(1, 1);
      circle(ctx, 0, 0, it.r); ctx.fillStyle = 'rgba(20,16,12,0.42)'; ctx.fill(); ctx.restore();
    },
    tank(ctx, it) {
      const r = it.r, rr = r * 0.9;
      circle(ctx, it.x, it.y, r); ctx.fillStyle = '#d8d4ca'; ctx.fill();
      ctx.strokeStyle = '#8c887f'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); circle(ctx, it.x, it.y, rr); ctx.clip();
      ctx.fillStyle = '#4a4842'; ctx.fillRect(it.x - rr, it.y - rr, rr * 2, rr * 2);
      const d = (1 - TT.clamp(it.fill, 0, 1)) * r * 0.66;
      const cx = it.x + d * 0.7071, cy = it.y + d * 0.7071;
      circle(ctx, cx, cy, rr); ctx.fillStyle = '#bcb8ad'; ctx.fill();
      ctx.strokeStyle = '#a19d92'; ctx.lineWidth = 1.2; circle(ctx, cx, cy, rr * 0.94); ctx.stroke();
      ctx.fillStyle = '#8f8b81'; ctx.fillRect(cx - 4, cy - 4, 8, 8);
      ctx.strokeStyle = 'rgba(80,77,70,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - rr * 0.5, cy); ctx.lineTo(cx + rr * 0.5, cy); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(it.x, it.y, r - 1, Math.PI * 0.95, Math.PI * 1.55); ctx.strokeStyle = 'rgba(255,253,245,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    },
    crane(ctx, it) {
      ctx.save(); ctx.fillStyle = 'rgba(10,10,12,0.32)'; ctx.fillRect(it.x + 16, it.y + 10, 150, 8); ctx.restore();
      ctx.fillStyle = '#b9b3a6'; ctx.fillRect(it.x - 16, it.y - 5, 150, 7);
      ctx.strokeStyle = '#6c675e'; ctx.lineWidth = 1; ctx.strokeRect(it.x - 16, it.y - 5, 150, 7);
      ctx.fillStyle = '#8f2f25'; ctx.fillRect(it.x - 2, it.y - 12, 26, 22);
      ctx.strokeStyle = '#5a5650'; ctx.strokeRect(it.x - 2, it.y - 12, 26, 22);
    },
    track(ctx, it) {
      ctx.lineCap = 'butt';
      ctx.beginPath(); it.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = '#5b544b'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#3d3934'; ctx.lineWidth = 4.2; ctx.stroke();
      ctx.strokeStyle = '#a09a8f'; ctx.lineWidth = 0.9;
      const [a, b] = [it.pts[0], it.pts[it.pts.length - 1]];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 1.7, ny = dx / L * 1.7;
      [1, -1].forEach((sg) => { ctx.beginPath(); ctx.moveTo(a[0] + nx * sg, a[1] + ny * sg); ctx.lineTo(b[0] + nx * sg, b[1] + ny * sg); ctx.stroke(); });
    },
    stalls(ctx, it) {
      ctx.strokeStyle = 'rgba(222,218,206,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
      for (let c = 0; c <= it.cols; c++) { const x = it.x + c * it.sw; ctx.moveTo(x, it.y); ctx.lineTo(x, it.y + it.sh * 2); }
      ctx.moveTo(it.x, it.y + it.sh); ctx.lineTo(it.x + it.cols * it.sw, it.y + it.sh);
      ctx.stroke();
    },
    boxes(ctx, it) {
      const pal = ['#a14a3b', '#2f5f8a', '#cdc8bc', '#3f7f6e', '#b8862f', '#6b4a8a', '#8a8f94', '#2e6b4a', '#c46b3b'];
      it.blocks.forEach((b) => {
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(b.x + 2, b.y + 2, b.w, b.h);
        ctx.fillStyle = '#6d6a64'; ctx.fillRect(b.x, b.y, b.w, b.h);
        const cols = 15, rows = 10, sw = b.w / cols, sh = b.h / rows;
        for (let k = 0; k < cols * rows; k++) {
          if (ih(b.seed, k) >= it.occ) continue;
          const c = k % cols, r = (k / cols) | 0;
          ctx.fillStyle = pal[(ih(b.seed, k + 997) * pal.length) | 0];
          ctx.fillRect(b.x + c * sw + 0.35, b.y + r * sh + 0.25, sw - 0.7, sh - 0.5);
        }
      });
    },
    ship(ctx, it) {
      const tones = ['#2f3e4a', '#5a3b33', '#3c4a3b', '#4a4a52', '#3a3530'];
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
      const L = it.len, B = it.beam, hl = L / 2, hb = B / 2, bow = Math.min(B * 0.9, L * 0.2);
      const hull = () => { ctx.beginPath(); ctx.moveTo(-hl, -hb); ctx.lineTo(hl - bow, -hb); ctx.quadraticCurveTo(hl, -hb * 0.2, hl, 0); ctx.quadraticCurveTo(hl, hb * 0.2, hl - bow, hb); ctx.lineTo(-hl, hb); ctx.closePath(); };
      ctx.save(); ctx.translate(3, 3); hull(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill(); ctx.restore();
      if (!it.moored) { ctx.strokeStyle = 'rgba(210,230,235,0.12)'; ctx.lineWidth = B * 0.6; ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(-hl - L * 0.25, 0); ctx.stroke(); }
      hull(); ctx.fillStyle = tones[it.tone % tones.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#7d8185'; ctx.fillRect(-hl + 3, -hb + 2.5, L - bow - 4, B - 5);
      if (it.load != null) {
        const n = 7; const hw = (L - bow - 30) / n;
        for (let k = 0; k < n; k++) { ctx.fillStyle = k / n < it.load ? '#7a4530' : '#2c2c2e'; ctx.fillRect(-hl + 26 + k * hw + 1, -hb + 5, hw - 3, B - 10); }
      } else if (L > 60) {
        const rnd = TT.rng(Math.round(it.x * 13 + it.y));
        const pal = ['#a14a3b', '#2f5f8a', '#cdc8bc', '#3f7f6e', '#b8862f', '#6b4a8a'];
        for (let x = -hl + L * 0.2; x < hl - bow - 3; x += 5.2) for (let y = -hb + 3.5; y < hb - 3.5; y += 2.6) { if (rnd() < 0.15) continue; ctx.fillStyle = pal[(rnd() * pal.length) | 0]; ctx.fillRect(x, y, 4.6, 2.1); }
      }
      ctx.fillStyle = '#e8e6e0'; ctx.fillRect(-hl + L * 0.05, -hb + 2, Math.max(4, L * 0.09), B - 4);
      ctx.restore();
    },
    trucks(ctx, it) {
      (it.pts || []).forEach(([x, y, rot]) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        const L = it.big ? 56 : 22, B = it.big ? 9 : 7;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-L / 2 + 1.5, -B / 2 + 1.5, L, B);
        ctx.fillStyle = '#d9d6ce'; ctx.fillRect(-L / 2, -B / 2, L * 0.78, B);
        ctx.fillStyle = '#35587f'; ctx.fillRect(-L / 2 + L * 0.8, -B / 2, L * 0.2, B);
        ctx.restore();
      });
    },
    cars(ctx, it) {
      const pal = ['#dcdcd9', '#1f1f22', '#8e9297', '#a83838', '#2d4f7c', '#c8c2b4', '#5b5f63', '#ececea', '#3d5a45'];
      it.stalls.forEach((s) => {
        if (s.order >= it.n) return;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(s.x - 2.8, s.y - 6, 6.5, 13.4);
        ctx.fillStyle = pal[s.color]; ctx.fillRect(s.x - 3.3, s.y - 6.6, 6.6, 13.2);
        ctx.fillStyle = 'rgba(20,24,30,0.65)'; ctx.fillRect(s.x - 2.6, s.y - 3.6, 5.2, 2.6);
      });
    },
    railcars(ctx, it) {
      for (let k = 0; k < it.n; k++) {
        const x = it.x + k * (it.len + it.gap), y = it.y;
        let col;
        if (it.loco) col = '#c8862e';
        else if (it.hopper) col = ih(it.seed, k) < 0.6 ? '#5a3a2a' : '#3b3a38';
        else { const v = ih(it.seed, k); col = v < 0.32 ? '#6a4434' : v < 0.55 ? '#5c5f63' : v < 0.75 ? '#1f1f21' : v < 0.9 ? '#8b8a84' : '#3e5a6f'; }
        ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(x + 1.5, y - 2.5, it.len, 7);
        ctx.fillStyle = col; ctx.fillRect(x, y - 3.5, it.len, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y - 3.5, it.len, 1.5);
      }
    },
    pile(ctx, it) {
      ctx.save(); ctx.translate(10, 10); path(ctx, it.pts); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
      let minX = W, minY = H, maxX = 0, maxY = 0; it.pts.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
      const g = ctx.createRadialGradient(it.x - (maxX - minX) * 0.15, it.y - (maxY - minY) * 0.2, 4, it.x, it.y, Math.max(maxX - minX, maxY - minY) * 0.6);
      g.addColorStop(0, shade(it.color, 0.25)); g.addColorStop(0.6, it.color); g.addColorStop(1, shade(it.color, -0.35));
      path(ctx, it.pts); ctx.fillStyle = g; ctx.fill();
      ctx.save(); path(ctx, it.pts); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.ellipse(it.x, it.y, (maxX - minX) * k / 12, (maxY - minY) * k / 12, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    },
  };
  function drawItems(ctx, items) { for (const it of items) { const fn = paint[it.k]; if (fn) fn(ctx, it); } }

  function base(scene) {
    if (baseCache.has(scene.siteId)) return baseCache.get(scene.siteId);
    const c = mk(W * S, H * S), ctx = c.getContext('2d');
    ctx.scale(S, S);
    drawItems(ctx, scene.static);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    overlayGrain(ctx, 0.22, c.width, c.height);
    baseCache.set(scene.siteId, c);
    return c;
  }

  function loadImage(url) {
    if (imgCache.has(url)) return imgCache.get(url);
    const p = new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = () => rej(new Error('Image failed to load')); img.src = url; });
    imgCache.set(url, p);
    p.catch(() => imgCache.delete(url));
    if (imgCache.size > 48) imgCache.delete(imgCache.keys().next().value);
    return p;
  }

  const aspectWarned = new Set();
  function checkAspect(img, url) {
    const r = img.naturalWidth / img.naturalHeight;
    if (Math.abs(r - W / H) / (W / H) > 0.02 && !aspectWarned.has(url)) {
      aspectWarned.add(url);
      console.warn('[TERRATERM] pass image is ' + img.naturalWidth + 'x' + img.naturalHeight + ' (' + r.toFixed(3) + ':1). The viewer expects 16:10 (' + W + 'x' + H + '); it will be stretched. Crop or pad on the server. See CONTRACT.md.');
    }
  }
  function lruSet(k, v) { passCache.delete(k); passCache.set(k, v); while (passCache.size > LRU) passCache.delete(passCache.keys().next().value); }
  // Pass ids are only unique within a site, so the cache key is the image itself (live) or site + pass (scaffold).
  const passKey = (pass) => (pass.imageUrl ? 'url:' + pass.imageUrl : 'scene:' + (pass.scene ? pass.scene.siteId : '') + ':' + pass.id);

  TT.Imagery = {
    W: W, H: H,
    key: passKey,
    cached(pass) { return passCache.get(passKey(pass)) || null; },
    hasBase(siteId) { return baseCache.has(siteId); },
    async passCanvas(pass) {
      const key = passKey(pass);
      const hit = passCache.get(key);
      if (hit) { lruSet(key, hit); return hit; }
      const c = mk(W * S, H * S), ctx = c.getContext('2d');
      if (pass.imageUrl) {
        const img = await loadImage(pass.imageUrl);
        checkAspect(img, pass.imageUrl);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } else {
        ctx.drawImage(base(pass.scene), 0, 0);
        ctx.scale(S, S);
        drawItems(ctx, pass.scene.items);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        overlayGrain(ctx, 0.12, c.width, c.height);
        const v = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, c.width, c.height);
      }
      lruSet(key, c);
      return c;
    },
    /* Low-res blurred placeholder (§13). Returns null if no base exists yet. */
    placeholder(siteId) {
      const b = baseCache.get(siteId);
      if (!b) return null;
      const c = mk(W * S / 10, H * S / 10);
      c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
      return c;
    },
    /* Draw a world-space crop of a pass into a canvas (drawer thumbnails, filmstrip). Crop is in normalized coords. */
    async drawCrop(pass, canvas, crop) {
      crop = crop || { x: 0, y: 0, w: 1, h: 1 };
      const ctx = canvas.getContext('2d');
      const cw = canvas.width, ch = canvas.height;
      ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, cw, ch);
      const sx = crop.x * W, sy = crop.y * H, sw = crop.w * W, sh = crop.h * H;
      const sc = Math.min(cw / sw, ch / sh);
      const ox = (cw - sw * sc) / 2, oy = (ch - sh * sc) / 2;
      const full = passCache.get(passKey(pass));
      if (full) { ctx.drawImage(full, sx * S, sy * S, sw * S, sh * S, ox, oy, sw * sc, sh * sc); return; }
      if (pass.imageUrl) { const img = await loadImage(pass.imageUrl); const kx = img.naturalWidth / W, ky = img.naturalHeight / H; ctx.drawImage(img, sx * kx, sy * ky, sw * kx, sh * ky, ox, oy, sw * sc, sh * sc); return; }
      ctx.save();
      ctx.beginPath(); ctx.rect(ox, oy, sw * sc, sh * sc); ctx.clip();
      ctx.drawImage(base(pass.scene), sx * S, sy * S, sw * S, sh * S, ox, oy, sw * sc, sh * sc);
      ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-sx, -sy);
      drawItems(ctx, pass.scene.items);
      ctx.restore();
    },
  };
})();
