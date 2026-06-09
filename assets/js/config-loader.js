// Dynamically load AGORA_APP_ID at runtime.
// No build step needed. The project is now pure static HTML.
//
// Priority:
//   1. URL parameter (?app_id=xxx) — most flexible, works everywhere
//   2. Hardcoded default (set via write-version.js or edit directly)
//
// For local development without build:
//   - Open via browser: http://localhost:4173/sharer.html?app_id=YOUR_APP_ID
//   - Or edit the DEFAULT_APP_ID below with your real APP_ID

(function loadConfig() {
    var appId = "";

    // 1. URL query parameter (?app_id=xxx)
    var params = new URLSearchParams(window.location.search);
    appId = params.get("app_id");

    // 2. Local dev: try to read .env via fetch (works with any static server)
    if (!appId) {
        fetch(".env?t=" + Date.now(), { cache: "no-store" })
            .then(function (r) {
                if (!r.ok) throw new Error();
                return r.text();
            })
            .then(function (text) {
                var match = text.match(/^AGORA_APP_ID\s*=\s*(.+)/im);
                if (match) {
                    appId = match[1].trim().replace(/^["']|["']$/g, "");
                }
                applyConfig(appId);
            })
            .catch(function () {
                applyConfig(appId);
            });
        return; // async, skip step 3
    }

    applyConfig(appId);

    function applyConfig(id) {
        // Default APP_ID — edit this if you don't want to use ?app_id= or .env
        var DEFAULT_APP_ID = "YOUR_AGORA_APP_ID";
        var finalAppId = id || DEFAULT_APP_ID;

        window.oSharerConfig = {
            APP_ID: finalAppId,
            GITHUB_REPO: "colflip/osharer",
            AGORA_SDK_SOURCES: [
                "vendor/AgoraRTC_N-4.23.1.js",
                "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
            ]
        };
    }
})();
