/* ==========================================================================
   AL-KHAN PAINTS — Local development server
   --------------------------------------------------------------------------
   Zero dependencies. This project has no build step, so this is just a
   static file server so you can:

     • view the page at http://localhost:3000
     • open it on your phone over Wi-Fi (your LAN IP is printed on start)
     • test WhatsApp links on a real device before going live

   Usage:
     npm run dev     → http://localhost:3000
     PORT=8080 npm run dev
   ========================================================================== */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0"; // 0.0.0.0 so a phone on the same Wi-Fi can connect

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad Request");
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  // Resolve inside ROOT only — blocks ../ path traversal.
  const filePath = path.resolve(ROOT, "." + urlPath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1><p>Not found. Available: /index.html</p>");
      return;
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      // Always serve fresh files while developing.
      "Cache-Control": "no-store, max-age=0"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const lan = lanAddress();
  // Plain ASCII: the Windows console codepage mangles em-dashes / emoji.
  console.log("\n  AL-KHAN PAINTS - landing page is running\n");
  console.log("  On this computer :  http://localhost:" + PORT);
  if (lan) {
    console.log("  On your phone    :  http://" + lan + ":" + PORT);
    console.log("                    (phone must be on the SAME Wi-Fi)");
  }
  console.log("\n  Press Ctrl+C to stop.\n");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("\n  Port " + PORT + " is already in use.");
    console.error("  Try:  PORT=3001 npm run dev\n");
  } else {
    console.error(err);
  }
  process.exit(1);
});