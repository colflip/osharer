// Vercel serverless 入口。签发逻辑全部在 _token-core.js，
// 与 Render / 本地的 server.js 共用同一份实现。
//
// 注：api/ 下以 _ 开头的文件不会被 Vercel 当作路由，适合放共享代码。

const { issueToken } = require("./_token-core");

module.exports = function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "method not allowed" });
        return;
    }

    // Vercel 通常已按 Content-Type 解析好 body，但字符串/空值都要兜住。
    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body || "{}");
        } catch (e) {
            res.status(400).json({ error: "invalid request body" });
            return;
        }
    }

    const result = issueToken(body || {});
    res.setHeader("Cache-Control", "no-store");
    res.status(result.status).json(result.body);
};
