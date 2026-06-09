const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4173;
const ROOT = path.join(__dirname, "..");

// Read .env
let app_id = "";
const envPath = path.join(ROOT, ".env");
try {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "AGORA_APP_ID") app_id = value;
    }
} catch (e) {
    // No .env
}

const contentTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
    let url = req.url.split("?")[0];
    if (url === "/") url = "/sharer.html";

    let filePath = path.join(ROOT, url);
    filePath = path.normalize(filePath);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        let body = data.toString();

        // Inject AGORA_APP_ID from .env into HTML files
        if (ext === ".html" && app_id) {
            body = body.replace(/YOUR_AGORA_APP_ID/g, app_id);
        }

        // Cache bust for version.json
        if (ext === ".json" && path.basename(filePath) === "version.json") {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }

        res.writeHead(200, { "Content-Type": contentType });
        res.end(body);
    });
});

server.listen(PORT, () => {
    console.log(`oSharer server running at http://localhost:${PORT}/`);
    console.log(`APP_ID from .env: ${app_id ? "yes" : "no (using placeholder)"}`);
});
