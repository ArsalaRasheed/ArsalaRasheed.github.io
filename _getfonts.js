/* ==========================================================================
   DEV ONLY — _getfonts.js
   --------------------------------------------------------------------------
   Self-hosts the two Google Fonts families so the live page makes **zero**
   third-party requests. That matters for three separate reasons:

     1. Security — `fonts.googleapis.com` is the only external origin the page
        currently trusts. Removing it lets the CSP read `default-src 'self'`
        with no exceptions, so an injected <script src="…evil…"> cannot load.
     2. Privacy — no request leaves the visitor's browser for Google.
     3. Speed / SEO — one less DNS lookup, TLS handshake and redirect before
        first paint, and it works even where fonts.gstatic.com is slow.

   Run:   node _getfonts.js

   It reads the same css2 URL the page used, keeps only the `latin` and
   `latin-ext` subsets (all copy on this page is Latin — a missing glyph falls
   back to the system font rather than breaking), downloads the .woff2 files
   into assets/fonts/, and rewrites `css/fonts.css` with local URLs.

   Swap the weight lists at the top if the design ever needs new weights.
   ========================================================================== */
"use strict";
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400..600" +
  "&family=Plus+Jakarta+Sans:wght@500..800&display=swap";

/* Gstatic only hands out woff2 to a browser UA — a default Node UA gets the
   legacy EOT/TTF build instead. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const KEEP = new Set(["latin", "latin-ext"]);
const ROOT = __dirname;
const FONT_DIR = path.join(ROOT, "assets", "fonts");
const CSS_OUT = path.join(ROOT, "css", "fonts.css");

function get(url, asBuffer, extraHeaders) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: Object.assign({ "User-Agent": UA }, extraHeaders || {}) },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            get(url.startsWith("http") ? res.headers.location : res.headers.location, asBuffer)
              .then(resolve, reject);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error("HTTP " + res.statusCode + " for " + url));
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve(asBuffer ? buf : buf.toString("utf8"));
          });
        }
      )
      .on("error", reject);
  });
}

(async () => {
  const css = await get(CSS_URL, false);

  // Each face is preceded by its subset name:  /* latin */ @font-face { … }
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  const kept = [];
  let m;

  while ((m = re.exec(css)) !== null) {
    const subset = m[1];
    const block = m[2];
    if (!KEEP.has(subset)) continue;

    const family = (block.match(/font-family:\s*['"]([^'"]+)['"]/) || [])[1];
    const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
    const url = (block.match(/url\((https:\/\/[^)]+)\)/) || [])[1];
    if (!family || !weight || !url) continue;

    const slug =
      family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    // Requested as weight *ranges*, so Google returns one variable file per
    // family+subset. Filenames deliberately omit the weight for the same
    // reason. The hash de-dupe below is a belt-and-braces guard: asking for
    // `400;500;600` instead returns three byte-identical files, which is how
    // this was caught the first time (582 KB instead of 178 KB).
    const file = `${slug}-${subset}.woff2`;
    kept.push({ family, weight, subset, url, file, block });
  }

  if (!kept.length) {
    console.error("  no @font-face blocks matched — css2 response changed?");
    process.exit(1);
  }

  fs.mkdirSync(FONT_DIR, { recursive: true });

  const byHash = new Map();
  let bytes = 0;
  for (const f of kept) {
    const buf = await get(f.url, true);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    if (byHash.has(hash)) {
      f.file = byHash.get(hash);
      console.log(`  ${f.file.padEnd(34)}   (identical to previous, reused)`);
      continue;
    }
    byHash.set(hash, f.file);
    fs.writeFileSync(path.join(FONT_DIR, f.file), buf);
    bytes += buf.length;
    console.log(
      `  ${f.file.padEnd(34)} ${String(Math.round(buf.length / 1024)).padStart(3)} KB`
    );
  }

  // Rewrite src to a path relative to css/fonts.css, and drop the Google
  // hostname from every remaining declaration.
  const out = [
    "/* ================================================================",
    "   GENERATED FILE — do not edit by hand.",
    "",
    "   Self-hosted copies of Inter and Plus Jakarta Sans so the page makes",
    "   no third-party requests (see `_getfonts.js`, run `node _getfonts.js`",
    "   to refresh after changing a weight).",
    "",
    "   Google's own `display=swap` value is preserved in each block, so a",
    "   font that is still downloading never blocks text from painting.",
    "   ================================================================ */",
    ""
  ];

  for (const f of kept) {
    const local = f.block.replace(
      /url\(https:\/\/[^)]+\)/,
      `url("../assets/fonts/${f.file}")`
    );
    out.push(`/* ${f.subset} */`);
    out.push(local);
    out.push("");
  }

  fs.writeFileSync(CSS_OUT, out.join("\n"));

  console.log(
    `  -> ${kept.length} faces, ${Math.round(bytes / 1024)} KB in assets/fonts/`
  );
  console.log(`  -> ${CSS_OUT}`);
})().catch((e) => {
  console.error("  FAILED:", e.message);
  process.exit(1);
});
