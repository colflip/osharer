const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Get commit SHA for version display
let sha = "";
if (process.env.GIT_COMMIT) {
    sha = process.env.GIT_COMMIT;
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

    if (/id="version-text"[^>]*>[^<]*<\/span>/.test(html)) {
        html = html.replace(/id="version-text"[^>]*>[^<]*<\/span>/, `id="version-text">${shortSha}</span>`);
    } else {
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
