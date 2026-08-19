(function renderVersion() {
    var vt = document.getElementById("version-text");

    // 每次都带时间戳，强制不命中缓存，获取最新版本号
    fetch("assets/version.json?t=" + Date.now(), { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("Failed to load version");
            return response.json();
        })
        .then(function(data) {
            if (data.shortSha) {
                if (vt) vt.textContent = data.shortSha;
            }
        })
        .catch(function() {
            if (vt) vt.textContent = "unknown";
        });
})();
