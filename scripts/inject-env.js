const fs = require("fs");
const path = require("path");

let appId = process.env.AGORA_APP_ID || "";
const args = process.argv.slice(2);
for (const arg of args) {
    if (arg.startsWith("app=")) { appId = arg.slice(4); break; }
}
if (!appId) {
    const envPath = path.join(__dirname, "..", ".env");
    try {
        const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf("=");
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            let value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            if (key === "AGORA_APP_ID") { appId = value; break; }
        }
    } catch (e) {}
}

const placeholder = "__AGORA_APP_ID_VALUE__";
const files = ["sharer.html", "index.html"];
for (const file of files) {
    const filePath = path.join(__dirname, "..", file);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes(placeholder)) {
        content = content.replace(placeholder, appId || placeholder);
        fs.writeFileSync(filePath, content);
    }
}

if (appId) console.log(`Injected: ${appId}`);
else console.log("No AGORA_APP_ID found, HTML keeps placeholder.");
