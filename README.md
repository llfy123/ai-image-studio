# AI Image Studio

一个仿 img2.ai 工作台风格的本地 AI 生图页面，后端通过小鸡聚合AI的 OpenAI 兼容接口代理请求，避免把 API Key 暴露到浏览器。

## 启动

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量示例并填入你的密钥：

```bash
copy .env.example .env
```

然后把 `.env` 里的 `XIAOJI_API_KEY` 改成你在小鸡聚合AI控制台创建的 `sk-jp-` 开头密钥。

3. 启动服务：

```bash
npm run dev
```

打开 `http://localhost:3000`。

## 已接入接口

- 文生图：`POST /v1/images/generations`
- 图生图：`POST /v1/images/edits`

本地页面调用的是后端代理：

- `POST /api/images/generations`
- `POST /api/images/edits`

## 参考

- UI 风格参考：https://img2.ai/zh
- 接口文档：https://xiaoji.baziapi.site/docs

## 部署到 Render

仓库根目录包含 `render.yaml`，可以在 Render 里用 Blueprint 部署：

1. 打开 Render Dashboard，选择 New Blueprint。
2. 连接这个 GitHub 仓库。
3. Render 会识别 `render.yaml` 并创建一个 Node Web Service。
4. 在提示填写环境变量时，填入 `XIAOJI_API_KEY`。
5. 部署完成后打开 Render 给出的公网地址。

不要把 `.env` 上传到 GitHub；生产环境密钥只在 Render 的环境变量里配置。
