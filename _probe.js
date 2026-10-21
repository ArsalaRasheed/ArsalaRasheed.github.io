/* DEV ONLY — _probe.js
   Prints the CDP method names this Chrome build actually exposes that mention
   "CSP" or "Bypass". Written because `Security.setBypassCSP` was reported as
   "wasn't found" by _contrast.js, and guessing CDP method names wastes more
   time than listing them.

   Usage: node _probe.js [searchText]   (default "CSP")
   Delete it after: it answers one question and nothing else.            */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9480;
const UD = path.join(os.tmpdir(), "opencode", "alpaints", "ud-probe");
const needle = (process.argv[2] || "CSP").toLowerCase();

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + UD, "about:blank"
  ], { stdio: "ignore" });

  try {
    for (let i = 0; i < 40; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
      catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    const proto = await (await fetch(`http://127.0.0.1:${PORT}/json/protocol`)).json();

    console.log(`Chrome: ${(await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).Browser}\n`);
    console.log(`methods matching "${needle}":`);
    let n = 0;
    for (const dom of proto.domains || []) {
      for (const m of dom.commands || []) {
        const full = `${dom.domain}.${m.name}`;
        if (full.toLowerCase().includes(needle)) { console.log(`  ${full}`); n++; }
      }
    }
    console.log(n ? `  (${n} total)` : "  NONE FOUND");

    const sec = (proto.domains || []).find((d) => d.domain === "Security");
    console.log(`\nSecurity domain commands:`);
    ((sec && sec.commands) || []).forEach((c) => console.log(`  Security.${c.name}`));
    if (!sec) console.log("  (Security domain not exposed at all)");
  } finally {
    try { chrome.kill(); } catch {}
  }
})();
