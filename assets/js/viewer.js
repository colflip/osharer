// APP_ID 在点击时动态读取，避免 config-loader.js 异步加载竞态

function createShortId(prefix = "") {
    const randomPart = Math.random().toString(36).substring(2, 8);
    const timePart = Date.now().toString(36).slice(-4);
    return `${prefix}${randomPart}${timePart}`;
}

function getDeviceType(ua) {
    if (/iPad|Tablet/i.test(ua)) return "Tablet";
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "Tablet";
    if (/iPhone|iPod|Android|Mobile/i.test(ua)) return "Mobile";
    return "Desktop";
}

// 增强版设备信息获取
function getExtendedDeviceInfo() {
    const ua = navigator.userAgent;
    
    // 1. 平台与浏览器 (核心标识)
    let platform = "Other";
    if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
    else if (/Android/i.test(ua)) platform = "Android";
    else if (/Mac OS X/i.test(ua)) platform = "Mac";
    else if (/Windows/i.test(ua)) platform = "Win";

    let browser = "Browser";
    if (/MicroMessenger/i.test(ua)) browser = "WX";
    else if (/Chrome/i.test(ua)) browser = "Chrome";
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
    else if (/Firefox/i.test(ua)) browser = "Firefox";
    const osBrowser = `${platform}_${browser}`;
    const deviceType = getDeviceType(ua);

    // 2. 屏幕属性
    const res = `${window.screen.width}x${window.screen.height}`;
    const dpr = window.devicePixelRatio || 1;

    // 3. 网络状况 (部分浏览器支持)
    let net = "unknown";
    if (navigator.connection) {
        net = navigator.connection.effectiveType || "unknown";
    }

    // 4. 语言与主题
    const lang = (navigator.language || "zh").split('-')[0]; // 取简码如 zh, en
    const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    const hasTouch = navigator.maxTouchPoints > 0 ? "touch" : "no-touch";

    // 5. 持久化访客 ID、单次会话 ID 与访问次数
    let visitorId = localStorage.getItem('sc_visitor_id') || localStorage.getItem('sc_uid');
    if (!visitorId) {
        visitorId = createShortId("v_");
    }
    localStorage.setItem('sc_visitor_id', visitorId);
    localStorage.setItem('sc_uid', visitorId);
    const sessionId = createShortId("s_");
    
    let visits = parseInt(localStorage.getItem('sc_visits') || '0') + 1;
    localStorage.setItem('sc_visits', visits.toString());

    // 6. 简易指纹 (UA + 分辨率 + 时区 + 语言)
    const fpData = `${ua}|${res}|${new Date().getTimezoneOffset()}|${lang}`;
    let hash = 0;
    for (let i = 0; i < fpData.length; i++) {
        hash = ((hash << 5) - hash) + fpData.charCodeAt(i);
        hash |= 0;
    }
    const fingerprint = Math.abs(hash).toString(36);

    return {
        osBrowser,
        platform,
        browser,
        deviceType,
        res,
        dpr,
        net,
        lang,
        theme,
        visitorId,
        sessionId,
        fingerprint,
        visits,
        timeZone,
        hasTouch
    };
}

// 监听 URL 变化：解决同一窗口下重新打开链接不刷新的问题
window.addEventListener("hashchange", () => {
    window.location.reload();
});

// 从 Hash 解析 room 参数 (例如 #room=io8gvd)
const getHashParam = (name) => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return params.get(name);
};
const roomId = getHashParam('room');
const sharePrompt = getHashParam('msg') || "";

if (!roomId) {
    document.body.innerHTML = '<div class="invalid-link"><h2>❌ 链接无效</h2><p>请重新获取分享链接</p></div>';
    throw new Error("Missing room id");
}

if (sharePrompt) {
    const shareNoteEl = document.getElementById('share-note');
    shareNoteEl.innerText = sharePrompt;
    shareNoteEl.style.display = 'block';
}

function showVideoPrompt() {
    if (!sharePrompt) return;
    const videoNoteEl = document.getElementById('video-note');
    videoNoteEl.innerText = sharePrompt;
    videoNoteEl.style.display = 'block';
    clearTimeout(showVideoPrompt.timer);
    showVideoPrompt.timer = setTimeout(() => {
        videoNoteEl.style.display = 'none';
    }, 6000);
}

// 4 位邀请码自动进入逻辑（保留以支持手动输入场景）
document.getElementById('pwdInput').addEventListener('input', function() {
    if (this.value.length === 4) {
        document.getElementById('enterBtn').click();
    }
});

