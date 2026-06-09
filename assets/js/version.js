(function renderVersion() {
    var config = window.oSharerConfig || {};
    var repo = config.GITHUB_REPO || "colflip/osharer";
    var repoUrl = repo ? "https://github.com/" + repo : "";

    function displayVersion(value) {
        if (!value) return;

        // 更新 HTML 中硬编码的 #version-text 元素
        var vt = document.getElementById("version-text");
        if (vt) vt.textContent = value;
    }

    function displayError() {
        var vt = document.getElementById("version-text");
        if (vt) vt.textContent = "unknown";
    }

    // 每次都带时间戳，强制不命中缓存，获取最新版本号
    fetch("assets/version.json?t=" + Date.now(), { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("Failed to load version");
            return response.json();
        })
        .then(function(data) {
            if (data.shortSha) {
                displayVersion(data.shortSha);
                return;
            }
        })
        .catch(function() {
            // 本地开发 fallback 到 GitHub API
            if (!repo) return displayError();
            fetch("https://api.github.com/repos/" + repo + "/commits/main", { cache: "no-store" })
                .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
                .then(function(d) { displayVersion(d.sha.slice(0, 7)); })
                .catch(displayError);
        });
})();
