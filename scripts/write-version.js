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

const appId = process.env.AGORA_APP_ID || "";
const config = {
    APP_ID: appId,
    GITHUB_REPO: "colflip/sharer",
    AGORA_SDK_SOURCES: [
        "vendor/AgoraRTC_N-4.23.1.js",
        "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
    ]
};

const configDir = path.join(__dirname, "..", "assets", "js");
const configPath = path.join(configDir, "config.js");
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(configPath, `window.ScreenCastConfig = ${JSON.stringify(config, null, 4)};\n`);

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
        // No .git directory available
        sha = "";
    }
}

const versionPayload = {
    sha: sha || "",
    shortSha: (sha || "").slice(0, 7),
    source: process.env.RENDER_GIT_COMMIT ? "render" : "local",
    buildTime: new Date().toISOString()
};

const versionDir = path.join(__dirname, "..", "assets");
const versionPath = path.join(versionDir, "version.json");
fs.mkdirSync(versionDir, { recursive: true });
fs.writeFileSync(versionPath, `${JSON.stringify(versionPayload, null, 2)}\n`);
