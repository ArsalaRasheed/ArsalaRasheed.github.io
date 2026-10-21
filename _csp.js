/* ==========================================================================
   DEV ONLY — _csp.js   |   node _csp.js  [width] [height]
   --------------------------------------------------------------------------
   Proves the Content-Security-Policy actually shipped in index.html does not
   break the page, and that the page makes no third-party requests.

   The other dev scripts turn CSP OFF (`Security.setBypassCSP`) because they
   inject a <style> tag to freeze transitions. This one deliberately keeps it
   ON — that is the whole point — and then listens to Chrome's own violation
   report. A CSP that is only ever tested with itself disabled is a CSP that
   has never been tested.

   Checks:
     • console / security violations Chrome reports while loading the page
     • both self-hosted fonts actually resolve (a bad path in fonts.css would
       silently fall back to a system font — still readable, still wrong)
     • the JSON-LD data block survives (it is injected by main.js; CSP must not
       treat type="application/ld+json" as a script)
     • the eight swatch chips still paint, having lost their inline style=""
     • every loaded <img> has real pixels
     • zero requests leave the origin
     • no inline event handlers crept back into the markup

   Output goes to %TEMP%\opencode\alpaints\ like the other tools.
   ========================================================================== */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9470;
const WEB = 3010;                 // served over http on purpose — CSP's `'self'`
                                  // is meaningless against a `file://` origin, so
                                  // auditing there would report phantoms
