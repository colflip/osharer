const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function loadLocalEnv() {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadLocalEnv();

// Use AGORA_APP_ID from env if set, otherwise fall back to a placeholder
// so local HTML opens work without needing a build step
const AGORA_DEFAULT_APP_ID = "YOUR_AGORA_APP_ID";
const appId = process.env.AGORA_APP_ID || AGORA_DEFAULT_APP_ID;
const config = {
    APP_ID: appId,
    GITHUB_REPO: "colflip/osharer",
    AGORA_SDK_SOURCES: [
        "vendor/AgoraRTC_N-4.23.1.js",
        "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
    ]
};

const configDir = path.join(__dirname, "..", "assets", "js");
const configPath = path.join(configDir, "config.js");
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(configPath, `window.oSharerConfig = ${JSON.stringify(config, null, 4)};\n`);

// Get commit SHA
let sha = "";
if (process.env.RENDER_GIT_COMMIT) {
    sha = process.env.RENDER_GIT_COMMIT;
} else {
    try {
        sha = execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
            cwd: path.join(__dirname, "..")
        }).trim();
    } catch (err) {
        sha = "";
    }
}

const shortSha = (sha || "").slice(0, 7);

// Replace existing <span id="version-text">...</span> before </body>, or add one
function injectVersionIntoHtml(htmlPath) {
    if (!fs.existsSync(htmlPath)) return;
    let html = fs.readFileSync(htmlPath, "utf8");
    const versionTag = `<span class="version-text" id="version-text">${shortSha}</span>`;

    // Try to replace existing version-text element
    if (/id="version-text"[^>]*>[^<]*<\/span>/.test(html)) {
        html = html.replace(/id="version-text"[^>]*>[^<]*<\/span>/, `id="version-text">${shortSha}</span>`);
    } else {
        // No existing element, inject before </body>
        html = html.replace("</body>", versionTag + "</body>");
    }
    fs.writeFileSync(htmlPath, html);
}

injectVersionIntoHtml(path.join(__dirname, "..", "sharer.html"));
injectVersionIntoHtml(path.join(__dirname, "..", "index.html"));

// version.json with buildTime for cache-busting
const versionPayload = {
    sha: sha || "",
    shortSha: shortSha,
    buildTime: Date.now()
};
const versionDir = path.join(__dirname, "..", "assets");
const versionPath = path.join(versionDir, "version.json");
fs.mkdirSync(versionDir, { recursive: true });
fs.writeFileSync(versionPath, `${JSON.stringify(versionPayload, null, 2)}\n`);

console.log(`Version injected: ${shortSha}`);
