// oSharer 应用服务器：静态文件 + Token 签发接口。
// Render Web Service 与本地开发共用这一份代码，保证两处行为一致。
// Vercel 走 api/token.js，同样复用 api/_token-core.js 的签发逻辑。

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const MAX_BODY_BYTES = 8 * 1024;

// 本地开发从 .env 读取；生产环境由平台注入，已存在的环境变量优先。
// 必须早于任何配置读取执行。
(function loadDotEnv() {
    try {
        const lines = fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf("=");
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            if (!(key in process.env)) process.env[key] = value;
        }
    } catch (e) {
        // 没有 .env 文件是正常的（生产环境）
    }
})();

const { issueToken } = require("./api/_token-core");
const PORT = process.env.PORT || 4173;

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
};

// 这份代码现在跑在公网上，必须挡住密钥与服务端源码。
// 任何以 . 开头的路径段（.env / .git）以及服务端目录一律拒绝。
function isBlockedPath(url) {
    if (url.split("/").some((seg) => seg.startsWith("."))) return true;
    return ["/api/", "/scripts/", "/node_modules/"].some((p) => url.startsWith(p));
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("payload too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
            } catch (e) {
                reject(e);
            }
        });
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = req.url.split("?")[0];

    // ===== Token 签发 =====
    if (url === "/api/token") {
        if (req.method !== "POST") {
            sendJson(res, 405, { error: "method not allowed" });
            return;
        }
        let body;
        try {
            body = await readJsonBody(req);
        } catch (e) {
            sendJson(res, 400, { error: "invalid request body" });
            return;
        }
        const result = issueToken(body);
        sendJson(res, result.status, result.body);
        return;
    }

    // ===== 运行时配置（沿用原 serve.js：优先读文件，回退环境变量）=====
    if (req.method === "GET" && url === "/config.json") {
        const localConfigPath = path.join(ROOT, "config.json");
        let appId = process.env.AGORA_APP_ID || "";
        try {
            if (fs.existsSync(localConfigPath)) {
                appId = JSON.parse(fs.readFileSync(localConfigPath, "utf8")).appId || appId;
            }
        } catch (e) {
            // 配置文件损坏时退回环境变量
        }
        sendJson(res, appId ? 200 : 404, { appId });
        return;
    }

    // ===== 静态文件 =====
    if (isBlockedPath(url)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    const filePath = path.normalize(path.join(ROOT, url === "/" ? "/sharer.html" : url));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const headers = { "Content-Type": contentTypes[ext] || "application/octet-stream" };
        if (path.basename(filePath) === "version.json") {
            headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        }
        res.writeHead(200, headers);
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`oSharer running at http://localhost:${PORT}/`);
    console.log(`APP_ID: ${process.env.AGORA_APP_ID ? "configured" : "not set"}`);
    console.log(
        `Token mode: ${process.env.AGORA_APP_CERTIFICATE ? "dynamic (certificate configured)" : "static (no certificate)"}`
    );
});
