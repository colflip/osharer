// Agora Token 签发核心逻辑。
// server.js（Render / 本地）与 api/token.js（Vercel）共用这一份实现，
// 保证三处环境行为完全一致。

const { RtcTokenBuilder, RtcRole } = require("agora-token");

// 与 sharer.js:1012 的 `oshare-${roomId}-${password}` 保持一致。
// roomId 来自 Math.random().toString(36).substring(7)（小写字母数字，偶发为空串），
// password 是 4 位数字。
//
// 收紧频道名是这个公开端点最实在的一道防线：防止他人借本项目
// 为任意频道签发 token、消耗账号额度。
const CHANNEL_RE = /^oshare-[a-z0-9]{0,32}-\d{4}$/;

// Agora String User Account 上限 255 字节。
// 观众端 uid 是拼接的设备信息（viewer.js:204），约 150 字符。
const MAX_ACCOUNT_BYTES = 255;

const TOKEN_TTL_SECONDS = 3600;
const SHARER_UID = "sharer";

// 续期逻辑只有等到 token 快过期才会触发，默认 1 小时不便验证。
// 设 AGORA_TOKEN_TTL=60 可让 SDK 在约 30 秒后触发续期，便于本地实测。
// 在函数内读取而非模块加载时读取：server.js 是先 require 本模块、后加载 .env。
function resolveTtlSeconds() {
    const raw = Number(process.env.AGORA_TOKEN_TTL);
    return Number.isFinite(raw) && raw >= 60 && raw <= 86400 ? raw : TOKEN_TTL_SECONDS;
}

function issueToken(input) {
    const channel = typeof input?.channel === "string" ? input.channel : "";
    const uid = typeof input?.uid === "string" ? input.uid : "";

    if (!CHANNEL_RE.test(channel)) {
        return { status: 400, body: { error: "invalid channel" } };
    }
    if (!uid || Buffer.byteLength(uid, "utf8") > MAX_ACCOUNT_BYTES) {
        return { status: 400, body: { error: "invalid uid" } };
    }

    const appId = process.env.AGORA_APP_ID || "";
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || "";

    if (!appId) {
        return { status: 500, body: { error: "AGORA_APP_ID is not configured" } };
    }

    // 未配置证书 = 项目处于测试模式，不需要 token。
    // 返回 null 让客户端以静态 App ID 入频道，保持向后兼容。
    if (!appCertificate) {
        return { status: 200, body: { token: null, mode: "static" } };
    }

    // uid 是字符串（承载访客统计信息），必须用 User Account 版本签发，
    // 不能用更常见的 buildTokenWithUid。
    //
    // 只有分享端拿发布权限，观众一律 SUBSCRIBER，防止劫持推流。
    const role = uid === SHARER_UID ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const ttl = resolveTtlSeconds();

    const token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCertificate,
        channel,
        uid,
        role,
        ttl,
        ttl
    );

    return {
        status: 200,
        body: {
            token,
            mode: "dynamic",
            expiresIn: ttl,
            role: role === RtcRole.PUBLISHER ? "publisher" : "subscriber",
        },
    };
}

module.exports = { issueToken, CHANNEL_RE, resolveTtlSeconds };
