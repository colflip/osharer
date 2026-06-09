(function loadConfig() {
    // 1. Build-injected value (from render.yaml buildCommand or inject-env.js)
    var appId = window.__AGORA_APP_ID__ || "";

    window.oSharerConfig = {
        APP_ID: appId || "YOUR_AGORA_APP_ID",
        GITHUB_REPO: "colflip/osharer",
        AGORA_SDK_SOURCES: [
            "vendor/AgoraRTC_N-4.23.1.js",
            "https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js"
        ]
    };
})();
