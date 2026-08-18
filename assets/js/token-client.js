// 向服务端签发接口申请 Agora RTC Token。
//
// 任何一步失败都返回 null，让调用方以静态 App ID 模式入频道 —— 这样
// 未启用证书的项目、或纯静态部署（没有 /api/token）都能照常工作。

(() => {
    const TOKEN_ENDPOINT = "/api/token";
    // 冷启动实例下首个 token 请求可能要等待服务唤醒，放宽到 20s，
    // 失败则优雅回退静态模式（不阻断观看）。
    const REQUEST_TIMEOUT_MS = 20000;

    async function fetchAgoraToken(channel, uid) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(TOKEN_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel, uid }),
                signal: controller.signal,
                cache: "no-store"
            });
            if (!res.ok) {
                console.warn(`Token 接口返回 ${res.status}，回退静态模式`);
                return null;
            }
            const data = await res.json();
            return data.token || null;
        } catch (err) {
            console.warn("Token 获取失败，回退静态模式:", err);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    // Token 有有效期，长时间分享必须续期，否则到期即断流。
    // SDK 会在过期前 30 秒触发 token-privilege-will-expire。
    function bindTokenRenewal(client, channel, uid, onExpired) {
        client.on("token-privilege-will-expire", async () => {
            const token = await fetchAgoraToken(channel, uid);
            if (!token) {
                console.warn("Token 续期失败：未取得新凭证");
                return;
            }
            try {
                await client.renewToken(token);
                console.log("Token 已续期");
            } catch (err) {
                console.error("Token 续期失败:", err);
            }
        });

        client.on("token-privilege-did-expire", () => {
            console.error("Token 已过期");
            if (typeof onExpired === "function") {
                onExpired("🔴 连接凭证已过期，请刷新页面重新连接");
            }
        });
    }

    window.fetchAgoraToken = fetchAgoraToken;
    window.bindTokenRenewal = bindTokenRenewal;
})();
