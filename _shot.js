/* ============================================================ DEV ONLY
   _shot.js — viewport screenshots via headless Chrome over CDP.

   Not part of the deployable site (see README, "Development files").

     node _shot.js <width> <height> <selector,selector,...>

   Example:
     node _shot.js 1440 900 .hero,#products,#why-us
     node _shot.js 390 844 .hero,#products,#how-it-works

   Writes <width>x<height>-<label>.jpg into %TEMP%\opencode\alpaints\

   Why not `chrome --screenshot`: that only grabs the first viewport, and this
   page needs to be checked section by section with its sticky header in place.
   ============================================================== */
"use strict";

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const WEB_PORT = 9460; // static server for this repo
const CDP_PORT = 9461; // chrome remote debugging
const OUT_DIR = path.join(process.env.TEMP, "opencode", "alpaints");
const ROOT = __dirname;

const [, , wArg, hArg, selArg] = process.argv;
const W = parseInt(wArg, 10) || 1440;
const H = parseInt(hArg, 10) || 900;
const SELECTORS = (selArg || ".hero").split(",").map((s) => s.trim()).filter(Boolean);
const MOBILE = W < 800;

/* ---------------------------------------------------------- static server */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function serve() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      fs.readFile(file, (err, buf) => {
        if (err) return res.writeHead(404).end("not found");
        res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(buf);
      });
    });
    srv.on("error", reject);
    srv.listen(WEB_PORT, "127.0.0.1", () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });
}

/* ------------------------------------------------------------ tiny CDP lib */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let seq = 0;
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = async (method, params) => {
    await ready;
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => ws.close(), ready };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const srv = await serve().catch((e) => {
    if (e.code === "EADDRINUSE") return null; // a previous run is still serving
    throw e;
  });

  const profile = path.join(process.env.TEMP, "opencode", "alpaints", ".chrome-profile");
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      "about:blank"
    ],
    { stdio: "ignore", windowsHide: true }
  );

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = JSON.parse(await get(`http://127.0.0.1:${CDP_PORT}/json/list`));
      target = list.find((t) => t.type === "page");
    } catch (_) {}
  }
  if (!target) throw new Error("could not reach Chrome DevTools");

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: MOBILE,
    screenWidth: W,
    screenHeight: H
  });

  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${WEB_PORT}/index.html` });
  await sleep(1200);

  /* wait for webfonts + every image, so screenshots never show a fallback face
     or an unloaded logo as if it were the real result */
  await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      try { await within(document.fonts.ready, 3000); } catch (e) {}
      // Lazy images below the fold never fire load, so every wait is bounded.
      const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(i => i.complete ? null : within(new Promise(r => {
        i.addEventListener('load', r, { once: true });
        i.addEventListener('error', r, { once: true });
      }), 1500)));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return true;
    })()`
  });

  for (const sel of SELECTORS) {
    const label = sel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const moved = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        // smooth scrolling (html { scroll-behavior: smooth }) would still be
        // mid-flight when the screenshot is taken, so force an instant jump
        const html = document.documentElement;
        const prev = html.style.scrollBehavior;
        html.style.scrollBehavior = "auto";
        const y = el.getBoundingClientRect().top + window.scrollY - 64;
        window.scrollTo(0, Math.max(0, y));
        html.style.scrollBehavior = prev;
        // clamped near the page bottom is still a valid landing position
        return el.getBoundingClientRect().top < window.innerHeight * 0.5;
      })()`
    });
    if (!moved.result.value) {
      console.log("  SKIP  " + sel + "  (not found or did not land)");
      continue;
    }
    await sleep(1300); // let reveal-on-scroll transitions finish

    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    const file = path.join(OUT_DIR, `${W}x${H}-${label}.jpg`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("  OK    " + file);
  }

  cdp.close();
  chrome.kill();
  if (srv) srv.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("SHOT FAILED:", e.message);
  process.exit(1);
});
