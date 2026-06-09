// Render Static Site build step: read AGORA_APP_ID from env, write config.json.
// Runs once per deploy; the resulting config.json ships with the static bundle.
const fs = require("fs");
const path = require("path");

const appId = process.env.AGORA_APP_ID || "";
if (!appId) {
    console.error("AGORA_APP_ID is not set. Aborting build.");
    process.exit(1);
}

const outPath = path.join(__dirname, "..", "config.json");
fs.writeFileSync(outPath, JSON.stringify({ appId }) + "\n");
console.log(`Wrote ${outPath} (appId length: ${appId.length})`);
