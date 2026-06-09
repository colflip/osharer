// Render Static Site build step: read AGORA_APP_ID from env, write config.json.
// Also writes assets/version.json with the current git commit SHA.
// Runs once per deploy; the resulting files ship with the static bundle.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const appId = process.env.AGORA_APP_ID || "";
if (!appId) {
    console.error("AGORA_APP_ID is not set. Aborting build.");
    process.exit(1);
}

// Write config.json
const outPath = path.join(__dirname, "..", "config.json");
fs.writeFileSync(outPath, JSON.stringify({ appId }) + "\n");
console.log(`Wrote ${outPath} (appId length: ${appId.length})`);

// Write assets/version.json with current git commit SHA
const versionDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(versionDir, { recursive: true });

let shortSha = "";
try {
    shortSha = execSync("git rev-parse --short=7 HEAD", {
        cwd: path.join(__dirname, ".."),
        encoding: "utf-8",
    }).trim();
} catch (e) {
    // Not a git repo or git unavailable; skip version writing
    shortSha = "unknown";
}

const versionPayload = {
    sha: shortSha,
    shortSha: shortSha,
    buildTime: Date.now()
};
const versionPath = path.join(versionDir, "version.json");
fs.writeFileSync(versionPath, JSON.stringify(versionPayload, null, 2) + "\n");
console.log(`Wrote ${versionPath} (version: ${shortSha})`);