const W = Number(process.argv[2]) || 1440;
const H = Number(process.argv[3]) || 900;
const URL = `http://127.0.0.1:${WEB}/`;
const UD = path.join(os.tmpdir(), "opencode", "alpaints", "ud-csp");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });

  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: Object.assign({}, process.env, { PORT: String(WEB) })
  });
  let chrome = null;

  let ws, id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });

  const problems = [];
  const seen = [];
  const note = (s) => seen.push(s);

  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(URL, { method: "HEAD" }); break; } catch { await sleep(250); }
    }
    chrome = spawn(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
      "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD,
      "--window-size=" + W + "," + H, "about:blank"
    ], { stdio: "ignore" });

    for (let i = 0; i < 40; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page");
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);

      // Chrome's own report. CSP refusals land here, not in consoleAPICalled.
      if (m.method === "Log.entryAdded" && m.params && m.params.entry) {
        const en = m.params.entry;
        note(`${en.source}/${en.level}: ${en.text}`);
        if (en.level === "error" || en.level === "warning") problems.push(`[${en.source}] ${en.text}`);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params) {
        const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
        note(`console: ${txt}`);
        if (m.params.type === "error") problems.push(`[console] ${txt}`);
      }
      if (m.method === "Runtime.exceptionThrown" && m.params) {
        const d = m.params.exceptionDetails || {};
        problems.push(`[exception] ${d.text} ${(d.exception && d.exception.description) || ""}`);
      }

      if (m.id && pending.has(m.id)) {
        const q = pending.get(m.id); pending.delete(m.id);
        m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result);
      }
    });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    // NOTE: Security.setBypassCSP is deliberately NOT called here.

    const ev = async (x) => (await send("Runtime.evaluate", {
      expression: x, returnByValue: true, awaitPromise: true, timeout: 60000
    })).result.value;

    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 820 });
    await send("Page.navigate", { url: URL });
    await sleep(2600);

    // Scroll the page once so every lazy image has had its chance to load.
    await ev(`(async()=>{const H=document.documentElement.scrollHeight;
      for(let y=0;y<H;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}
      window.scrollTo(0,0);})()`);
    await sleep(900);

    const r = JSON.parse(await ev(`JSON.stringify((()=>({
      fonts: {
        inter: document.fonts.check("16px Inter"),
        jakarta: document.fonts.check('700 16px "Plus Jakarta Sans"'),
        loaded: [...document.fonts].map(f=>f.family+" "+f.weight+" "+f.status)
      },
      jsonLd: (()=>{const el=document.querySelector('script[type="application/ld+json"]');
        if(!el) return {present:false};
        try { const d=JSON.parse(el.textContent); return {present:true, type:d["@type"], name:d.name}; }
        catch(e){ return {present:true, parseError:e.message}; }})(),
      swatches: [...document.querySelectorAll('.swatches__chip')].map(c=>{
        const cs=getComputedStyle(c);
        return {bg: cs.backgroundColor, w: Math.round(c.getBoundingClientRect().width)};}),
      imgs: (()=>{const a=[...document.images];
        return {total:a.length, broken:a.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.getAttribute('src'))};})(),
      resources: performance.getEntriesByType('resource').map(e=>e.name),
      inlineHandlers: [...document.querySelectorAll('*')]
        .filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length,
      inlineStyles: document.querySelectorAll('[style]').length,
      csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content || null
    }))())`));

    console.log(`=== CSP — ${W}x${H} ===\n`);

    console.log("policy");
    console.log("  " + (r.csp ? r.csp.replace(/; ?/g, "\n  ") : "MISSING"));
    console.log();

    console.log("fonts");
    console.log("  Inter              " + (r.fonts.inter ? "loaded" : "FAILED — falling back to system font"));
    console.log("  Plus Jakarta Sans  " + (r.fonts.jakarta ? "loaded" : "FAILED — falling back to system font"));
    if (!r.fonts.inter) problems.push("Inter did not load (css/fonts.css path or @font-face)");
    if (!r.fonts.jakarta) problems.push("Plus Jakarta Sans did not load (css/fonts.css path or @font-face)");
    console.log();

    console.log("structured data");
    console.log("  " + (r.jsonLd.present
      ? (r.jsonLd.parseError ? "PARSE ERROR " + r.jsonLd.parseError : `${r.jsonLd.type} "${r.jsonLd.name}"`)
      : "MISSING — CSP may be treating the data block as a script"));
    if (!r.jsonLd.present) problems.push("JSON-LD block missing");
    if (r.jsonLd.parseError) problems.push("JSON-LD parse error: " + r.jsonLd.parseError);
    console.log();

    const swatchBad = r.swatches.filter(s => s.bg === "rgba(0, 0, 0, 0)" || s.w === 0);
    console.log("swatch chips (inline style=\"\" removed for CSP)");
    console.log("  " + (r.swatches.length === 8
      ? (swatchBad.length ? "FAILED — " + swatchBad.length + " unpainted" : "8 of 8 painted")
      : "found " + r.swatches.length + ", expected 8"));
    if (r.swatches.length !== 8) problems.push("expected 8 swatch chips, found " + r.swatches.length);
    if (swatchBad.length) problems.push(swatchBad.length + " swatch chips painted nothing");
    console.log();

    console.log("images");
    console.log("  " + r.imgs.total + " in document, " + r.imgs.broken.length + " broken");
    if (r.imgs.broken.length) problems.push("broken images: " + r.imgs.broken.join(", "));
    console.log();

    const offOrigin = r.resources.filter(u => /^https?:/.test(u) && !u.startsWith(`http://127.0.0.1:${WEB}`));
    console.log("third-party requests");
    console.log("  " + (offOrigin.length ? offOrigin.join("\n  ") : "none — every request stays on the origin"));
    if (offOrigin.length) problems.push(offOrigin.length + " third-party request(s) made");
    console.log();

    console.log("inline handlers / style attributes");
    console.log("  handlers " + r.inlineHandlers + "   style attributes " + r.inlineStyles);
    if (r.inlineHandlers) problems.push(r.inlineHandlers + " inline event handler(s) present — CSP script-src would block them");
    console.log();

    console.log("=== RESULT ===");
    if (problems.length) {
      problems.forEach(p => console.log("  FAIL  " + p));
      console.log(`\n  ${problems.length} problem(s). Chrome log:\n`);
      seen.slice(0, 25).forEach(s => console.log("    " + s));
    } else {
      console.log("  OK — policy enforced, nothing broken, no third-party requests.");
    }
  } finally {
    try { chrome && chrome.kill(); } catch {}
    try { srv.kill(); } catch {}
  }
})();
