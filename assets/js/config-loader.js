// Load AGORA_APP_ID at runtime from a separate JSON config file.
// The config file is NOT part of the codebase — it is deployed separately.
// No build step, no deployment script, no Web Service required.
//
// How it works:
// 1. Place config.json (containing {"appId": "your-app-id"}) in the deploy directory
// 2. config-loader.js fetches it on page load
// 3. The file is git-ignored so the key is never in the repo

(function loadConfig() {
    var appId = "";

    // Fetch the standalone config file
    fetch("/config.json?t=" + Date.now(), { cache: "no-store" })
        .then(function(r) {
            if (!r.ok) throw new Error("no config");
            return r.json();
        })
        .then(function(data) {
            if (data.appId) {
                appId = data.appId;
                applyConfig(appId);
                return;
            }
            throw new Error("no appId");
        })
        .catch(function() {
            // No config.json — use placeholder
            applyConfig(appId);
        });

    function applyConfig(id) {
        window.oSharerConfig = {
            APP_ID: id || "YOUR_AGORA_APP_ID",
            AGORA_SDK_SOURCES: [
                "vendor/AgoraRTC_N-4.23.1.js",
                "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
            ]
        };
    }
})();
