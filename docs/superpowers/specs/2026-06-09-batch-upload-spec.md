---
name: batch-upload-spec
description: Design a 2-step batch upload system where images are first stashed to R2 pending folder, and then processed sequentially through Gemini OCR.
metadata:
  type: project
---

# 🚀 批量图片上传与异步处理设计规格书 (Batch Upload SPEC)

本文档规范了项目中 A股涨停复盘批量长图上传与分步结构化数据入库的系统设计。该优化主要用于解决多张图片在 Serverless 环境下同步请求导致超时熔断、网关阻断以及前端无响应的问题。

---

## 🏛️ 1. 系统核心设计

我们将处理流程拆分为两个完全独立的阶段：

### 阶段 1：极速暂存阶段 (Stashing Phase)
* **交互**：用户在前端多选或拖入多张长图，前端并行（并发数为 3）调取 `POST /api/batch/upload`。
* **物理位置**：图片被快速暂存入 R2 桶中的 `images/pending/{date}.{ext}` 临时前缀文件夹，并不进行数据库和大模型交互。数秒内即可暂存完毕。

### 阶段 2：异步调用与状态机处理 (Processing Phase)
* **交互**：前端在全部图片暂存成功后，通过异步任务调度队列，以并发数 1（严格串行）依次向后端发送处理指令 `POST /api/batch/process`。
* **物理处理**：
  1. 后端读取 `images/pending/{date}.{ext}`。
  2. 传送给 Gemini OCR 析出 Markdown 并清洗。
  3. 执行 D1 数据库合并事务清空并批量插入新结果。
  4. 将图片从 `images/pending/` 剪切、重命名并正式归档到 `images/{date}.{ext}`。
* **优点**：完美兼容 Cloudflare Workers 的 CPU 限制，进度可视化，具有高强度的重试容错性。

---

## 📂 2. 后端新增方法定义

### 2.1 `src/services/upload.service.ts`
新增以下两个接口方法：
* `stashPendingImage(file: File, date: string): Promise<{ success: boolean; imageKey: string }>`
* `processStashedImage(date: string): Promise<UploadResult>`

### 2.2 `src/controllers/upload.ts`
新增并注册以下路由：
* `POST /api/batch/upload` ── 控制器接收 file 与 date，暂存 R2。
* `POST /api/batch/process` ── 控制器接收 JSON `{ date }`，触发归档。

---

## 🎨 3. 前端批量控制台设计

* **多选支持**：`<input type="file" id="file-input" multiple>`。
* **列表视图**：拖入单张图正常显示单图上传，拖入多张图自动激活 **批量上传控制面板**。
* **高阶状态机模型**：
  * `idle` (排队中)
  * `stashing` (上传中)
  * `stashed` (已暂存)
  * `processing` (OCR中)
  * `completed` (成功)
  * `failed` (失败)
