/* Pixel-accurate WCAG AA contrast audit.
   Three ways this can be done wrongly, all of which produce false failures:
     1. Reading getComputedStyle and walking ancestors for background-color -
        blind to gradient backgrounds (background-image) and to text colours
        applied by descendant rules.
     2. Full-page capture (captureBeyondViewport) - it resizes the emulated
        viewport to the content height, re-laying-out min-height:100vh sections
        so the sampled regions drift away from the measured rects.
     3. Scroll arithmetic (pageY - scrollY) - stale rects after lazy images or
        reveal animations move things, and meaningless for elements inside a
        position:fixed ancestor.
   This script instead samples the ACTUALLY PAINTED pixels of a normal viewport
   capture, taking every rect fresh from the live layout immediately before each
   shot (getBoundingClientRect is already viewport-relative, exactly like the
   capture), and estimates the background as the MEDIAN luminance of the box -
   text ink is a minority of its own line box, whereas a gradient background
   fragments across buckets and loses a most-common-colour vote to solid text.
   QA-only tool - not part of the shipped page.
   Usage: node _contrast.js [width] [height]        defaults to 1440x900 */
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { spawn } = require("child_process");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", PORT = 9450;
const UD = path.join(process.env.TEMP, "opencode", "cdp-contrast");
const URL = "file://" + path.join(__dirname, "index.html").replace(/\\/g, "/");
const W = Number(process.argv[2]) || 1440, H = Number(process.argv[3]) || 900;
// Deliberately generous overlap: scorable bands are shrunk by the header at the
// top and by any bottom overlay, so with a tight step an element can slip into
// a gap and be measured in no capture at all.
const STEP = Math.max(240, H - 280);
const SEL = "p,li,h1,h2,h3,h4,a,span,button,small,td,th,figcaption";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9];
      if (data[8] !== 8 || (ct !== 6 && ct !== 2)) throw new Error("unsupported PNG"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const o = y * stride, pr = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0, b = y > 0 ? out[pr + x] : 0, c = x >= bpp && y > 0 ? out[pr + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      else if (f !== 0) throw new Error("bad filter " + f);
      out[o + x] = v;
    }
  }
  return { w, h, bpp, data: out };
}
const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD, "--window-size=" + W + "," + H, "about:blank"], { stdio: "ignore" });
  let ws, id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  for (let i = 0; i < 40; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
  const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page");
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id);
      m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  // The page ships a strict CSP with no 'unsafe-inline', which blocks the
  // <style> injected below to freeze transitions. This is an audit tool, not
  // the site, so bypass the policy here rather than weakening it in the page.
  // `_csp.js` is the script that runs WITHOUT the bypass.
  //
  // NB the method name: Chrome 155 exposes `Page.setBypassCSP`. The older
  // `Security.setBypassCSP` answers "wasn't found" here — verify with
  // `node _probe.js CSP` rather than assuming (CDP does move things).
  await send("Page.setBypassCSP", { enabled: true });
  const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true, timeout: 60000 })).result.value;

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 820 });
  await send("Page.navigate", { url: URL }); await sleep(2600);
  // Settle the page: kill transitions (so nothing moves mid-audit), reveal all
  // sections, and scroll the whole page once so every lazy image has loaded
  // before a single rect is trusted.
  await ev(`(()=>{const s=document.createElement('style');
    s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(s);
    document.documentElement.style.scrollBehavior='auto';
    document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-revealed'));})()`);
  await ev(`(async()=>{const H=document.documentElement.scrollHeight;
    for(let y=0;y<H;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}
    window.scrollTo(0,0);})()`);
  for (let i = 0; i < 40; i++) { if ((await ev("scrollY")) === 0) break; await sleep(100); }
  await sleep(500);

  // Static per-element data, collected once in DOM order. Positions are NOT
  // stored here - they are re-read from the live layout before every capture.
  const items = JSON.parse(await ev(`(()=>{const out=[];
    const paints=n=>n.nodeType===3&&n.textContent.trim().length>0;
    document.querySelectorAll('${SEL}').forEach(el=>{
      if(![...el.childNodes].some(paints))return;       // only elements that paint their own text
      const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden')return;
      const parse=s=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(Number);
        return {rgb:p.slice(0,3),a:p.length>3?p[3]:1}};
      let inFixed=false; for(let e=el;e;e=e.parentElement) if(getComputedStyle(e).position==='fixed'){inFixed=true;break;}
      const st=parse(cs.webkitTextStrokeColor), sw=parseFloat(cs.webkitTextStrokeWidth)||0;
      out.push({sel:el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.split(' ')[0]:''),
        text:el.textContent.trim().replace(/\\s+/g,' ').slice(0,50),
        color:parse(cs.color),stroke:st?{rgb:st.rgb,a:st.a,w:sw}:null,
        inFixed, size:parseFloat(cs.fontSize),weight:parseInt(cs.fontWeight)||400});
    }); return JSON.stringify(out);})()`));
  const pageH = await ev("document.documentElement.scrollHeight");
  console.log("page " + W + "x" + pageH + "  |  " + items.length + " text elements\n");

  const fails = [], checked = new Set(), why = new Map();
  for (let top = 0; top < pageH; top += STEP) {
    await ev(`window.scrollTo(0,${top})`);
    for (let i = 0; i < 30; i++) { if (Math.abs((await ev("scrollY")) - top) < 2) break; await sleep(100); }
    await sleep(140);

    // Fresh viewport-relative rects + the union of any fixed overlay that is
    // currently painted, taken immediately before the shot so they cannot drift.
    // MUST apply exactly the same element filter as the metadata pass above,
    // or the two arrays go out of register and every element is mis-measured.
    const live = JSON.parse(await ev(`(()=>{const paints=n=>n.nodeType===3&&n.textContent.trim().length>0;
      const rects=[...document.querySelectorAll('${SEL}')]
        .filter(el=>[...el.childNodes].some(paints))
        .filter(el=>{const cs=getComputedStyle(el);return cs.display!=='none'&&cs.visibility!=='hidden'})
        .map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});
      // Locate bottom-anchored fixed overlays (sticky CTA, floating button) and
      // remember their TOP: content must be measured clear of them, not merely
      // clear of their lower edge.
      let overTop=innerHeight;
      document.querySelectorAll('*').forEach(el=>{const cs=getComputedStyle(el);
        if(cs.position==='fixed'&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.1){
          const r=el.getBoundingClientRect();
          if(r.height>0&&r.top>innerHeight*0.5&&r.top<innerHeight) overTop=Math.min(overTop,r.top);}});
      return JSON.stringify({rects,overTop,scrollY});})()`));
    if (live.rects.length !== items.length) continue;   // DOM changed mid-audit: skip rather than mis-attribute

    const shot = await send("Page.captureScreenshot", { format: "png" });
    const img = decodePNG(Buffer.from(shot.data, "base64"));
    const minTop = live.scrollY < 2 ? 0 : 84;           // at 0 the header IS the top layer; audit it
    const maxBot = live.overTop;

    for (let n = 0; n < items.length; n++) {
      const it = items[n], r = live.rects[n];
      const key = it.sel + "|" + it.text;
      if (checked.has(key)) continue;
      if (r.w < 2 || r.h < 2) { why.set(key, "zero-size"); continue; }
      // A fixed overlay must not be sampled THROUGH - except its own subtree,
      // which is exactly what is being measured.
      if (!it.inFixed && r.y < minTop) { why.set(key, "under sticky header"); continue; }
      if (!it.inFixed && r.y + r.h > maxBot) { why.set(key, "behind bottom overlay"); continue; }
      if (it.inFixed && (r.y < -1 || r.y + r.h > H + 1)) { why.set(key, "fixed element off-screen here"); continue; }

      const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
      const x1 = Math.min(img.w - 1, Math.round(r.x + r.w)), y1 = Math.min(img.h - 1, Math.round(r.y + r.h));
      if (x1 <= x0 || y1 <= y0) { why.set(key, "outside viewport (translated off?)"); continue; }

      const px = [];
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
        const i = (y * img.w + x) * img.bpp;
        px.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
      }
      if (!px.length) continue;
      checked.add(key); why.delete(key);
      const medL = px.map(lum).sort((a, b) => a - b)[Math.floor(px.length / 2)];
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (const c of px) if (Math.abs(lum(c) - medL) < 0.03) { sr += c[0]; sg += c[1]; sb += c[2]; sn++; }
      const bg = sn ? [sr / sn, sg / sn, sb / sn] : px[0];
      const blend = (fg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));

      // A hollow outlined glyph (color: transparent + text-stroke) is painted by
      // the STROKE alone, so that is the only ink carrying contrast.
      let fg, note = "";
      if ((!it.color || it.color.a < 0.05) && it.stroke && it.stroke.a > 0.05) { fg = blend(it.stroke.rgb, it.stroke.a); note = " [stroke]"; }
      else fg = blend(it.color.rgb, it.color.a);

      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need - 0.005)
        fails.push({ sel: it.sel, text: it.text, ratio: +ratio.toFixed(2), need, size: it.size,
                     bg: "rgb(" + bg.map((v) => Math.round(v)).join(",") + ")", note });
    }
  }
  console.log("audited " + checked.size + " of " + items.length + " elements");
  const unscored = items.filter((it) => !checked.has(it.sel + "|" + it.text));
  if (unscored.length) {
    console.log("  " + unscored.length + " never scored:");
    unscored.forEach((it) => console.log("    " +
      (why.get(it.sel + "|" + it.text) || "never in a clean window").padEnd(30) +
      it.sel.padEnd(20) + '"' + it.text.slice(0, 46) + '"'));
  }
  if (fails.length) { console.log("\n" + fails.length + " CONTRAST FAILURE(S):"); console.log(JSON.stringify(fails, null, 1)); }
  else console.log("\n0 contrast failures (WCAG AA)");
  ws.close(); chrome.kill(); process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
