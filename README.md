# oSharer

基于声网 RTC 的网页端屏幕共享，分享链接即可发起投屏，观众点击链接即可实时观看。支持访客统计与自适应画质。

Web-based screen sharing built on Agora RTC. Share your screen via a link, and viewers can watch in real time with a single click. Features visitor analytics and adaptive video quality.

## 使用方式 / Usage

### 本地开发 / Local

1. 编辑 `.env` 文件，配置 `AGORA_APP_ID`
2. 运行 `node scripts/serve.js`
3. 打开 `http://localhost:4173/sharer.html`（投屏端）或 `http://localhost:4173/index.html`（观看端）

### 直接打开 / Open Directly

HTML 文件中内联了 placeholder，直接使用会提示需要配置 APP_ID。你可以编辑 HTML 文件，将 `__AGORA_APP_ID_VALUE__` 替换为你的真实 APP_ID，然后双击打开即可。

### 部署到任意平台 / Deploy

在部署时执行 `node scripts/inject-env.js` 注入 APP_ID，然后上传生成的 HTML 文件。
