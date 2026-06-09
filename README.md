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

#### Render Static Site

1. 在 Render 服务的 Environment 里添加 `AGORA_APP_ID`
2. **Build Command**: `node scripts/render-build.js`
3. **Publish Directory**: `.`

每次 push 到 GitHub，Render 会自动拉取并执行 Build Command，从环境变量生成 `config.json`，再发布到 CDN。`config.json` 不进 git，APP_ID 也不在源码里。

> 注意：Static Site 没有运行时，最终 `config.json` 会随静态资源公开下发，访问者仍能看到 APP_ID。声网鉴权请配合 Token / App Certificate。

#### 其他静态托管

手动放一份 `config.json` 到部署目录即可：

```json
{ "appId": "你的声网APP_ID" }
```
