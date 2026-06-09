# oSharer

基于声网 RTC 的网页端屏幕共享，直接打开 HTML 即可使用，无需构建或部署。分享链接即可发起投屏，观众点击链接即可实时观看。支持访客统计与自适应画质。

Web-based screen sharing built on Agora RTC. Open the HTML file directly in your browser — no build or deployment step required. Share your screen via a link, and viewers can watch in real time with a single click. Features visitor analytics and adaptive video quality.

## 快速开始 / Quick Start

### 本地使用 / Local

1. 将项目文件下载到本地
2. 在 `.env` 文件中配置 `AGORA_APP_ID`
3. 运行 `npm run serve` 或用任意静态服务器打开
4. 访问 `http://localhost:4173/sharer.html`（投屏端）或 `http://localhost:4173/index.html`（观看端）

也可通过 URL 参数传入 APP_ID：
```
http://localhost:4173/sharer.html?app_id=YOUR_AGORA_APP_ID
```

### 远程部署 / Remote Deployment

将项目文件上传到任意静态文件托管服务（GitHub Pages、Cloudflare Pages、Nginx 等），无需任何构建步骤。如需指定 APP_ID，可通过 URL 参数 `?app_id=xxx` 传入。

## 环境变量 / Environment

- `AGORA_APP_ID` — 声网应用 ID，可通过 `.env` 文件或 URL 参数 `?app_id=` 配置
