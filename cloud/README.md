# 心隅 · 固定网址部署（Cloudflare Workers + R2）

## 目标
- 长期固定 https 地址（`*.workers.dev`，不随本机开关机变化）
- 共享上传：所有人写入同一存储，彼此可见
- 不依赖本机开机

## 为什么必须上云
静态 GitHub Pages 不能安全接收匿名上传。写入需要服务端密钥；
把密钥放进网页会被人盗用刷存储。因此用 Cloudflare Worker 在服务端持密钥，
R2 存图片，前端只调 `/api/*`。

## 费用
Cloudflare 免费版通常足够：Workers 10 万请求/天，R2 10GB 存储。
以官方当前条款为准（部署前请确认）。

## 部署步骤（约 5 分钟，只需做一次）

1. 注册/登录 Cloudflare：https://dash.cloudflare.com/sign-up
2. 安装部署工具并登录：
   ```bash
   npm i -g wrangler
   wrangler login
   ```
3. 创建 R2 桶并部署 Worker：
   ```bash
   cd infj-gallery/cloud
   wrangler r2 bucket create infj-photos
   wrangler deploy
   ```
4. 记下输出的固定地址，例如：
   `https://infj-gallery.<你的子域>.workers.dev`
   把这个地址发给朋友即可。

## 本地开发
```bash
cd cloud
wrangler dev
```

## 与 GitHub Pages 的关系
- Pages 可继续作静态预览（展示示例图）
- **真正共享上传请使用 Worker 固定地址**
- 可把 Pages 首页改成跳转到 Worker 地址（可选）

## 风险
- 公开上传无审核，仅适合熟人小圈子
- R2/Workers 免费额度用尽后需升级或清理
- 请勿把 `wrangler` 的 API Token 提交进 Git
