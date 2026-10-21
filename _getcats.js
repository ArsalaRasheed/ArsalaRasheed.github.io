/* Dev-only helper: download the client's own Shopify collection images for each
   landing-page category so they can be used instead of the placeholder glyphs.
   Run once; results land in %TEMP%\opencode\alpaints\cats\. */
"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT = path.join(process.env.TEMP, "opencode", "alpaints", "cats");
const BASE = "https://cdn.shopify.com/s/files/1/0769/2904/0576/collections/";

const ITEMS = [
  ["decorative", "image_a541b8df-567b-4ed6-a122-623df1ae51ba.png", "1788006906"],
  ["deco", "image_337f0836-6fe9-4b74-b30c-635e403404fa.png", "1788007181"],
  ["enamel", "image_bac34d5b-14e1-490f-acca-3c25a254f6c4.png", "1788007247"],
  ["2k", "image_9a18fdb6-74b7-4441-a7e4-2a035ad5441c.png", "1787560490"],
  ["hardeners", "image_c4edb019-ea07-41ae-a724-d2825ab0b96d.png", "1787560338"],
  ["clearcoats", "image_c48fcb08-059f-47a6-99b8-eb63ddf530b1.png", "1787560283"],
  ["primers", "image_01d96c78-a471-48f3-b678-7cfb172f46eb.png", "1787560588"],
  ["thinners", "image_e03d41d8-6f0f-45c4-bef6-77c771b46519.png", "1788092185"],
  ["sprayguns", "image_396c57aa-2767-449b-9676-57c5cf5cb3b0.png", "1787560648"],
  ["paintpens", "image_91e2de39-4047-4640-9d0c-f1b6b0130710.png", "1787560893"],
  ["accessories", "image_13f02fee-6cb4-4d15-b618-70c05da21355.png", "1787559892"]
];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ buf: Buffer.concat(chunks), type: res.headers["content-type"] }));
      })
      .on("error", reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, file, v] of ITEMS) {
    const url = `${BASE}${file}?v=${v}`;
    try {
      const { buf, type } = await get(url);
      const ext = (type && type.includes("jpeg")) ? "jpg" : "png";
      const out = path.join(OUT, `${name}.${ext}`);
      fs.writeFileSync(out, buf);
      console.log(`  ${name.padEnd(12)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${type}`);
    } catch (e) {
      console.log(`  ${name.padEnd(12)} FAILED ${e.message}`);
    }
  }
  console.log("  -> " + OUT);
})();
