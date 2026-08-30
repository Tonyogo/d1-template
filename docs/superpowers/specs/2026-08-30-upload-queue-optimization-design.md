# 上传暂存页面综合优化设计规范 (Upload Pending Queue Optimization Design)

## 1. 概述 (Overview)

本设计旨在全面重构和升级 A股涨停复盘看板 的“上传暂存” (Upload Data & Console) 页面。通过引入 **批量多选与批量删除**、**文件名智能日期自动提取**、**12列栅格桌面端平衡重构**、**独立状态徽章列** 以及 **移动端高密度卡片化设计**，显著提升复盘长图批量处理与 OCR 暂存队列的管理效率。

---

## 2. 功能特性与交互设计 (Features & UI/UX Design)

### 2.1 桌面端表格 12 栅格对齐重构
* **列布局**：
  * **[1列] 多选勾选框 (Checkbox)**：表头放置全选 Checkbox，行内放置单项 Checkbox。
  * **[1列] 缩略图 (Thumbnail)**：支持点击呼出大图预览与缩放 Modal。
  * **[3列] 文件名与上传时间**：文件名超长自动截断，保留 title 提示，等宽小字体展示上传时间。
  * **[3列] 目标复盘日期 (Target Date)**：包含原生 `<input type="date">` 输入框，支持 LocalStorage 持久化记忆。
  * **[1列] 状态 (Status)**：独立展示状态徽章（未解析/解析中/失败/已入库）。
  * **[1列] 文件大小 (Size)**：格式化尺寸（如 `2.4 MB`）。
  * **[2列] 操作 (Actions)**：单项“解析入库”与“删除”图标/文字按钮。

### 2.2 批量管理操作栏 (Batch Management Toolbar)
* **批量操作工具栏**：
  * **全选/反选 Checkbox**：勾选后批量选中所有队列项。
  * **`[🗑️ 批量删除 (N)]` 按钮**：当选中项数量 $N > 0$ 时高亮激活，支持一键清空选中文件。
  * **`[📅 全部设为今日]` 按钮**：一键将所有待处理条目的目标日期批量填充为当前今日日期。
  * **`[⚡ 一键并发处理]` 按钮**：支持按选定的并发数（1/2/3/5/10）自动队列并发调度入库。

### 2.3 文件名智能日期提取算法 (Smart Date Parser)
在用户上传图片或从云端拉取待处理列表时，通过多规则正则引擎智能从原始文件名中推导日期：
1. **标准日期**：`2026-08-19`、`2026_08_19`、`2026.08.19`、`20260819` -> `2026-08-19`
2. **月日格式**：`08-19`、`8.19`、`8月19日` -> 自动补齐当前年份 `2026-08-19`
3. **兜底策略**：若无法从文件名中提取任何有效日期，则以当前今日日期或服务端建议日期兜底。

### 2.4 移动端高密度卡片化 (Mobile Responsive Cards)
* 移动端采用分块卡片结构：
  * 顶部：多选框 + 缩略图 + 文件名 + 独立状态徽章。
  * 中部：文件大小与上传时间。
  * 底部：整宽日期选择器 + “解析入库”与“删除”按钮。

---

## 3. 技术实现与架构 (Technical Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    UploadTab Controller                     │
├──────────────────────────────┬──────────────────────────────┤
│  SelectionManager            │  SmartDateParser             │
│  - selectedKeys: Set<string> │  - extractDateFromFilename() │
│  - toggleSelect(key)         │                              │
│  - selectAll() / clear()     │                              │
├──────────────────────────────┼──────────────────────────────┤
│  QueueRenderer               │  BatchOperationService       │
│  - renderDesktopGridRow()    │  - batchDelete(keys)         │
│  - renderMobileCardRow()     │  - batchApplyDate(date)      │
│  - updateStatusBadges()      │  - processConcurrencyQueue() │
└──────────────────────────────┴──────────────────────────────┘
```

### 3.1 数据流与本地状态同步
* **选中状态管理**：使用 `this.selectedKeys = new Set()` 维护选中项，勾选变动时自动更新“批量删除”按钮文本与禁用状态。
* **日期缓存**：继续利用 `localStorage.setItem('pending_date_cache_' + key, date)` 实现用户对特定文件的日期修正记忆。

---

## 4. 文件修改清单 (Files to Modify)

1. **`docs/superpowers/specs/2026-08-30-upload-queue-optimization-design.md`**：本设计规范文档。
2. **`public/index.html`**：重构 `#pending-console-container` 的表头、批量操作栏工具按钮及桌面端栅格定义。
3. **`public/js/tabs/upload.js`**：实现多选逻辑、智能日期析出算法、批量删除、批量设置日期以及全新的行列渲染逻辑。
