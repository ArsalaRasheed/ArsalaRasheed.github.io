/* ==========================================================================
   DEV ONLY — _live.js   |   node _live.js [url]
   --------------------------------------------------------------------------
   Production smoke test. Runs a real headless Chrome against the DEPLOYED
   site (default https://info.alkhanpaints.com/) and answers the only
   question that matters after a push: does the live page actually work?

   It is the complement to `_csp.js`. `_csp.js` audits the local build against
   a local server — that is where markup and policy are developed. This one
   re-runs the assertions over HTTPS, because a green local build proves
   nothing about what the host actually publishes: GitHub Pages runs Jekyll
   over these files, and only the published output counts.

   Production-only checks it covers: the canonical link (injected by main.js
   once canonicalUrl is set, so it never appears in the raw HTML), the JSON-LD
   `url`/`image`, and that the live page still makes zero third-party requests.

   Note on style: the page-side probes below are deliberately many tiny
   expressions rather than one big returned object. They are individually
   readable, and when one fails the exception names it.
   ========================================================================== */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9490;
const TARGET = (process.argv[2] || "https://info.alkhanpaints.com/").replace(/[^/]$/, "$&/");
const UD = path.join(os.tmpdir(), "opencode", "alpaints", "ud-live");
const EXPECT_NUMBER = "923498272533";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD,
    "--window-size=1440,900", "about:blank"
  ], { stdio: "ignore" });

  const problems = [];
  const log = [];

  try {
    for (let i = 0; i < 40; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page");
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));

    let id = 0; const pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.method === "Log.entryAdded" && m.params && m.params.entry) {
        const en = m.params.entry;
        log.push(`${en.source}/${en.level}: ${en.text}`);
        if (en.level === "error" || en.level === "warning") problems.push(`[${en.source}] ${en.text}`);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error") {
        const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
        log.push("console: " + txt);
        problems.push("[console] " + txt);
      }
      if (m.method === "Runtime.exceptionThrown" && m.params) {
        problems.push("[exception] " + ((m.params.exceptionDetails || {}).text || "thrown"));
      }
      if (m.id && pending.has(m.id)) {
        const q = pending.get(m.id); pending.delete(m.id);
        m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result);
      }
    });

    const send = (m, p = {}) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });

    /* Evaluate a small expression and return its value. Page-side exceptions
       surface here with the source text, rather than as a silent undefined. */
    const ev = async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true, timeout: 60000
      });
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || "unknown page error");
      }
      return res.result && res.result.value;
    };
    /* Same, but for arrays/objects: serialise in the page, parse here. */
    const ej = async (expression) => JSON.parse(await ev("JSON.stringify(" + expression + ")"));

    const META = (sel) => "(document.querySelector('" + sel + "')||{}).content||''";

    await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
    await send("Page.navigate", { url: TARGET });
    await sleep(4000);

    // Walk the page once so every lazy image has had its chance to load.
    await ev(`(async function(){var H=document.documentElement.scrollHeight;for(var y=0;y<H;y+=700){window.scrollTo(0,y);await new Promise(function(r){setTimeout(r,50);});}window.scrollTo(0,0);})()`);
    await sleep(1200);

    const g = {};
    g.protocol = await ev("location.protocol");
    g.origin = await ev("location.origin");
    g.title = await ev("document.title");
    g.desc = await ev(META('meta[name="description"]'));
    g.lang = await ev("document.documentElement.lang");
    g.h1 = await ej('Array.prototype.map.call(document.querySelectorAll("h1"),function(h){return h.textContent.trim();})');
    g.canonical = await ev("(document.querySelector('link[rel=\"canonical\"]')||{}).href||''");
    g.csp = await ev(META('meta[http-equiv="Content-Security-Policy"]'));
    g.ogUrl = await ev(META('meta[property="og:url"]'));
    g.ogImage = await ev(META('meta[property="og:image"]'));
    g.twImage = await ev(META('meta[name="twitter:image"]'));
    g.fontInter = await ev('document.fonts.check("16px Inter")');
    g.fontJakarta = await ev('document.fonts.check("700 16px \\"Plus Jakarta Sans\\"")');
    g.jsonLd = await ej('(function(){var e=document.querySelector(\'script[type="application/ld+json"]\');if(!e)return null;var d=JSON.parse(e.textContent);return {type:d["@type"],name:d.name,url:d.url||"",image:d.image||"",hasMap:!!d.hasMap};})()');
    g.imgTotal = await ev("document.images.length");
    g.imgBroken = await ej('Array.prototype.filter.call(document.images,function(i){return i.complete&&i.naturalWidth===0;}).map(function(i){return i.getAttribute("src");})');
    g.resources = await ej('performance.getEntriesByType("resource").map(function(e){return e.name;})');
    g.waCount = await ev('document.querySelectorAll(\'a[href*="wa.me"], a[href*="api.whatsapp"]\').length');
    g.waBad = await ev('Array.prototype.filter.call(document.querySelectorAll(\'a[href*="wa.me"], a[href*="api.whatsapp"]\'),function(a){return a.href.indexOf("' + EXPECT_NUMBER + '")===-1;}).length');
    g.inlineHandlers = await ev('Array.prototype.filter.call(document.querySelectorAll("*"),function(e){return Array.prototype.some.call(e.attributes,function(a){return /^on/i.test(a.name);});}).length');

    console.log("=== LIVE — " + TARGET + " ===\n");
    const row = (ok, label, detail) => {
      console.log("  " + (ok ? "OK  " : "FAIL") + "  " + label.padEnd(25) + (detail || ""));
      if (!ok) problems.push(label + (detail ? " — " + detail : ""));
    };

    row(g.protocol === "https:", "https", g.protocol);
    row(!!g.title, "title", g.title);
    row(!!g.desc, "meta description", (g.desc || "").slice(0, 54) + "…");
    row(!!g.lang, "lang", g.lang);
    row(g.h1.length === 1, "single h1", JSON.stringify(g.h1[0] || null));
    row(!!g.canonical, "canonical link", g.canonical);
    row(!!g.ogUrl, "og:url", g.ogUrl);
    row(/^https:\/\//.test(g.ogImage), "og:image absolute", g.ogImage);
    row(/^https:\/\//.test(g.twImage), "twitter:image absolute", g.twImage);
    row(!!g.csp, "CSP meta", g.csp ? (g.csp.match(/script-src [^;]+/) || [""])[0] : "");
    row(g.fontInter, "font Inter");
    row(g.fontJakarta, "font Plus Jakarta");
    row(g.imgTotal > 0 && g.imgBroken.length === 0, "images",
        g.imgTotal + " total, " + g.imgBroken.length + " broken" + (g.imgBroken.length ? " (" + g.imgBroken.join(", ") + ")" : ""));
    row(!!g.jsonLd && !!g.jsonLd.type, "JSON-LD",
        g.jsonLd ? g.jsonLd.type + " " + JSON.stringify(g.jsonLd.name) +
                   "  url=" + (g.jsonLd.url ? "yes" : "MISSING") +
                   "  image=" + (g.jsonLd.image ? "yes" : "MISSING") +
                   "  hasMap=" + g.jsonLd.hasMap : "missing");
    row(g.inlineHandlers === 0, "no inline handlers", String(g.inlineHandlers));

    const off = g.resources.filter((u) => /^https?:/.test(u) && !u.startsWith(g.origin));
    row(off.length === 0, "zero third-party", off.length ? off.join(", ") : "");
    row(g.waCount > 0 && g.waBad === 0, "WhatsApp CTAs",
        g.waCount + " links, " + g.waBad + " pointing at the wrong number");

    console.log("\n=== RESULT ===");
    if (problems.length) {
      problems.forEach((p) => console.log("  FAIL  " + p));
      console.log("\n  " + problems.length + " problem(s). Browser log:\n");
      log.slice(0, 20).forEach((s) => console.log("    " + s));
      process.exitCode = 1;
    } else {
      console.log("  OK — deployed page is live, indexable and working.");
    }
  } finally {
    try { chrome.kill(); } catch {}
  }
})();
