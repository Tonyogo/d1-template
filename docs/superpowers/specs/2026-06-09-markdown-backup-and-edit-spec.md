---
name: markdown-backup-and-edit-spec
description: Backup parsed markdown file to R2 markdowns/{date}.md and provide an inline editor on Daily Review tab to fix data errors and re-import directly.
metadata:
  type: project
---

# 🚀 每日复盘数据纠错与 Markdown 物理备份规格书 (Markdown Editor Spec)

本文档规范了项目中 A股涨停复盘长图解析后原始 Markdown 文本的备份保存，以及后期通过前端“每日复盘页面”直接拉取、修改、重新入库 D1 数据库的设计规格。

---

## 🏛️ 1. 系统核心流程设计

整个纠错与数据闭环流程分为两个阶段：

### 阶段 1：解析入库时的自动 Markdown 备份
*   **触发点**：无论用户是执行“一键自动导入”还是其它的流程，当大模型 OCR 完毕结构化写入 D1 的同时，系统必须**将 Gemini OCR 识别得到的原始 `rawMarkdown` 文本备份保存在 R2 存储桶中**，路径为：`markdowns/{date}.md`。
*   **好处**：留存最原始的文本物理凭证，杜绝数据单向流动引起的修改困难。

### 阶段 2：后置随时数据纠错与重新入库
*   **交互**：在前端“每日复盘”页面中，新增“🔧 修正复盘数据”按钮。点击后，调取弹窗 Modal 并获取备份文本。
*   **提交**：用户手动修改（如改掉股票名中未过滤干净的错别字或调整板块归属）后点击“确认修改”，发送给后端合并处理。
*   **后端处理**：
    1.  重新调用 `OcrParser.parseOcrMarkdown` 洗数据。
    2.  D1 事务级清空该日期旧数据，直写最新结构化 DDTO 数据行。
    3.  覆盖更新 R2 里的备份 `.md` 文件。
    4.  前端重载，瞬时刷新复盘结果！

---

## 📂 2. 后端新增方法定义

### 2.1 `src/services/upload.service.ts`
*   升级原有的 R2 归档保存流程，增加：
    ```typescript
    const mdKey = `markdowns/${date}.md`;
    await this.r2Bucket.put(mdKey, rawMarkdown, ...);
    ```
*   新增 `getMarkdownByDate(date: string): Promise<string>`
*   新增 `commitMarkdownUpdate(date: string, rawMarkdown: string): Promise<any>`

### 2.2 `src/controllers/upload.ts`
新增并挂载两个 Hono API：
*   `GET /api/markdown?date=YYYY-MM-DD` ── 调用服务获取 R2 里的原始 md 文本。
*   `POST /api/markdown/commit` ── 控制器接收 `{ date, rawMarkdown }`，触发重构清洗、D1 覆盖写入与 R2 备份文件更新。
