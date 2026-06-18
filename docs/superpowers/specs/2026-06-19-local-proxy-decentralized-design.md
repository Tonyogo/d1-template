# 2026-06-19 去中心化本地大模型中转与自适应 OCR 解析架构

## 1. 痛点与深度考量

在复杂的公网网络环境下，Cloudflare 线上 Worker 直接向境外 Gemini 官方接口发起大模型图像解析（OCR）请求容易遇到高波动、高丢包、甚至频繁失败和连接超时。
虽然用户在本地运行着极其稳定且低延迟的大模型中转/代理服务，但**本地开发环境与线上生产环境并不共用数据，且线上远端 Worker 无法突破物理内网隔离去连接用户的本地中转。**

**去中心化混合 OCR 解决方案**：
在前端（浏览器）引入**智能双轨自路由决策引擎**：
1. **本地中转优先（场景 A）**：用户在上传界面可以提供可选的、可折叠的“本地中转自定义配置”（API Base、API Key、Model 以及 API 协议类型，如 Gemini / OpenAI 多模态）。
   - 前端浏览器通过一次超短超时探测（Probe）判定本地服务是否在线可达。
   - 若可达，前端点击“开始解析”时，先在前端将暂存图片 Blob 读取并转换为 base64，随后**直接由浏览器发起 fetch 直连本地大模型中转**。
   - 拿到 Markdown 文本后，将其直接 POST 到后端全新接口 `/api/batch/commit-parsed`。
   - 后端云端 Worker 仅仅做“Markdown 数据库写入”和“R2 图片正式归档”，**完全不消耗大模型流量和调用等待**，实现秒级高品质入库！
2. **云端代理降级（场景 B）**：如果未配置本地中转或本地服务不在线，系统无感地平滑切换为原有流程，即请求 `/api/batch/process`，由线上后端代理公网 Gemini 服务。

---

## 2. 系统交互时序

```
[用户浏览器]                         [本地中转 (OpenAI/Gemini)]                [后端 Cloud Worker]
    |                                          |                                         |
    |-- 1. 自主配置本地 API 并在前端存储 ------>|                                         |
    |                                          |                                         |
    | (点击 "解析" / "一键队列处理")           |                                         |
    |-- 2. 尝试连通本地中转 ------------------>|                                         |
    |<-- 3. [成功] 本地服务可用 ---------------|                                         |
    |                                          |                                         |
    |-- 4. 发送获取图片 Blob 请求 --------------------------------------------->|
    |<-- 5. 返回图片二进制 Blob -------------------------------------------------|
    |                                          |                                         |
    |-- 6. [浏览器直连] 发送 Blob 转换为 Base64 ->|                                         |
    |<-- 7. 瞬间提取出 Markdown 文本 ----------|                                         |
    |                                          |                                         |
    |-- 8. 提交 Markdown 结果 (commit-parsed) ----------------------------------->|
    |                                                                            | (进行 OcrParser 解析，
    |                                                                            |  执行级联数据库事务写入，
    |                                                                            |  R2 暂存移动归档并清除)
    |<-- 9. 秒级返回落库成功 -----------------------------------------------------|
```

---

## 3. 后端新接口设计

### 3.1 提交已解析的 Markdown 入库与归档
* **端点**: `POST /api/batch/commit-parsed`
* **Content-Type**: `application/json`
* **入参**:
  ```json
  {
    "key": "images/pending/1717945600000_fupan.png",
    "date": "2026-06-19",
    "rawMarkdown": "# 涨停复盘\n..."
  }
  ```
* **后端行为**:
  1. 验证 `key` 的 pending 文件夹合法性前缀。
  2. 直接利用工具类 `OcrParser.parseOcrMarkdown(rawMarkdown)` 进行结构化分拆，提取 summary、sectors、stocks。
  3. 通过 D1 Batch 多表级联级联事务将数据写入，删除该日旧纪录。
  4. 读取 R2 暂存对象，拷贝归档到 `images/${date}.${ext}`，并彻底物理删除 R2 下 `key` 的暂存。
* **响应**:
  ```json
  {
    "success": true,
    "summary": { "date": "2026-06-19", "stock_count": 85 },
    "sectorsCount": 7,
    "stocksCount": 42
  }
  ```

---

## 4. 前端大模型 API 协议适配

为了让前端能够连通本机的任何大模型中转平台，我们将同时支持以下两种大模型多模态请求。

### 4.1 Google Gemini 协议
* **URL**: `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`
* **Payload**:
  ```json
  {
    "contents": [{
      "parts": [
        { "inlineData": { "data": base64String, "mimeType": mimeType } },
        { "text": "请对输入图片执行以下任务：1. 提取图片中所有可见文字 2. 保持原始阅读顺序 3. 按内容结构转换为 Markdown 4. 只输出最终 Markdown 格式" }
      ]
    }]
  }
  ```

### 4.2 OpenAI / One-API 多模态兼容协议
* **URL**: `${apiBase}/v1/chat/completions`
* **Headers**: `Authorization: Bearer ${apiKey}`
* **Payload**:
  ```json
  {
    "model": model,
    "messages": [{
      "role": "user",
      "content": [
        { "type": "text", "text": "请对输入图片执行以下任务：1. 提取图片中所有可见文字 2. 保持原始阅读顺序 3. 按内容结构转换为 Markdown 4. 只输出最终 Markdown 格式" },
        { "type": "image_url", "image_url": { "url": "data:${mimeType};base64,${base64String}" } }
      ]
    }]
  }
  ```

---

## 5. 前端可视化中转设置卡片 (LocalStorage 缓存)

我们将在“上传复盘长图”页面底部添加一个可收起/折叠的高端设置区：
* **输入项**：
  - **启用本地中转优先 (Toggle 开关)**
  - **API 协议类型**：Gemini / OpenAI (下拉框)
  - **API Base 地址** (例如：`http://127.0.0.1:3000`)
  - **API Key** (可选，如本地不需要 key 允许留空)
  - **模型名称 (Model)** (例如：`gemini-flash-latest` / `gpt-4o-mini` / `qwen-vl` 等)
* **自动保存**：所有字段变动自动利用 `localStorage.setItem` 进行持久化同步。

通过这套卓越架构，您的本地网络中转成为了云端生产和本地开发通用的超级动力加速器！
