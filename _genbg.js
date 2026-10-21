/* Generates assets/img/hero-bg.jpg — a 2400x1200 abstract backdrop for the hero.

   WHY A FILE INSTEAD OF PURE CSS: the hero needs several heavily-blurred colour
   fields overlapping at once. In CSS that means a dozen live blur filters running
   behind the headline on every repaint; as one baked JPEG it is a single smooth
   image, and gradient artwork like this compresses to well under 200 KB.

   Composition rule baked in here: the LEFT side is deliberately darker. That is
   what lets the white headline sit on it without a heavy CSS scrim. If you move
   the text, move the vignette. */
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", PORT = 9550;
const UD = path.join(process.env.TEMP, "opencode", "cdp-bg-" + process.pid);
const OUT = path.join(__dirname, "assets", "img", "hero-bg.jpg");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// x/y are % of the 2400x1200 canvas; blur is in px at that scale.
const BLOBS = [
  { x: 2,  y: -18, w: 1320, h: 1020, c: "rgba(24, 72, 132, 0.90)", blur: 170 }, // royal blue, upper-left
  { x: 53, y: -28, w: 1560, h: 1220, c: "rgba(46, 111, 196, 0.80)", blur: 190 }, // steel blue, upper-right
  { x: 76, y: 32,  w: 1020, h: 900,  c: "rgba(197, 136, 62, 0.34)", blur: 180 }, // warm amber
  { x: 50, y: 58,  w: 1120, h: 900,  c: "rgba(28, 116, 110, 0.30)", blur: 180 }, // teal
  { x: -12, y: 52, w: 1260, h: 960,  c: "rgba(9, 34, 66, 0.95)",    blur: 180 }, // deep navy, lower-left
  { x: 28, y: -14, w: 940,  h: 720,  c: "rgba(125, 178, 238, 0.26)", blur: 165 }, // soft highlight
  { x: 88, y: -8,  w: 720,  h: 620,  c: "rgba(163, 205, 248, 0.22)", blur: 150 }, // rim light
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{width:2400px;height:1200px;overflow:hidden;position:relative;
       background:linear-gradient(150deg,#050d19 0%,#071426 55%,#050e1c 100%)}
  .blob{position:absolute;border-radius:50%}
  /* Darkens the left third where the headline lives, and adds a soft vignette
     so the field never reads as a flat wash. */
  .vignette{position:absolute;inset:0;
    background:
      radial-gradient(115% 100% at 16% 42%, rgba(3,8,17,.80) 0%, rgba(3,8,17,.30) 42%, rgba(3,8,17,0) 68%),
      radial-gradient(135% 120% at 50% 50%, rgba(3,8,17,0) 55%, rgba(3,8,17,.42) 100%)}
</style></head><body>
${BLOBS.map((b) => `<div class="blob" style="left:${b.x}%;top:${b.y}%;width:${b.w}px;height:${b.h}px;background:radial-gradient(circle,${b.c} 0%,rgba(0,0,0,0) 68%);filter:blur(${b.blur}px)"></div>`).join("\n")}
  <div class="vignette"></div>
</body></html>`;

(async () => {
  const tmp = path.join(UD + "-page.html");
  fs.mkdirSync(UD, { recursive: true });
  fs.writeFileSync(tmp, html);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD, "--window-size=2400,1200", "about:blank"],
    { stdio: "ignore" });
  let ws, id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id;
    pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  for (let i = 0; i < 40; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
  const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page");
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id);
      m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 2400, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "file:///" + tmp.replace(/\\/g, "/") });
  await sleep(3000);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86,
    clip: { x: 0, y: 0, width: 2400, height: 1200, scale: 1 } });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("hero-bg.jpg ->", (fs.statSync(OUT).size / 1024).toFixed(0) + " KB");
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