// Wait for config.json to load before joining the room
function waitForConfig(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        if (window.oSharerConfig?.APP_ID && window.oSharerConfig.APP_ID !== "YOUR_AGORA_APP_ID") {
            resolve();
            return;
        }
        const start = Date.now();
        const check = setInterval(() => {
            if (window.oSharerConfig?.APP_ID && window.oSharerConfig.APP_ID !== "YOUR_AGORA_APP_ID") {
                clearInterval(check);
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(check);
                reject(new Error("缺少声网 APP_ID，请联系分享者检查配置"));
            }
        }, 100);
    });
}

// ===== 自动进入房间（主流程）=====
async function autoJoin() {
    const pwdInput = document.getElementById('pwdInput');
    const errorMsg = document.getElementById('error-msg');
    const enterBtn = document.getElementById('enterBtn');
    
    // 从 URL 获取密码
    const urlPwd = getHashParam('pwd');
    if (!urlPwd || urlPwd.length !== 4) {
        // 没有密码则展示登录界面
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('video-container').style.display = 'none';
        pwdInput.focus();
        return;
    }

    const pwd = urlPwd;
    
    // 默认直接进入视频页面
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('video-container').style.display = 'block';
    const statusBar = document.getElementById('status-bar');
    statusBar.style.display = "block";
    statusBar.innerText = "正在加载投屏组件...";
    showVideoPrompt();

    try {
        await waitForConfig();
        const appId = window.oSharerConfig.APP_ID;
        await ensureAgoraSdk();
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        // 构造与分享端一致的频道名
        const channel = `oshare-${roomId}-${pwd}`;

        client.on("connection-state-change", (curState, prevState, reason) => {
            console.log("连接状态:", prevState, "->", curState, reason || "");
            if (curState === "CONNECTING") {
                statusBar.style.display = "block";
                statusBar.innerText = "正在连接...";
            } else if (curState === "RECONNECTING") {
                statusBar.style.display = "block";
                statusBar.innerText = "🟡 网络波动，正在重连...";
            } else if (curState === "FAILED") {
                statusBar.style.display = "block";
                statusBar.innerText = "🔴 连接失败，请刷新或切换网络后重试";
            }
        });
        
        // 将增强的设备信息编码进 UID，分享端可无后端识别访客与单次会话
        const info = getExtendedDeviceInfo();
        const viewerUid = [
            "viewer",
            "v2",
            info.osBrowser,
            info.deviceType,
            info.browser,
            info.platform,
            info.res,
            info.dpr,
            info.net,
            info.lang,
            info.theme,
            info.visitorId,
            info.sessionId,
            info.fingerprint,
            info.visits,
            info.timeZone,
            info.hasTouch
        ].join("|");

        statusBar.innerText = "正在获取连接凭证...";
        const token = await fetchAgoraToken(channel, viewerUid);

        await client.join(appId, channel, token, viewerUid);
        bindTokenRenewal(client, channel, viewerUid, (msg) => {
            statusBar.style.display = "block";
            statusBar.innerText = msg;
        });
        statusBar.innerText = "已进入房间，等待画面...";

        // 无后端状态探测：弱网下给足等待时间，避免误判为密码错误或分享已结束
        setTimeout(async () => {
            if (client.remoteUsers.length === 0) {
                // 邀请码错误或分享已结束 → 回退到登录界面
                errorMsg.innerText = "🔇 邀请码错误或分享已结束";
                await client.leave();
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('video-container').style.display = 'none';
                document.getElementById('pwdInput').value = "";
                document.getElementById('pwdInput').focus();
            }
        }, 8000);

        client.on("user-published", async (user, mediaType) => {
            if (mediaType === "video") {
                statusBar.innerText = "正在加载画面...";
                const remoteTrack = await client.subscribe(user, mediaType);
                remoteTrack.play("player");
                // 播放成功后隐藏顶部的状态栏
                statusBar.style.display = "none";
            }
        });

        client.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "video") {
                statusBar.style.display = "block";
                statusBar.innerText = "🔴 分享者已暂停或停止共享";
                document.getElementById("player").innerHTML = "";
            }
        });

        client.on("peer-leave", () => {
           statusBar.style.display = "block";
           statusBar.innerText = "🔴 分享者已离开";
        });

    } catch (e) {
        console.error(e);
        errorMsg.innerText = e.message || "进入失败：可能密码错误或连接超时";
        // 异常时回退到登录界面
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('video-container').style.display = 'none';
        document.getElementById('pwdInput').focus();
    }
}

// 页面加载后自动进入房间
window.onload = autoJoin;
