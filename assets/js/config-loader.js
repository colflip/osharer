// Load AGORA_APP_ID at runtime.
// - Reads from a JSON config file served by the server
// - Falls back to .env file fetch (local dev)
// - No build step, no deployment script needed

(function loadConfig() {
    var appId = "";

    function applyConfig(id) {
        window.oSharerConfig = {
            APP_ID: id || "YOUR_AGORA_APP_ID",
            GITHUB_REPO: "colflip/osharer",
            AGORA_SDK_SOURCES: [
                "vendor/AgoraRTC_N-4.23.1.js",
                "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
            ]
        };
    }

    // 1. Try to fetch config from /config.json (server-injected or static file)
    fetch("/config.json?t=" + Date.now(), { cache: "no-store" })
        .then(function(r) {
            if (!r.ok) throw new Error();
            return r.json();
        })
        .then(function(data) {
            if (data.appId) {
                appId = data.appId;
                applyConfig(appId);
                return;
            }
            throw new Error("no appId in config");
        })
        .catch(function() {
            // 2. Fallback: try .env file (local dev or if committed to repo)
            fetch(".env?t=" + Date.now(), { cache: "no-store" })
                .then(function(r) {
                    if (!r.ok) throw new Error();
                    return r.text();
                })
                .then(function(text) {
                    var match = text.match(/^AGORA_APP_ID\s*=\s*(.+)/im);
                    if (match) {
                        appId = match[1].trim().replace(/^["']|["']$/g, "");
                    }
                    applyConfig(appId);
                })
                .catch(function() {
                    applyConfig(appId);
                });
        });
})();
