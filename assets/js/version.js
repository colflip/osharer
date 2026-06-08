(function renderDeployVersion() {
    const config = window.ScreenCastConfig || {};
    const repo = config.GITHUB_REPO || "colflip/sharer";
    const repoUrl = repo ? `https://github.com/${repo}` : "";

    function ensureVersionEl() {
        let el = document.getElementById("github-version");
        if (el) return el;

        el = document.createElement("a");
        el.id = "github-version";
        el.className = "github-version";
        el.target = "_blank";
        el.rel = "noopener noreferrer";
        const container = document.querySelector(".container") || document.body;
        container.appendChild(el);
        return el;
    }

    function displayVersion(value) {
        if (!value) return;
        const el = ensureVersionEl();
        if (repoUrl) {
            el.href = repoUrl;
            el.target = "_blank";
            el.rel = "noopener noreferrer";
        }
        el.textContent = value;
    }

    function displayError() {
        const el = ensureVersionEl();
        if (repoUrl) {
            el.href = repoUrl;
            el.target = "_blank";
            el.rel = "noopener noreferrer";
        }
        el.textContent = "unknown";
    }

    // 优先读取构建时注入的版本信息
    fetch("assets/version.json?_=" + Date.now(), { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error("Failed to load version");
            return response.json();
        })
        .then(data => {
            // 优先用 buildTime 显示部署时间，其次用 shortSha
            if (data.buildTime) {
                const d = new Date(data.buildTime);
                const ts = d.getFullYear().toString().slice(2) +
                    String(d.getMonth() + 1).padStart(2, "0") +
                    String(d.getDate()).padStart(2, "0") + " " +
                    String(d.getHours()).padStart(2, "0") +
                    String(d.getMinutes()).padStart(2, "0");
                displayVersion(data.shortSha + " " + ts);
                return;
            }
            if (data.shortSha) {
                displayVersion(data.shortSha);
                return;
            }
        })
        .catch(() => {
            // 本地开发 fallback 到 GitHub API
            if (!repo) return displayError();
            fetch(`https://api.github.com/repos/${repo}/commits/main`, { cache: "no-store" })
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => displayVersion(d.sha.slice(0, 7)))
                .catch(displayError);
        });
})();
