// Load AGORA_APP_ID at runtime.
// - Local: serve via `node scripts/serve.js` which reads .env and injects it
// - Remote/direct: use APP_ID from HTML inline script or hardcoded fallback

(function loadConfig() {
    var appId = window.__SHARER_APP_ID__ || "";

    window.oSharerConfig = {
        APP_ID: appId || "YOUR_AGORA_APP_ID",
        GITHUB_REPO: "colflip/osharer",
        AGORA_SDK_SOURCES: [
            "vendor/AgoraRTC_N-4.23.1.js",
            "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
        ]
    };
})();
