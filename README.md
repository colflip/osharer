# oSharer

基于声网 RTC 的网页端屏幕共享，分享链接即可发起投屏，观众点击链接即可实时观看。支持访客统计与自适应画质。

Web-based screen sharing built on Agora RTC. Share your screen via a link, and viewers can watch in real time with a single click. Features visitor analytics and adaptive video quality.

## 使用方式 / Usage

### 本地开发 / Local

1. 编辑 `.env` 文件，配置 `AGORA_APP_ID`
2. 运行 `node scripts/serve.js`
3. 打开 `http://localhost:4173/sharer.html`

### 直接打开 / Open Directly

HTML 文件没有硬编码任何 APP_ID。如果找不到 `config.json`，会使用占位符。

### 部署 / Deploy

将项目文件上传到任意静态托管服务（Render、GitHub Pages、Nginx 等），然后**单独上传一个 `config.json` 文件**：

```json
{ "appId": "你的声网APP_ID" }
```

这个文件不会被 git 跟踪（已加入 `.gitignore`），密钥不会暴露在任何代码中。页面运行时自动 fetch 它。
