# 2026-06-19 两步式暂存与延迟 OCR 处理设计规范

## 1. 背景与痛点

目前系统在处理复盘图片上传时，由于 Gemini OCR 服务存在网络或第三方稳定性波动，容易在“上传 + 调用 Gemini + D1 事务入库”的长流水线中产生超时或连接失败。
同时，原“批量处理”机制强制要求图片在上传时即与日期严格绑定，并使用 `images/pending/YYYY-MM-DD.ext` 的强绑定路径。如果上传时未明确指定日期，极易出错。

**优化方案**：
引入**两步式上传与延迟处理机制 (Deferred OCR)**：
1. **第一步（无感上传暂存）**：用户直接将图片推送到 R2 的 `images/pending/` 目录。不要求提供日期，也不在第一阶段调用任何大模型服务，极速上传，保障第一步的成功率。
2. **第二步（按需预览与选期解析）**：系统在 R2 中扫描出所有待处理的图片并展现。用户在前端可视化界面中浏览图片缩略图，核实复盘日期，选择/修改绑定日期后，一键触发大模型 OCR，安全合规入库，最终移入归档目录。

---

## 2. 系统架构与数据流 (Data Flow)

### 2.1 整体时序流程图
```
[用户/前端]                         [后端 Controller/Service]                  [云存储/大模型/数据库]
    |                                          |                                         |
    |---- 1. 上传图片 (无须日期) ------------->|                                         |
    |                                          |---- 2. 写入 pending 路径 -------------->| [R2 Bucket]
    |                                          |                                         | (images/pending/${timestamp}_${orig_name})
    |                                          |                                         |
    |---- 3. 加载待处理图片列表 -------------->|                                         |
    |                                          |---- 4. 获取 pending 目录文件 ---------->| [R2 Bucket]
    |<--- 5. 返回待处理数组 (带有原始名/属性) -|                                         |
    |                                          |                                         |
    |---- 6. 请求缩略图预览 (key=...) -------->|                                         |
    |<--- 7. 返回图片二进制流 -----------------|---- 8. 从 R2 读取 -------------------->| [R2 Bucket]
    |                                          |                                         |
    |---- 9. 选定日期并启动处理 (key, date) -->|                                         |
    |                                          |---- 10. 拉取该 pending 图片 ----------->| [R2 Bucket]
    |                                          |---- 11. 调用 Gemini 做 OCR ---------->| [Gemini AI]
    |                                          |---- 12. 解析并执行 D1 级联写入 -------->| [D1 Database]
    |                                          |---- 13. 重命名并移入 formal 归档 ------>| [R2 Bucket]
    |                                          |         (images/${date}.${ext})         |
    |                                          |---- 14. 删除原 pending 暂存文件 -------->| [R2 Bucket]
    |<--- 15. 返回入库统计与解析详情 -----------|                                         |
```

---

## 3. 后端 RESTful API 接口设计

### 3.1 暂存上传图片 (改写现有接口)
* **端点**: `POST /api/batch/upload`
* **MIME**: `multipart/form-data`
* **入参**:
  * `image`: `File` (图片文件)
  * `date` (可选): 用于在能够从外部获取日期时，保留建议日期。
* **后端行为**:
  * 提取原文件名：`file.name`。
  * 将图片写在 R2 的 `images/pending/${Date.now()}_${file.name}`。
* **响应**:
  ```json
  {
    "success": true,
    "imageKey": "images/pending/1717945600000_20260619_fupan.png"
  }
  ```

### 3.2 待处理图片列表
* **端点**: `GET /api/pending-images`
* **入参**: 无
* **后端行为**:
  * 调用 `BUCKET.list({ prefix: "images/pending/" })`。
  * 遍历 R2 实体对象，将其大小、上传时间、R2 密钥等汇总。
  * **智能优化**：通过文件名使用正则表达式匹配日期（形如 `YYYY-MM-DD` / `YYYYMMDD` 等），如果匹配成功，在返回的实体中作为 `suggestedDate` 推荐给前端作为日期默认值。
