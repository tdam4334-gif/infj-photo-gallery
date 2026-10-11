# 心隅 · 固定网址部署（Cloudflare Workers + KV）

## 正式固定地址

**https://infj-gallery.infj-gallery.workers.dev**

- 页面 + 共享上传 API 同域
- 云端 KV 存储，不依赖本机开机
- 存储引擎：Workers KV（`infj-photos` namespace）

## 本地再部署

```bash
cd cloud
npm i
npx wrangler deploy
```

## 风险
- 公开上传无审核，仅适合熟人小圈子
- KV 免费额度有限（约 1GB 存储 / 每日写次数有限），照片很多时需换 R2
- 请勿提交 `.wrangler/` 或 API Token
