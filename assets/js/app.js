// oSharer — app.js
// 合并: token-client.js + viewer.js + sharer.js + version.js
// config-loader.js / agora-loader.js 保留为独立文件（通过 window 全局通信）

(function () {
    "use strict";

    // ═══════════════════════════════════════════════════════════
    //  共享工具
    // ═══════════════════════════════════════════════════════════

    function getAppId() {
        return window.oSharerConfig && window.oSharerConfig.APP_ID ? window.oSharerConfig.APP_ID : "";
    }

    function createShortId(prefix) {
        var randomPart = Math.random().toString(36).substring(2, 8);
        var timePart = Date.now().toString(36).slice(-4);
        return prefix + randomPart + timePart;
    }

    function escapeHtml(value) {
        return String(value === void 0 ? "" : value).replace(/[&<>"']/g, function (char) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
        });
    }

    function getHashParam(name) {
        var hash = window.location.hash.substring(1);
        var params = new URLSearchParams(hash);
        return params.get(name);
    }

    function formatTime(value) {
        if (!value) return "在线中";
        var date = new Date(value);
        if (isNaN(date.getTime())) return "未知";
        return date.toLocaleString("zh-CN", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        }).replace(/\//g, "-");
    }

    function formatDuration(openedAt, endedAt) {
        var start = new Date(openedAt).getTime();
        var end = endedAt ? new Date(endedAt).getTime() : Date.now();
        if (isNaN(start) || isNaN(end)) return "未知";

        var totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        if (hours > 0) return hours + "小时" + minutes + "分" + seconds + "秒";
        if (minutes > 0) return minutes + "分" + seconds + "秒";
        return seconds + "秒";
    }

    function formatDecimal(value, digits) {
        if (digits === void 0) digits = 2;
        var number = Number(value);
        if (!isFinite(number)) return value || "未知";
        return number.toFixed(digits).replace(/\.?0+$/, "");
    }

    // ═══════════════════════════════════════════════════════════
    //  Token 客户端（原 token-client.js，闭包内化，不再挂 window）
    // ═══════════════════════════════════════════════════════════

    var TOKEN_ENDPOINT = "/api/token";
    var REQUEST_TIMEOUT_MS = 20000; // 冷启动环境下放宽到 20s（2026-08-18 修复）

    async function fetchAgoraToken(channel, uid) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
        try {
            var res = await fetch(TOKEN_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel: channel, uid: uid }),
                signal: controller.signal,
                cache: "no-store"
            });
            if (!res.ok) {
                console.warn("Token 接口返回 " + res.status + "，回退静态模式");
                return null;
            }
            var data = await res.json();
            return data.token || null;
        } catch (err) {
            console.warn("Token 获取失败，回退静态模式:", err);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    function bindTokenRenewal(client, channel, uid, onExpired) {
        client.on("token-privilege-will-expire", async function () {
            var token = await fetchAgoraToken(channel, uid);
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

        client.on("token-privilege-did-expire", function () {
            console.error("Token 已过期");
            if (typeof onExpired === "function") {
                onExpired("🔴 连接凭证已过期，请刷新页面重新连接");
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  观看端（原 viewer.js）
    // ═══════════════════════════════════════════════════════════

    function getExtendedDeviceInfo() {
        var ua = navigator.userAgent;

        // 1. 平台与浏览器 (核心标识)
        var platform = "Other";
        if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
        else if (/Android/i.test(ua)) platform = "Android";
        else if (/Mac OS X/i.test(ua)) platform = "Mac";
        else if (/Windows/i.test(ua)) platform = "Win";

        var browser = "Browser";
        if (/MicroMessenger/i.test(ua)) browser = "WX";
        else if (/Chrome/i.test(ua)) browser = "Chrome";
        else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
        else if (/Firefox/i.test(ua)) browser = "Firefox";
        var osBrowser = platform + "_" + browser;

        // 2. 屏幕属性
        var res = window.screen.width + "x" + window.screen.height;
        var dpr = window.devicePixelRatio || 1;

        // 3. 网络状况
        var net = "unknown";
        if (navigator.connection) {
            net = navigator.connection.effectiveType || "unknown";
        }

        // 4. 语言与主题
        var lang = (navigator.language || "zh").split("-")[0];
        var theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

        // 5. 持久化访客 ID、单次会话 ID 与访问次数
        var visitorId = localStorage.getItem("sc_visitor_id") || localStorage.getItem("sc_uid");
        if (!visitorId) {
            visitorId = createShortId("v_");
        }
        localStorage.setItem("sc_visitor_id", visitorId);
        localStorage.setItem("sc_uid", visitorId);
        var sessionId = createShortId("s_");

        var visits = parseInt(localStorage.getItem("sc_visits") || "0", 10) + 1;
        localStorage.setItem("sc_visits", visits.toString());

        // 6. 简易指纹
        var fpData = ua + "|" + res + "|" + new Date().getTimezoneOffset() + "|" + lang;
        var hash = 0;
        for (var i = 0; i < fpData.length; i++) {
            hash = ((hash << 5) - hash) + fpData.charCodeAt(i);
            hash |= 0;
        }
        var fingerprint = Math.abs(hash).toString(36);

        return {
            osBrowser: osBrowser,
            browser: browser,
            res: res,
            dpr: dpr,
            net: net,
            lang: lang,
            theme: theme,
            visitorId: visitorId,
            sessionId: sessionId,
            fingerprint: fingerprint,
            visits: visits
        };
    }

    function showVideoPrompt() {
        if (!window._sharePrompt) return;
        var videoNoteEl = document.getElementById("video-note");
        if (!videoNoteEl) return;
        videoNoteEl.innerText = window._sharePrompt;
        videoNoteEl.style.display = "block";
        clearTimeout(showVideoPrompt.timer);
        showVideoPrompt.timer = setTimeout(function () {
            videoNoteEl.style.display = "none";
        }, 6000);
    }

    function waitForConfig(timeoutMs) {
        if (timeoutMs === void 0) timeoutMs = 60000; // 冷启动放宽到 60s
        return new Promise(function (resolve, reject) {
            if (window.oSharerConfig && window.oSharerConfig.APP_ID && window.oSharerConfig.APP_ID !== "YOUR_AGORA_APP_ID") {
                resolve();
                return;
            }
            var start = Date.now();
            var check = setInterval(function () {
                if (window.oSharerConfig && window.oSharerConfig.APP_ID && window.oSharerConfig.APP_ID !== "YOUR_AGORA_APP_ID") {
                    clearInterval(check);
                    resolve();
                } else if (Date.now() - start > timeoutMs) {
                    clearInterval(check);
                    reject(new Error("缺少声网 APP_ID，请联系分享者检查配置"));
                }
            }, 100);
        });
    }

    async function autoJoin() {
        var pwdInput = document.getElementById("pwdInput");
        var errorMsg = document.getElementById("error-msg");
        var retryBtnBox = document.getElementById("retryBtn");

        // 从 URL 获取密码
        var urlPwd = getHashParam("pwd");
        if (!urlPwd || urlPwd.length !== 4) {
            var loginScreen = document.getElementById("login-screen");
            var videoContainer = document.getElementById("video-container");
            if (loginScreen) loginScreen.style.display = "flex";
            if (videoContainer) videoContainer.style.display = "none";
            if (pwdInput) pwdInput.focus();
            return;
        }

        var pwd = urlPwd;

        // 进入视频页面
        var loginScreen = document.getElementById("login-screen");
        var videoContainer = document.getElementById("video-container");
        var statusBar = document.getElementById("status-bar");

        if (loginScreen) loginScreen.style.display = "none";
        if (videoContainer) videoContainer.style.display = "block";
        if (retryBtnBox) retryBtnBox.style.display = "none";
        if (statusBar) {
            statusBar.style.display = "block";
            statusBar.innerText = "正在加载投屏组件...";
        }
        showVideoPrompt();

        try {
            await waitForConfig();
            var appId = getAppId();
            await window.ensureAgoraSdk();
            var AgoraRTC = window.AgoraRTC;
            var client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            var roomId = getHashParam("room");
            var channel = "oshare-" + roomId + "-" + pwd;

            client.on("connection-state-change", function (curState, prevState, reason) {
                console.log("连接状态:", prevState, "->", curState, reason || "");
                if (curState === "CONNECTING") {
                    if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = "正在连接..."; }
                } else if (curState === "RECONNECTING") {
                    if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = "🟡 网络波动，正在重连..."; }
                } else if (curState === "FAILED") {
                    if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = "🔴 连接失败，请刷新或切换网络后重试"; }
                }
            });

            // 将增强的设备信息编码进 UID
            var info = getExtendedDeviceInfo();
            var viewerUid = [
                "viewer",
                "v2",
                info.osBrowser,
                info.browser,
                info.res,
                String(info.dpr),
                info.net,
                info.lang,
                info.theme,
                info.visitorId,
                info.sessionId,
                info.fingerprint,
                String(info.visits)
            ].join("|");

            if (statusBar) statusBar.innerText = "正在获取连接凭证...";
            var token = await fetchAgoraToken(channel, viewerUid);

            await client.join(appId, channel, token, viewerUid);
            bindTokenRenewal(client, channel, viewerUid, function (msg) {
                if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = msg; }
            });
            if (statusBar) statusBar.innerText = "已进入房间，等待画面...";

            // 无后端状态探测：弱网下给足等待时间
            setTimeout(async function () {
                if (client.remoteUsers.length === 0) {
                    if (errorMsg) errorMsg.innerText = "🔇 邀请码错误或分享已结束";
                    await client.leave();
                    if (loginScreen) loginScreen.style.display = "flex";
                    if (videoContainer) videoContainer.style.display = "none";
                    if (pwdInput) { pwdInput.value = ""; pwdInput.focus(); }
                }
            }, 8000);

            client.on("user-published", async function (user, mediaType) {
                if (mediaType === "video") {
                    if (statusBar) statusBar.innerText = "正在加载画面...";
                    var remoteTrack = await client.subscribe(user, mediaType);
                    remoteTrack.play("player");
                    if (statusBar) statusBar.style.display = "none";
                }
            });

            client.on("user-unpublished", function (user, mediaType) {
                if (mediaType === "video") {
                    if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = "🔴 分享者已暂停或停止共享"; }
                    var playerEl = document.getElementById("player");
                    if (playerEl) playerEl.innerHTML = "";
                }
            });

            client.on("peer-leave", function () {
                if (statusBar) { statusBar.style.display = "block"; statusBar.innerText = "🔴 分享者已离开"; }
            });

        } catch (e) {
            console.error(e);
            if (errorMsg) errorMsg.innerText = e.message || "进入失败：可能密码错误或连接超时";
            // 恢复登录界面，允许重新输入密码或点击重试
            var loginScreen = document.getElementById("login-screen");
            var videoContainerEl = document.getElementById("video-container");
            if (loginScreen) loginScreen.style.display = "flex";
            if (videoContainerEl) videoContainerEl.style.display = "none";
            if (retryBtnBox) retryBtnBox.style.display = "none";
            if (pwdInput) pwdInput.focus();
        }
    }

    function initViewer() {
        // 监听 URL 变化
        window.addEventListener("hashchange", function () {
            window.location.reload();
        });

        // 从 Hash 解析参数
        var roomId = getHashParam("room");
        window._sharePrompt = getHashParam("msg") || "";

        if (!roomId) {
            document.body.innerHTML = '<div class="invalid-link"><h2>❌ 链接无效</h2><p>请重新获取分享链接</p></div>';
            return;
        }

        if (window._sharePrompt) {
            var shareNoteEl = document.getElementById("share-note");
            if (shareNoteEl) {
                shareNoteEl.innerText = window._sharePrompt;
                shareNoteEl.style.display = "block";
            }
        }

        // 4 位邀请码自动进入
        var pwdInput = document.getElementById("pwdInput");
        var enterBtn = document.getElementById("enterBtn");

        if (pwdInput && enterBtn) {
            pwdInput.addEventListener("input", function () {
                if (this.value.length === 4) {
                    enterBtn.click();
                }
            });
            enterBtn.onclick = autoJoin;
        }

        var retryEnterBtn = document.getElementById("retryEnterBtn");
        if (retryEnterBtn) {
            retryEnterBtn.onclick = function () {
                var retryBtnBox = document.getElementById("retryBtn");
                if (retryBtnBox) retryBtnBox.style.display = "none";
                if (errorMsg) errorMsg.innerText = "";
                autoJoin();
            };
        }

        // DOMContentLoaded 时机启动，更早开始等 config（2026-08-18 冷启动修复）
        autoJoin();
    }

    // ═══════════════════════════════════════════════════════════
    //  分享端（原 sharer.js）
    // ═══════════════════════════════════════════════════════════

    var SHARE_PROMPT_KEY = "sc_share_prompt";
    var SHARE_THEME_KEY = "sc_share_theme";
    var LAST_RECORDS_KEY = "sc_latest_viewer_records_key";
    var VIEWER_RECORDS_CACHE_KEY = "sc_viewer_records_cache";
    var RECENT_RECORD_LIMIT = 10;

    var client, screenTrack;
    var countdownTimer = null;
    var totalSecondsRemaining = 0;
    var lastAutoDowngradeAt = 0;
    var isScreenPaused = false;
    var currentShareHasLimit = false;
    var networkNotice = "";
    var networkRecoveryTimer = null;
    var autoNetworkState = {
        downgraded: false,
        originalQuality: "",
        originalBitrate: "",
        goodSamples: 0,
        weakSamples: 0
    };

    var DEFAULT_SHARE_PROMPT = "请使用浏览器打开链接，查看投屏";
    var OLD_DEFAULT_SHARE_PROMPTS = [
        "请使用浏览器打开链接，参加投屏",
        "请使用浏览器打开链接，输入邀请码加入投屏。"
    ];

    var currentRecordsKey = localStorage.getItem(LAST_RECORDS_KEY) || "";
    var viewerRecords = [];
    var activeViewerRecords = new Map();
    var durationRefreshTimer = null;
    var recentRecordsExpanded = true;
    var earlierRecordsExpanded = false;

    function applyShareTheme(theme) {
        var normalizedTheme = theme === "light" ? "light" : "dark";
        document.body.classList.toggle("theme-light", normalizedTheme === "light");
        document.body.classList.toggle("theme-dark", normalizedTheme === "dark");

        var themeToggle = document.getElementById("themeToggle");
        var themeToggleText = document.getElementById("themeToggleText");
        if (themeToggle) themeToggle.checked = normalizedTheme === "light";
        if (themeToggleText) themeToggleText.innerText = normalizedTheme === "light" ? "白天" : "夜间";
    }

    function setupShareThemeToggle() {
        var savedTheme = localStorage.getItem(SHARE_THEME_KEY);
        var preferredTheme = savedTheme || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
        applyShareTheme(preferredTheme);

        var themeToggle = document.getElementById("themeToggle");
        if (!themeToggle) return;
        themeToggle.addEventListener("change", function () {
            var nextTheme = themeToggle.checked ? "light" : "dark";
            localStorage.setItem(SHARE_THEME_KEY, nextTheme);
            applyShareTheme(nextTheme);
        });
    }

    function getShareSupportIssue() {
        var ua = navigator.userAgent;
        if (!window.isSecureContext) {
            return "请使用 HTTPS 页面打开分享端，否则浏览器会阻止屏幕共享。";
        }
        if (/MicroMessenger|QQBrowser|MQQBrowser/i.test(ua)) {
            return "当前内置浏览器兼容性较弱，请复制链接到电脑 Chrome 或 Edge 打开。";
        }
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
            return "手机浏览器通常不支持发起屏幕共享，请使用电脑 Chrome 或 Edge。";
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            return "当前浏览器不支持屏幕共享，请升级浏览器或使用电脑 Chrome / Edge。";
        }
        return "";
    }

    function scrollShareControlsIntoView() {
        var shareActions = document.querySelector(".share-actions");
        if (!shareActions) return;

        requestAnimationFrame(function () {
            shareActions.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // 字段布局与 viewer.js 的 getExtendedDeviceInfo 严格一致（13 段 UID）。
    // 协议: viewer|v2|osBrowser|browser|res|dpr|net|lang|theme|visitorId|sessionId|fingerprint|visits
    function parseViewerInfo(viewerUid) {
        var p = viewerUid.split("|");
        return {
            version: "v2",
            osBrowser: p[2] || "未知",
            browser: p[3] || "Browser",
            res: p[4] || "未知",
            dpr: p[5] || "1",
            net: p[6] || "未知",
            lang: p[7] || "zh",
            theme: p[8] || "light",
            visitorId: p[9] || "N/A",
            sessionId: p[10] || "N/A",
            fp: p[11] || "N/A",
            visits: p[12] || "1"
        };
    }

    function getViewerDeviceKey(viewerUid, info) {
        if (info === void 0) info = parseViewerInfo(viewerUid);
        var vid = info.visitorId && info.visitorId !== "N/A" ? info.visitorId : "";
        var fp = info.fp && info.fp !== "N/A" ? info.fp : "";

        if (vid && fp) {
            return vid + "_" + fp;
        }

        return vid || fp || viewerUid;
    }

    function getVisitorId(info) {
        if (info === void 0) info = {};
        return info.visitorId || info.uid || info.fp || "N/A";
    }

    function getBrowserSupport(info) {
        if (info === void 0) info = {};
        var browser = String(info.browser || info.osBrowser || "").toLowerCase();
        if (/wx|micromessenger|qq/.test(browser)) return "Weak";
        if (/chrome|edge|safari|firefox/.test(browser)) return "Good";
        return "Basic";
    }

    function formatNetworkType(net) {
        var value = String(net || "unknown").trim();
        if (!value || value === "unknown") return "UNKNOWN";
        return value.toUpperCase();
    }

    function buildInfoTags(info) {
        var visitorId = getVisitorId(info);
        var safeNet = escapeHtml(formatNetworkType(info.net));
        var safeLang = escapeHtml(String(info.lang || "zh").toUpperCase());
        var safeDpr = escapeHtml(formatDecimal(info.dpr));
        var sessionId = info.sessionId && info.sessionId !== "N/A" ? escapeHtml(info.sessionId) : "";
        return '<span class="tag tag-uid" title="访客 ID">' + escapeHtml(visitorId) + '</span>' +
            (sessionId ? '<span class="tag tag-session" title="会话 ID">' + escapeHtml(sessionId) + '</span>' : "") +
            '<span class="tag" title="指纹: ' + escapeHtml(info.fp) + '">' + escapeHtml(info.fp) + '</span>' +
            '<span class="tag tag-support" title="浏览器支持度">' + escapeHtml(getBrowserSupport(info)) + '</span>' +
            '<span class="tag tag-net" title="网络类型">' + safeNet + '</span>' +
            '<span class="tag tag-res">' + escapeHtml(info.res) + " @" + safeDpr + "x</span>" +
            '<span class="tag">' + safeLang + '</span>' +
            '<span class="tag">' + (info.theme === "dark" ? "🌙" : "☀️") + "</span>";
    }

    function buildTimeTags(record) {
        var info = record.info || {};
        return '<span class="tag tag-visits">第 ' + escapeHtml(info.visits || "1") + ' 次访问</span>' +
            '<span class="tag">打开: ' + escapeHtml(formatTime(record.openedAt)) + "</span>" +
            '<span class="tag">结束: ' + escapeHtml(formatTime(record.endedAt)) + "</span>" +
            '<span class="tag duration-tag" data-opened-at="' + escapeHtml(record.openedAt || "") + '" data-ended-at="' + escapeHtml(record.endedAt || "") + '">连接时长: ' + escapeHtml(formatDuration(record.openedAt, record.endedAt)) + "</span>";
    }

    function buildRecordHtml(record) {
        return '<div class="viewer-item record-item">' + buildActiveViewerHtml(record) + "</div>";
    }

    function buildRecordGroupHtml(title, records, options) {
        if (!records.length) return "";

        var collapsed = Boolean(options && options.collapsed);
        var groupId = options && options.groupId ? options.groupId : title;
        var escapedGroupId = escapeHtml(groupId);

        return '<section class="record-group' + (collapsed ? " collapsed" : "") + '" data-record-group="' + escapedGroupId + '">' +
            '<div class="record-group-header">' +
            '<div class="record-group-summary">' +
            '<h4>' + escapeHtml(title) + '</h4>' +
            '<span class="record-group-count">' + records.length + " 条</span>" +
            "</div>" +
            '<div class="record-group-actions">' +
            '<button class="mini-btn record-group-toggle" data-toggle-record-group="' + escapedGroupId + '" type="button" aria-expanded="' + String(!collapsed) + '">' + (collapsed ? "展开" : "收起") + "</button>" +
            '<button class="mini-btn record-group-clear" data-clear-record-group="' + escapedGroupId + '" type="button">清空</button>' +
            "</div>" +
            "</div>" +
            '<div class="record-group-body">' + records.map(buildRecordHtml).join("") + "</div>" +
            "</section>";
    }

    function bindRecordGroupToggles() {
        var toggles = document.querySelectorAll("[data-toggle-record-group]");
        toggles.forEach(function (toggleBtn) {
            toggleBtn.onclick = function () {
                var groupId = toggleBtn.dataset.toggleRecordGroup;
                var group = document.querySelector('[data-record-group="' + groupId + '"]');
                if (!group) return;

                var nextExpanded = group.classList.contains("collapsed");
                group.classList.toggle("collapsed", !nextExpanded);
                toggleBtn.innerText = nextExpanded ? "收起" : "展开";
                toggleBtn.setAttribute("aria-expanded", String(nextExpanded));
                if (groupId === "recent") recentRecordsExpanded = nextExpanded;
                if (groupId === "earlier") earlierRecordsExpanded = nextExpanded;
            };
        });

        var clears = document.querySelectorAll("[data-clear-record-group]");
        clears.forEach(function (clearBtn) {
            clearBtn.onclick = function () {
                clearViewerRecordGroup(clearBtn.dataset.clearRecordGroup);
            };
        });
    }

    function getSortedViewerRecordGroups() {
        var sortedRecords = viewerRecords.filter(function (record) { return record.endedAt; }).slice().reverse();
        return {
            recent: sortedRecords.slice(0, RECENT_RECORD_LIMIT),
            earlier: sortedRecords.slice(RECENT_RECORD_LIMIT)
        };
    }

    function clearViewerRecordGroup(groupId) {
        var groups = getSortedViewerRecordGroups();
        var recordsToClear = groups[groupId] || [];
        if (!recordsToClear.length) return;

        var idsToClear = new Set(recordsToClear.map(function (record) { return record.id; }));
        viewerRecords = viewerRecords.filter(function (record) { return !idsToClear.has(record.id) || !record.endedAt; });
        saveViewerRecords();
        renderViewerRecords();
    }

    function refreshLiveDurations() {
        document.querySelectorAll('.duration-tag[data-ended-at=""]').forEach(function (tag) {
            tag.textContent = "连接时长: " + formatDuration(tag.dataset.openedAt, tag.dataset.endedAt);
        });
    }

    function syncDurationRefreshTimer() {
        var hasLiveDuration = Boolean(document.querySelector('.duration-tag[data-ended-at=""]'));
        if (hasLiveDuration && !durationRefreshTimer) {
            durationRefreshTimer = setInterval(refreshLiveDurations, 1000);
        } else if (!hasLiveDuration && durationRefreshTimer) {
            clearInterval(durationRefreshTimer);
            durationRefreshTimer = null;
        }
    }

    function saveViewerRecords() {
        var cache = {
            recordsKey: currentRecordsKey,
            records: viewerRecords
        };
        localStorage.setItem(VIEWER_RECORDS_CACHE_KEY, JSON.stringify(cache));
        if (!currentRecordsKey) return;
        localStorage.setItem(currentRecordsKey, JSON.stringify(viewerRecords));
        localStorage.setItem(LAST_RECORDS_KEY, currentRecordsKey);
    }

    function loadSavedViewerRecords() {
        try {
            var saved = [];
            var cached = JSON.parse(localStorage.getItem(VIEWER_RECORDS_CACHE_KEY) || "null");
            if (cached && Array.isArray(cached.records)) {
                saved = cached.records;
                if (!currentRecordsKey && cached.recordsKey) {
                    currentRecordsKey = cached.recordsKey;
                }
            } else if (currentRecordsKey) {
                saved = JSON.parse(localStorage.getItem(currentRecordsKey) || "[]");
            }

            if (Array.isArray(saved)) {
                viewerRecords = saved;
                renderViewerRecords();
            }
        } catch (err) {
            console.warn("读取访客记录失败:", err);
        }
    }

    function renderViewerRecords() {
        var panel = document.getElementById("viewerRecordPanel");
        var container = document.getElementById("recordsContainer");
        if (!panel || !container) return;

        var groups = getSortedViewerRecordGroups();

        if (!groups.recent.length && !groups.earlier.length) {
            container.innerHTML = '<div class="empty-state">暂无打开记录</div>';
            panel.style.display = currentRecordsKey ? "block" : "none";
            syncDurationRefreshTimer();
            return;
        }

        panel.style.display = "block";
        container.innerHTML = [
            buildRecordGroupHtml("近期设备记录", groups.recent, { collapsed: !recentRecordsExpanded, groupId: "recent" }),
            buildRecordGroupHtml("更早设备记录", groups.earlier, { collapsed: !earlierRecordsExpanded, groupId: "earlier" })
        ].join("") || '<div class="empty-state">暂无打开记录</div>';
        bindRecordGroupToggles();
        syncDurationRefreshTimer();
    }

    function buildActiveViewerHtml(record) {
        var info = record.info;
        var isOnline = !record.endedAt;

        return '<div class="viewer-row">' +
            '<div class="viewer-main">' +
            '<div class="dot" style="background: ' + (isOnline ? "#34c759" : "#8e8e93") + ';"></div>' +
            '<b class="viewer-device-name">' + escapeHtml(info.osBrowser) + "</b>" +
            "</div>" +
            '<div class="viewer-details">' + buildInfoTags(info) + "</div>" +
            "</div>" +
            '<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">' +
            '<div class="viewer-times" style="flex: 1; min-width: 0;">' + buildTimeTags(record) + "</div>" +
            '<div class="viewer-status" style="flex-shrink: 0; margin-left: 8px; font-weight: 500; color: ' + (isOnline ? "#34c759" : "#8e8e93") + ';">' + (isOnline ? "在线中" : "已结束") + "</div>" +
            "</div>";
    }

    function updateActiveViewer(record) {
        var el = document.getElementById("viewer-" + record.id);
        if (!el) return;
        el.innerHTML = buildActiveViewerHtml(record);
        syncDurationRefreshTimer();
    }

    function appendActiveViewer(record) {
        var viewersContainer = document.getElementById("viewersContainer");
        if (!viewersContainer) return;

        var el = document.createElement("div");
        el.className = "viewer-item";
        el.id = "viewer-" + record.id;
        el.innerHTML = buildActiveViewerHtml(record);

        viewersContainer.appendChild(el);
        syncDurationRefreshTimer();
    }

    function closeActiveViewerRecords() {
        if (!activeViewerRecords.size) return;
        var endedAt = new Date().toISOString();
        activeViewerRecords.forEach(function (record) {
            if (!record.endedAt) record.endedAt = endedAt;
            var el = document.getElementById("viewer-" + record.id);
            if (el) el.remove();
        });
        activeViewerRecords.clear();
        saveViewerRecords();
        renderViewerRecords();
    }

    function showCopyToast(message) {
        var toast = document.getElementById("copyToast");
        if (!toast) return;
        toast.innerText = message;
        toast.style.display = "block";
        clearTimeout(showCopyToast.timer);
        showCopyToast.timer = setTimeout(function () {
            toast.style.display = "none";
        }, 3000);
    }

    function setPanelExpanded(panelId, expanded) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        var toggleBtn = panel.querySelector("[data-toggle-panel]");
        if (!toggleBtn) return;

        panel.classList.toggle("collapsed", !expanded);
        toggleBtn.innerText = expanded ? "收起" : "展开";
        toggleBtn.setAttribute("aria-expanded", String(expanded));
    }

    function setupPanelToggle(panelId, defaultExpanded) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        var toggleBtn = panel.querySelector("[data-toggle-panel]");
        if (!toggleBtn) return;

        setPanelExpanded(panelId, defaultExpanded);
        toggleBtn.onclick = function () {
            setPanelExpanded(panelId, panel.classList.contains("collapsed"));
        };
    }

    function formatRemainingTime() {
        var h = String(Math.floor(totalSecondsRemaining / 3600)).padStart(2, "0");
        var m = String(Math.floor((totalSecondsRemaining % 3600) / 60)).padStart(2, "0");
        var s = String(totalSecondsRemaining % 60).padStart(2, "0");
        return h + ":" + m + ":" + s;
    }

    function getSelectedDurationLabel() {
        if (!currentShareHasLimit) return "不限时长";
        if (selectedDuration === -1) return "自定义";
        if (selectedDuration >= 60) {
            var hours = selectedDuration / 60;
            return Number.isInteger(hours) ? hours + "h" : selectedDuration + "m";
        }
        return selectedDuration + "m";
    }

    function updateShareOverview() {
        var qualityText = document.getElementById("shareQualityText");
        var qualityMeta = document.getElementById("shareQualityMeta");
        var bitrateText = document.getElementById("shareBitrateText");
        var bitrateMeta = document.getElementById("shareBitrateMeta");
        var durationText = document.getElementById("shareDurationText");
        var durationMeta = document.getElementById("shareDurationMeta");
        var config = getEncoderConfig(selectedQuality);

        if (qualityText) qualityText.innerText = QUALITY_LABELS[selectedQuality] || selectedQuality;
        if (qualityMeta && config) qualityMeta.innerText = config.width + "×" + config.height + " · " + config.frameRate + "fps";
        if (bitrateText) bitrateText.innerText = BITRATE_LABELS[selectedBitrate] || selectedBitrate;
        if (bitrateMeta && config) bitrateMeta.innerText = formatDecimal(config.bitrateMin / 1000, 1) + "-" + formatDecimal(config.bitrateMax / 1000, 1) + "Mbps";
        if (durationText) durationText.innerText = getSelectedDurationLabel();
        if (durationMeta) {
            durationMeta.innerText = currentShareHasLimit ? "剩余 " + formatRemainingTime() : "当前分享没有自动结束时间";
        }
    }

    function getScreenTrackDimensions() {
        var mediaTrack = typeof screenTrack && typeof screenTrack.getMediaStreamTrack === "function" ? screenTrack.getMediaStreamTrack() : null;
        var settings = typeof mediaTrack && typeof mediaTrack.getSettings === "function" ? mediaTrack.getSettings() : {};
        var width = Number(settings.width) || 16;
        var height = Number(settings.height) || 9;
        return { width: width, height: height };
    }

    function syncShareSidePanelTop() {
        var shareInfo = document.getElementById("shareInfo");
        if (!shareInfo || shareInfo.style.display === "none") return;
        var top = Math.max(30, Math.round(shareInfo.getBoundingClientRect().top));
        document.documentElement.style.setProperty("--share-side-top", top + "px");
    }

    function syncShareSidePanelHPosition() {
        var container = document.querySelector("#share-screen .container");
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var gap = 0;
        var rightMargin = 8;
        var leftCardWidth = 285;
        var rightCardWidth = 431;
        var statsRight = Math.round(window.innerWidth - rect.left + gap);
        var previewLeft = Math.round(rect.right + gap);
        var previewWidth = Math.round(rightCardWidth);
        var root = document.documentElement.style;
        root.setProperty("--side-stats-right", statsRight + "px");
        root.setProperty("--side-preview-left", previewLeft + "px");
        root.setProperty("--side-preview-width", previewWidth + "px");
    }

    function setShareSidePanelsVisible(visible) {
        if (visible) {
            syncShareSidePanelHPosition();
            syncShareSidePanelTop();
        }
        document.getElementById("shareSideStats") && document.getElementById("shareSideStats").classList.toggle("active", visible);
        document.getElementById("shareSidePreview") && document.getElementById("shareSidePreview").classList.toggle("active", visible);
    }

    function resetSharePreview() {
        var previewEl = document.getElementById("sharePreviewVideo");
        if (!previewEl) return;
        previewEl.removeAttribute("style");
        previewEl.innerHTML = "<span>预览将在分享开始后显示</span>";
        setShareSidePanelsVisible(false);
    }

    function sizeSharePreview(previewEl) {
        if (!screenTrack || !previewEl) return;
        var dims = getScreenTrackDimensions();
        var ratio = dims.width / dims.height;
        var previewPanel = document.getElementById("shareSidePreview");
        var sideWidth = Math.floor(previewPanel && previewPanel.getBoundingClientRect ? previewPanel.getBoundingClientRect().width : 570);
        var previewWidth = ratio < 1 ? Math.floor(sideWidth * 0.5) : sideWidth;
        previewEl.style.aspectRatio = dims.width + " / " + dims.height;
        previewEl.style.width = previewWidth + "px";
        previewEl.style.minHeight = "0";
    }

    function mountSharePreview() {
        var previewEl = document.getElementById("sharePreviewVideo");
        if (!screenTrack || !previewEl || typeof screenTrack.play !== "function") return;

        previewEl.innerHTML = "";
        sizeSharePreview(previewEl);
        try {
            screenTrack.play(previewEl, { fit: "contain" });
        } catch (err) {
            console.warn("本地缩略图预览失败:", err);
            previewEl.innerHTML = "<span>当前浏览器无法显示本地预览</span>";
        }
    }

    function updateShareStatus() {
        var statusEl = document.getElementById("status");
        if (!statusEl) return;

        var baseStatus = isScreenPaused ? "⏸️ 已暂停投屏" : "🟢 分享中";
        statusEl.innerText = [baseStatus, networkNotice].filter(Boolean).join("\n");
        updateShareOverview();
    }

    function appendShareNotice(message) {
        var statusEl = document.getElementById("status");
        if (!statusEl || !message) return;
        statusEl.innerText = statusEl.innerText ? statusEl.innerText + "\n" + message : message;
    }

    function updatePauseButton() {
        var pauseBtn = document.getElementById("pauseBtn");
        if (!pauseBtn) return;

        pauseBtn.innerText = isScreenPaused ? "继续投屏" : "暂停投屏";
        pauseBtn.classList.toggle("paused", isScreenPaused);
    }

    async function toggleScreenPause() {
        var pauseBtn = document.getElementById("pauseBtn");
        var statusEl = document.getElementById("status");
        if (!screenTrack || !pauseBtn) return;

        pauseBtn.disabled = true;
        try {
            var nextPaused = !isScreenPaused;
            if (typeof screenTrack.setMuted === "function") {
                await screenTrack.setMuted(nextPaused);
            } else if (typeof screenTrack.setEnabled === "function") {
                await screenTrack.setEnabled(!nextPaused);
            } else {
                throw new Error("当前投屏轨道不支持暂停");
            }

            isScreenPaused = nextPaused;
            updatePauseButton();
            updateShareStatus();
        } catch (err) {
            console.error("Pause Share Error:", err);
            if (statusEl) statusEl.innerText = "🔴 暂停投屏失败: " + (err.message || "请稍后重试");
        } finally {
            pauseBtn.disabled = false;
        }
    }

    // 清晰度配置项
    var QUALITY_CONFIGS = {
        fluent: { width: 960, height: 540, frameRate: 15, bitrateMin: 500, bitrateMax: 1000 },
        standard: { width: 1280, height: 720, frameRate: 25, bitrateMin: 800, bitrateMax: 2000 },
        high: { width: 1920, height: 1080, frameRate: 30, bitrateMin: 1500, bitrateMax: 4000 },
        pro_2k: { width: 2560, height: 1440, frameRate: 30, bitrateMin: 3000, bitrateMax: 10000 },
        pro_4k: { width: 3840, height: 2160, frameRate: 30, bitrateMin: 6000, bitrateMax: 20000 }
    };
    var QUALITY_LABELS = {
        fluent: "540P", standard: "720P", high: "1080P", pro_2k: "2K", pro_4k: "4K"
    };
    var BITRATE_PRESETS = {
        low: { minScale: 0.65, maxScale: 0.65 },
        standard: { minScale: 1, maxScale: 1 },
        high: { minScale: 1.25, maxScale: 1.35 },
        max: { minScale: 1.6, maxScale: 1.8 }
    };
    var BITRATE_LABELS = { low: "省流", standard: "标准", high: "高码率", max: "极致" };

    var selectedQuality = "pro_2k";
    var selectedBitrate = "standard";
    var selectedDuration = 15;

    function getEncoderConfig(qualityKey, bitrateKey) {
        if (qualityKey === void 0) qualityKey = selectedQuality;
        if (bitrateKey === void 0) bitrateKey = selectedBitrate;
        var config = QUALITY_CONFIGS[qualityKey];
        if (!config) return null;
        var bitratePreset = BITRATE_PRESETS[bitrateKey] || BITRATE_PRESETS.standard;

        return {
            width: config.width,
            height: config.height,
            frameRate: config.frameRate,
            bitrateMin: Math.round(config.bitrateMin * bitratePreset.minScale),
            bitrateMax: Math.round(config.bitrateMax * bitratePreset.maxScale)
        };
    }

    function getQualityStepDown(qualityKey) {
        var ordered = ["fluent", "standard", "high", "pro_2k", "pro_4k"];
        var index = ordered.indexOf(qualityKey);
        if (index <= 0) return "fluent";
        return ordered[index - 1];
    }

    function setBitrateActive(bitrateKey) {
        document.querySelectorAll("#bitrateSelector .control-item").forEach(function (item) {
            item.classList.toggle("active", item.getAttribute("data-bitrate") === bitrateKey);
        });
    }

    function setQualityActive(qualityKey) {
        document.querySelectorAll("#qualitySelector .control-item").forEach(function (item) {
            var itemQuality = item.getAttribute("data-q");
            item.classList.toggle("active", itemQuality === qualityKey);
        });
    }

    function resetAutoNetworkState() {
        autoNetworkState.downgraded = false;
        autoNetworkState.originalQuality = "";
        autoNetworkState.originalBitrate = "";
        autoNetworkState.goodSamples = 0;
        autoNetworkState.weakSamples = 0;
        networkNotice = "";
        clearTimeout(networkRecoveryTimer);
        networkRecoveryTimer = null;
    }

    async function applyScreenQuality(qualityKey, bitrateKey) {
        if (!screenTrack) return;
        var config = getEncoderConfig(qualityKey, bitrateKey);
        if (!config) return;

        await screenTrack.setEncoderConfiguration({
            width: config.width,
            height: config.height,
            frameRate: config.frameRate,
            bitrateMin: config.bitrateMin,
            bitrateMax: config.bitrateMax
        });

        if (bitrateKey !== selectedBitrate) {
            selectedQuality = qualityKey;
            selectedBitrate = bitrateKey;
            setBitrateActive(selectedBitrate);
        }
        updateShareStatus();
    }

    async function autoDowngradeForWeakNetwork() {
        if (!screenTrack || isScreenPaused) return;
        var now = Date.now();
        if (now - lastAutoDowngradeAt < 20000) return;
        lastAutoDowngradeAt = now;

        if (!autoNetworkState.downgraded) {
            autoNetworkState.originalQuality = selectedQuality;
            autoNetworkState.originalBitrate = selectedBitrate;
        }

        var nextQuality = getQualityStepDown(selectedQuality);
        var nextBitrate = "low";

        try {
            await applyScreenQuality(nextQuality, nextBitrate);
            autoNetworkState.downgraded = true;
            networkNotice = "🟡 网络较弱，已自动降画质";
            updateShareStatus();
        } catch (err) {
            console.warn("自动降级失败:", err);
        }
    }

    async function autoRestoreAfterNetworkRecovery() {
        if (!screenTrack || isScreenPaused || !autoNetworkState.downgraded) return;
        var originalQuality = autoNetworkState.originalQuality || selectedQuality;
        var originalBitrate = autoNetworkState.originalBitrate || selectedBitrate;

        try {
            await applyScreenQuality(originalQuality, originalBitrate);
            autoNetworkState.downgraded = false;
            autoNetworkState.originalQuality = "";
            autoNetworkState.originalBitrate = "";
            autoNetworkState.goodSamples = 0;
            autoNetworkState.weakSamples = 0;
            networkNotice = "🟢 网络已恢复，画质已还原";
            updateShareStatus();
            clearTimeout(networkRecoveryTimer);
            networkRecoveryTimer = setTimeout(function () {
                if (!autoNetworkState.downgraded) {
                    networkNotice = "";
                    updateShareStatus();
                }
            }, 6000);
        } catch (err) {
            console.warn("自动恢复配置失败:", err);
            networkNotice = "🟡 网络已恢复，但自动回到原配置失败，请手动切换清晰度或码率";
            updateShareStatus();
        }
    }

    function bindClientHealthEvents(statusEl) {
        client.on("connection-state-change", function (curState, prevState, reason) {
            console.log("连接状态:", prevState, "->", curState, reason || "");
            if (curState === "RECONNECTING") {
                statusEl.innerText = "🟡 网络波动，正在重连...";
            } else if (curState === "FAILED") {
                statusEl.innerText = "🔴 连接失败，请刷新页面或切换网络后重试";
            }
        });

        client.on("network-quality", function (quality) {
            var uplink = quality.uplinkNetworkQuality;
            if (uplink >= 4) {
                autoNetworkState.weakSamples += 1;
                autoNetworkState.goodSamples = 0;
            } else if (uplink > 0 && uplink <= 2) {
                autoNetworkState.goodSamples += 1;
                autoNetworkState.weakSamples = 0;
            } else {
                autoNetworkState.weakSamples = 0;
                autoNetworkState.goodSamples = 0;
            }

            if (autoNetworkState.weakSamples >= 2) {
                autoDowngradeForWeakNetwork();
            } else if (autoNetworkState.goodSamples >= 4) {
                autoRestoreAfterNetworkRecovery();
            }
        });
    }

    async function cleanup() {
        closeActiveViewerRecords();
        var pauseBtn = document.getElementById("pauseBtn");
        isScreenPaused = false;
        currentShareHasLimit = false;
        totalSecondsRemaining = 0;
        resetAutoNetworkState();
        if (pauseBtn) {
            pauseBtn.style.display = "none";
            pauseBtn.disabled = false;
        }
        updatePauseButton();
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        if (screenTrack) {
            screenTrack.stop();
            screenTrack.close();
            screenTrack = null;
        }
        resetSharePreview();
        if (client) {
            await client.leave().catch(function () {});
            client = null;
        }
    }

    function initSharer() {
        var sharePromptInput = document.getElementById("sharePromptInput");
        var savedSharePrompt = localStorage.getItem(SHARE_PROMPT_KEY);
        if (savedSharePrompt === null || OLD_DEFAULT_SHARE_PROMPTS.indexOf(savedSharePrompt) !== -1) {
            savedSharePrompt = DEFAULT_SHARE_PROMPT;
            localStorage.setItem(SHARE_PROMPT_KEY, DEFAULT_SHARE_PROMPT);
        }
        if (sharePromptInput) {
            sharePromptInput.value = savedSharePrompt;
            sharePromptInput.addEventListener("input", function () {
                localStorage.setItem(SHARE_PROMPT_KEY, this.value);
            });
        }

        setupShareThemeToggle();
        loadSavedViewerRecords();
        setupPanelToggle("viewerList", true);

        // 清晰度选择逻辑
        document.querySelectorAll("#qualitySelector .control-item").forEach(function (item) {
            item.onclick = function () {
                var generateBtn = document.getElementById("generateBtn");
                if (generateBtn && generateBtn.disabled && !screenTrack) return;
                var nextQuality = item.getAttribute("data-q");
                selectedQuality = nextQuality;
                setQualityActive(selectedQuality);
                updateShareOverview();

                if (screenTrack) {
                    try {
                        applyScreenQuality(selectedQuality).catch(function (e) {
                            console.error("动态切换清晰度失败:", e);
                        });
                    } catch (e) {
                        console.error("动态切换清晰度失败:", e);
                    }
                }
            };
        });

        // 码率选择逻辑
        document.querySelectorAll("#bitrateSelector .control-item").forEach(function (item) {
            item.onclick = async function () {
                var generateBtn = document.getElementById("generateBtn");
                if (generateBtn && generateBtn.disabled && !screenTrack) return;
                resetAutoNetworkState();
                selectedBitrate = item.getAttribute("data-bitrate");
                setBitrateActive(selectedBitrate);
                if (screenTrack) {
                    try {
                        await applyScreenQuality(selectedQuality, selectedBitrate);
                        console.log("码率已动态切换为:", selectedBitrate);
                    } catch (e) {
                        console.error("动态切换码率失败:", e);
                    }
                }
            };
        });

        // 时长选择逻辑
        document.querySelectorAll("#durationSelector .control-item").forEach(function (item) {
            item.onclick = function () {
                var generateBtn = document.getElementById("generateBtn");
                if (generateBtn && generateBtn.disabled && !screenTrack) return;
                document.querySelectorAll("#durationSelector .control-item").forEach(function (i) { i.classList.remove("active"); });
                item.classList.add("active");

                var val = item.getAttribute("data-v");
                var customBox = document.getElementById("customDurationBox");
                if (val === "custom") {
                    if (customBox) customBox.style.display = "block";
                    selectedDuration = -1;
                } else {
                    if (customBox) customBox.style.display = "none";
                    selectedDuration = parseInt(val, 10);
                }

                if (client && client.connectionState === "CONNECTED") {
                    var newLimit = 0;
                    if (selectedDuration === -1) {
                        var customInput = document.getElementById("customMinutesInput");
                        newLimit = customInput ? (parseInt(customInput.value, 10) || 30) : 30;
                    } else {
                        newLimit = selectedDuration;
                    }

                    if (newLimit > 0) {
                        totalSecondsRemaining = newLimit * 60;
                        currentShareHasLimit = true;
                        if (!countdownTimer) {
                            startCountdown();
                        }
                        updateShareStatus();
                        console.log("时长已动态调整为:", newLimit, "分钟");
                    } else {
                        if (countdownTimer) {
                            clearInterval(countdownTimer);
                            countdownTimer = null;
                        }
                        currentShareHasLimit = false;
                        totalSecondsRemaining = 0;
                        updateShareStatus();
                    }
                }
            };
        });

        // 封装倒计时启动逻辑
        function startCountdown() {
            if (countdownTimer) clearInterval(countdownTimer);
            countdownTimer = setInterval(function () {
                totalSecondsRemaining--;
                if (totalSecondsRemaining <= 0) {
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                    alert("分享时间已到，投屏已自动结束。");
                    cleanup().finally(function () { window.location.reload(); });
                    return;
                }
                updateShareStatus();
            }, 1000);
        }

        // 自定义时长输入动态更新逻辑
        var customMinutesInput = document.getElementById("customMinutesInput");
        if (customMinutesInput) {
            customMinutesInput.addEventListener("input", function () {
                if (countdownTimer && selectedDuration === -1) {
                    var newLimit = parseInt(this.value, 10);
                    if (newLimit > 0) {
                        totalSecondsRemaining = newLimit * 60;
                        currentShareHasLimit = true;
                        updateShareStatus();
                    }
                }
            });
        }

        document.getElementById("generateBtn").onclick = async function () {
            var btn = document.getElementById("generateBtn");
            var pauseBtn = document.getElementById("pauseBtn");
            var status = document.getElementById("status");

            if (!getAppId()) {
                status.innerText = "🔴 分享失败: 缺少声网 APP_ID，请检查配置";
                return;
            }

            var preflightNotice = "";
            if (window.location.protocol === "file:") {
                preflightNotice = "🟡 当前是本地文件页面，生成的观看链接可能只在本机可用。";
            }

            var supportIssue = getShareSupportIssue();
            if (supportIssue) {
                preflightNotice = [preflightNotice, "🟡 " + supportIssue].filter(Boolean).join("\n");
            }

            var password = String(Math.floor(1000 + Math.random() * 9000));
            var roomId = Math.random().toString(36).substring(7);
            var channel = "oshare-" + roomId + "-" + password;
            var sharePrompt = sharePromptInput ? sharePromptInput.value.trim() : DEFAULT_SHARE_PROMPT;
            if (!sharePrompt) sharePrompt = DEFAULT_SHARE_PROMPT;
            localStorage.setItem(SHARE_PROMPT_KEY, sharePrompt);
            if (sharePromptInput) sharePromptInput.value = sharePrompt;

            try {
                btn.disabled = true;
                resetAutoNetworkState();
                status.innerText = preflightNotice || "正在加载投屏组件...";
                await window.ensureAgoraSdk();
                status.innerText = preflightNotice ? preflightNotice + "\n正在请求共享权限..." : "正在请求共享权限...";

                var AgoraRTC = window.AgoraRTC;
                client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
                bindClientHealthEvents(status);

                var config = getEncoderConfig(selectedQuality);

                try {
                    screenTrack = await AgoraRTC.createScreenVideoTrack({
                        optimizationMode: "detail",
                        encoderConfig: {
                            width: config.width,
                            height: config.height,
                            frameRate: config.frameRate,
                            bitrateMin: config.bitrateMin,
                            bitrateMax: config.bitrateMax
                        }
                    }, "auto");
                } catch (trackError) {
                    console.error("Track Error:", trackError);
                    var msg = "权限请求失败";
                    if (trackError.code === "PERMISSION_DENIED") msg = "未获得屏幕共享权限，请点击允许";
                    else if (trackError.message && trackError.message.indexOf("Could not get display media") !== -1) msg = "浏览器由于硬件压力或安全策略拒绝了请求";
                    throw new Error(msg);
                }

                status.innerText = preflightNotice ? preflightNotice + "\n正在获取连接凭证..." : "正在获取连接凭证...";
                var token = await fetchAgoraToken(channel, "sharer");

                await client.join(getAppId(), channel, token, "sharer");
                bindTokenRenewal(client, channel, "sharer", appendShareNotice);
                await client.publish(screenTrack);

                // 生成观看链接（适配当前域名）
                var baseUrl = window.location.origin + window.location.pathname.replace(/[^\/]*$/, "");
                var hashParams = new URLSearchParams({ room: roomId, pwd: password });
                var watchUrl = baseUrl + "index.html#" + hashParams.toString();

                currentRecordsKey = "sc_viewer_records_" + roomId + "_" + password;
                activeViewerRecords.clear();
                saveViewerRecords();
                renderViewerRecords();

                var urlContainer = document.getElementById("urlContainer");
                if (urlContainer) urlContainer.innerText = watchUrl;

                var shareInfoEl = document.getElementById("shareInfo");
                if (shareInfoEl) shareInfoEl.style.display = "block";

                var viewerListEl = document.getElementById("viewerList");
                if (viewerListEl) viewerListEl.style.display = "block";

                var viewerRecordPanel = document.getElementById("viewerRecordPanel");
                if (viewerRecordPanel) viewerRecordPanel.style.display = "block";

                setShareSidePanelsVisible(true);
                mountSharePreview();

                var promptPreview = document.getElementById("promptPreview");
                if (promptPreview) {
                    if (sharePrompt) {
                        promptPreview.innerText = sharePrompt;
                        promptPreview.style.display = "block";
                    } else {
                        promptPreview.innerText = "";
                        promptPreview.style.display = "none";
                    }
                }

                // 倒计时初始化
                var limitMinutes = 0;
                if (selectedDuration === -1) {
                    var customInput = document.getElementById("customMinutesInput");
                    limitMinutes = customInput ? (parseInt(customInput.value, 10) || 30) : 30;
                } else {
                    limitMinutes = selectedDuration;
                }

                currentShareHasLimit = limitMinutes > 0;
                if (limitMinutes > 0) {
                    totalSecondsRemaining = limitMinutes * 60;
                    startCountdown();
                } else {
                    totalSecondsRemaining = 0;
                }
                updateShareStatus();
                appendShareNotice(preflightNotice);

                btn.innerText = "停止投屏";
                btn.classList.add("active");
                if (sharePromptInput) sharePromptInput.disabled = true;
                isScreenPaused = false;
                updatePauseButton();
                pauseBtn.style.display = "block";
                pauseBtn.onclick = toggleScreenPause;
                pauseBtn.disabled = false;
                scrollShareControlsIntoView();

                btn.onclick = async function () {
                    await cleanup();
                    window.location.reload();
                };
                btn.disabled = false;

                document.getElementById("copyUrl").onclick = function () {
                    var text = sharePrompt + "\n" + watchUrl;
                    navigator.clipboard.writeText(text)
                        .then(function () { showCopyToast("邀请信息已复制"); })
                        .catch(function () { showCopyToast("复制失败，请手动复制链接"); });
                };

                // 观众状态监听与透传解析
                client.on("user-joined", function (user) {
                    if (typeof user.uid !== "string" || !user.uid.startsWith("viewer|")) return;
                    var info = parseViewerInfo(user.uid);
                    var deviceKey = getViewerDeviceKey(user.uid, info);

                    var existingRecord = activeViewerRecords.get(deviceKey);
                    if (existingRecord) {
                        var activeAgoraUids = Array.isArray(existingRecord.activeAgoraUids)
                            ? existingRecord.activeAgoraUids
                            : [existingRecord.agoraUid].filter(Boolean);
                        if (activeAgoraUids.indexOf(user.uid) === -1) activeAgoraUids.push(user.uid);

                        existingRecord.agoraUid = user.uid;
                        existingRecord.activeAgoraUids = activeAgoraUids;
                        existingRecord.info = info;
                        saveViewerRecords();
                        updateActiveViewer(existingRecord);
                        renderViewerRecords();
                        return;
                    }

                    var pastVisits = viewerRecords.filter(function (record) {
                        return getViewerDeviceKey(record.agoraUid || "", record.info || {}) === deviceKey;
                    }).length;
                    info.visits = pastVisits + 1;

                    var record = {
                        id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
                        deviceKey: deviceKey,
                        agoraUid: user.uid,
                        activeAgoraUids: [user.uid],
                        info: info,
                        openedAt: new Date().toISOString(),
                        endedAt: null
                    };

                    viewerRecords.push(record);
                    activeViewerRecords.set(deviceKey, record);
                    saveViewerRecords();
                    appendActiveViewer(record);
                    renderViewerRecords();
                });

                client.on("user-left", function (user) {
                    if (typeof user.uid !== "string" || !user.uid.startsWith("viewer|")) return;
                    var info = parseViewerInfo(user.uid);
                    var deviceKey = getViewerDeviceKey(user.uid, info);
                    var record = activeViewerRecords.get(deviceKey);
                    if (record) {
                        var activeAgoraUids = Array.isArray(record.activeAgoraUids)
                            ? record.activeAgoraUids
                            : [record.agoraUid].filter(Boolean);
                        record.activeAgoraUids = activeAgoraUids.filter(function (uid) { return uid !== user.uid; });
                        if (record.activeAgoraUids.length > 0) {
                            saveViewerRecords();
                            renderViewerRecords();
                            return;
                        }
                        if (!record.endedAt) {
                            record.endedAt = new Date().toISOString();
                        }
                        activeViewerRecords.delete(deviceKey);
                    }
                    saveViewerRecords();
                    renderViewerRecords();

                    var el = record ? document.getElementById("viewer-" + record.id) : null;
                    if (el) el.remove();
                    syncDurationRefreshTimer();
                });

                // 监听停止共享
                screenTrack.on("track-ended", function () {
                    cleanup().finally(function () { window.location.reload(); });
                });

            } catch (err) {
                console.error("Share Error:", err);
                status.innerText = "🔴 分享失败: " + (err.message || "系统繁忙，请刷新再试");
                btn.disabled = false;
                pauseBtn.style.display = "none";
                pauseBtn.disabled = false;
                isScreenPaused = false;
                updatePauseButton();
                if (sharePromptInput) sharePromptInput.disabled = false;
                if (screenTrack) {
                    screenTrack.stop();
                    screenTrack.close();
                }
                resetSharePreview();
                if (client) await client.leave().catch(function () {});
            }
        };

        window.onbeforeunload = function () {
            closeActiveViewerRecords();
            cleanup();
        };

        window.addEventListener("resize", function () {
            syncShareSidePanelTop();
            syncShareSidePanelHPosition();
            sizeSharePreview(document.getElementById("sharePreviewVideo"));
        });
        window.addEventListener("scroll", syncShareSidePanelTop, { passive: true });
    }

    // ═══════════════════════════════════════════════════════════
    //  版本角标（原 version.js，仅分享端）
    // ═══════════════════════════════════════════════════════════

    function renderVersion() {
        var vt = document.getElementById("version-text");
        if (!vt) return;

        fetch("assets/version.json?t=" + Date.now(), { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) throw new Error("Failed to load version");
                return response.json();
            })
            .then(function (data) {
                if (data.shortSha) {
                    vt.textContent = data.shortSha;
                }
            })
            .catch(function () {
                vt.textContent = "unknown";
            });
    }

    // ═══════════════════════════════════════════════════════════
    //  启动分流
    // ═══════════════════════════════════════════════════════════

    document.addEventListener("DOMContentLoaded", function () {
        if (window.IS_VIEWER) {
            initViewer();
        } else {
            initSharer();
            renderVersion();
        }
    });

})();
