const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let sha = "";
try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        cwd: path.join(__dirname, "..")
    }).trim();
} catch (err) {
    sha = "";
}

const shortSha = (sha || "").slice(0, 7);

function injectVersionIntoHtml(htmlPath) {
    if (!fs.existsSync(htmlPath)) return;
    let html = fs.readFileSync(htmlPath, "utf8");
    const versionTag = `<span class="version-text" id="version-text">${shortSha}</span>`;
    if (/id="version-text"[^>]*>[^<]*<\/span>/.test(html)) {
        html = html.replace(/id="version-text"[^>]*>[^<]*<\/span>/, `id="version-text">${shortSha}</span>`);
    } else {
        html = html.replace("</body>", versionTag + "</body>");
    }
    fs.writeFileSync(htmlPath, html);
}

injectVersionIntoHtml(path.join(__dirname, "..", "sharer.html"));
injectVersionIntoHtml(path.join(__dirname, "..", "index.html"));

const versionPayload = { sha: sha || "", shortSha: shortSha, buildTime: Date.now() };
const versionDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(versionDir, { recursive: true });
fs.writeFileSync(path.join(versionDir, "version.json"), `${JSON.stringify(versionPayload, null, 2)}\n`);

console.log(`Version: ${shortSha}`);
