(function renderDeployVersion() {
    const config = window.oSharerConfig || {};
    const repo = config.GITHUB_REPO || "colflip/osharer";
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

    // 优先读取构建时注入的版本信息，避免 GitHub API 被墙
    fetch("assets/version.json?_=" + Date.now(), { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error("Failed to load version");
            return response.json();
        })
        .then(data => {
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