* **响应**:
  ```json
  [
    {
      "key": "images/pending/1717945600000_2026-06-19_review.png",
      "originalName": "2026-06-19_review.png",
      "size": 1048576,
      "uploadedAt": "2026-06-19T08:00:00.000Z",
      "suggestedDate": "2026-06-19"
    }
  ]
  ```

### 3.3 获取待处理图片预览
* **端点**: `GET /api/pending-image`
* **入参**: `key` (查询参数，例如 `?key=images/pending/1717945600000_2026-06-19_review.png`)
* **后端行为**:
  * 校验参数。
  * 调用 `BUCKET.get(key)`，如不存在返回 404。
  * 将图片二进制内容返回给前端，配置正确的 `Content-Type` 和缓存控制。

### 3.4 指定图片进行 OCR 及入库 (改造现有接口)
* **端点**: `POST /api/batch/process`
* **Content-Type**: `application/json`
* **入参**:
  ```json
  {
    "key": "images/pending/1717945600000_2026-06-19_review.png",
    "date": "2026-06-19"
  }
  ```
* **后端行为**:
  1. 调用 `BUCKET.get(key)` 拉取该待处理图。
  2. 提取出图片的后缀名（如 `png`）。
  3. 执行 Gemini OCR 接口调用，将大模型提取的信息分拆，通过 D1 Batch 级联更新该日期的复盘数据。
  4. 将图片归档拷贝至 `images/${date}.${ext}`。
  5. 删除 R2 中的旧文件：`BUCKET.delete(key)`。
* **响应**:
  ```json
  {
    "success": true,
    "summary": { "date": "2026-06-19", "stock_count": 80, "upgrade_rate": 20.5 },
    "sectorsCount": 6,
    "stocksCount": 35
  }
  ```

---

## 4. 前端组件交互演进

### 4.1 待处理文件控制台
在“复盘图上传”页面，增加一个**“云端待处理图片列表”**面板：
* **实时同步**：进入页面自动调取 `GET /api/pending-images`，若存在待处理图，渲染直观明了的待处理表格。
* **双向绑定与建议日期**：
  * 文件项旁边配备直观的「日期选择器 `<input type="date">`」。
  * 默认填充 `suggestedDate`（如果有），若文件名中没有提取到日期，则留空并高亮预警，要求用户手动设定。
* **极速预览**：
  * 每个任务在最左侧配备微型缩略图，图片的 `src` 绑定为 `/api/pending-image?key=${encodeURIComponent(task.key)}`。
  * 点击缩略图可唤出极富美感的全屏遮罩（Modal）放大预览，方便复核图片中顶部的“复盘日期”。
* **操作流**：
  * 每一行右侧设有「开始处理」按钮（调用 `/api/batch/process`）和「删除」垃圾桶按钮。
  * 点下「开始处理」后，当前行进入 loading 状态，而其他行可以继续保持交互，成功后该行伴随淡出动画移除，且联动刷新大看板的复盘数据。

---

## 5. 模块解耦与隔离设计

### 5.1 数据访问与存储解耦
* **ImageService**:
  * 拓展 `getPendingImage(key: string)` 方法，专注于从 R2 获取原始 R2Object。
* **UploadService**:
  * 拓展 `listPendingImages()` 纯逻辑。
  * 改造 `stashPendingImage` 与 `processStashedImage(key, date)`，完全屏蔽 Hono Context 的直接渗透，确保底层能够进行独立测试。

---

## 6. 异常控制与健壮性保障
* **文件安全性限制**：严格限制只读取以 `images/pending/` 为前缀的 Key，防止任意路径穿越、注入和删除其他正式图片。
* **重名保护**：采用 `Date.now() + "_" + originalName` 作为 R2 的 Key 暂存机制，绝对规避高并发、高频多次上传造成的文件被直接悄悄覆盖的风险。
* **容错恢复**：在调用 Gemini OCR 大模型出现断线或报错时，并不破坏已经在 R2 暂存的源图片。用户可以再次点击“开始处理”发起重试。
