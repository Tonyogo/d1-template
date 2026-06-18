# 上传数据模块极致精简与排版美化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去除冗余的单文件直传功能和批量临时上传控制台，精简和优化后端死代码，重构前端 UI 为“拖拽即暂存 -> 仪表盘按需解析”的极简一屏化高级看板。

**Architecture:** 
- **Backend Clean-up**: 彻底移除旧端点 `POST /api/upload` 路由代理与 `processUploadPipeline` 业务逻辑，杜绝冗余死代码。
- **Frontend Refactoring**: 合并本地与云端控制台，直接在 `drop-zone` 交互时一并转换为并行极速暂存任务，利用云端待处理表格优雅显示，去掉冗余状态卡片、成功卡和日期 input。

**Tech Stack:** Hono, Cloudflare Workers, Tailwind CSS, Vanilla JS SPA.

## Global Constraints
- `./legacy/` 目录为只读，绝对禁止修改。
- 遵循 3-Tier 解耦规范：Controller 不写 SQL、不直连 R2 存储。
- 保证类型推导、全编译零 Warning、零 Error。

---

## Task 1: 清理后端旧直传端点与死代码服务

**Files:**
- Modify: `src/controllers/index.ts`
- Modify: `src/controllers/upload.ts`
- Modify: `src/services/upload.service.ts`

**Interfaces:**
- 彻底注销并抹除：`POST /api/upload`

### 详细步骤:

- [ ] **Step 1.1: 在控制器注册器中注销 `/api/upload` 路由**
  打开 `src/controllers/index.ts`，彻底移除旧的单文件直传路由绑定：
  ```typescript
  // src/controllers/index.ts (移除此行)
  app.post('/api/upload', uploadController.uploadReview);
  ```

- [ ] **Step 1.2: 在控制器层删除 `uploadReview` 逻辑**
  打开 `src/controllers/upload.ts`，将整个 `uploadReview` 函数从文件中删掉（大约位于 1-40 行）。
  同时检查头部，如果 `SummaryRepository` 仅被这个控制器消费而其他 `batchUpload` 和 `batchProcess` 已不再直接使用它（它们都在运行时自行传入），确认是否能彻底清理。

- [ ] **Step 1.3: 在服务层删除 `processUploadPipeline` 长逻辑**
  打开 `src/services/upload.service.ts`，找到 `processUploadPipeline(file: File, date: string)` 函数，连同它的整个函数体一并安全剪除（大约在 17-108 行），因为其职责已彻底、更优地被 `processStashedImage(key, date)` 所覆盖。

- [ ] **Step 1.4: 运行类型干跑校验**
  Run: `npm run check`
  Expected: 检查后端各层，无死代码残留引用的报错，编译完美通过。

- [ ] **Step 1.5: 提交后端死代码清理变更**
  ```bash
  git add src/controllers/index.ts src/controllers/upload.ts src/services/upload.service.ts
  git commit -m "refactor: prune legacy direct upload endpoints and processUploadPipeline dead code"
  ```

---

## Task 2: 极致瘦身与一屏化美化前端 HTML 骨架

**Files:**
- Modify: `public/index.html`

### 详细步骤:

- [ ] **Step 2.1: 精组并精简 `tab-content-upload` HTML 结构**
  修改 `public/index.html`，剔除旧的大批量过渡容器、旧进度卡片、大绿统计卡。

  定位到 `<!-- ==================== TAB 4: UPLOAD DATA ==================== -->`：
  1. 移去右上角全局的日期输入框组件：
     ```html
     <!-- 彻底删除 -->
     <div class="flex items-center space-x-2 shrink-0">
         <label for="upload-date" ...>
         <input type="date" id="upload-date" ...>
     </div>
     ```
  2. 移除投放区 `drop-zone` 内部的单文件提示层：
     ```html
     <!-- 彻底删除 -->
     <div id="selected-file-info" class="hidden mt-4 ...">...</div>
     ```
  3. 彻底删除旧的本地过渡批量容器 `batch-console-container` 全体标签（大约 294-334 行）。
  4. 彻底删除旧四步状态指示卡片 `upload-progress-container` 全体标签（大约 335-361 行）。
  5. 彻底删除旧直传大绿盒与 markdown 隐藏区 `upload-status-box` 全体标签（大约 362-425 行）。

- [ ] **Step 2.2: 重塑“云端暂存队列”控制面板展示美感**
  调整 `pending-console-container` 为始终加载显示：
  - 增加一个状态，即如果没有 pending 任务时，在表格中间优雅地渲染一个“当前云端待处理队列为空，请在上方拖拽上传图片”的 Empty State 占位，避免白屏尴尬。
  - 调整 Tailwind CSS 排版让布局极为紧凑：
    ```html
    <div id="pending-console-container" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <!-- 保持美观的头部、表格明细，若为空动态灌入 empty tbody -->
    </div>
    ```

- [ ] **Step 2.3: 提交前端 HTML 重构变更**
  ```bash
  git add public/index.html
  git commit -m "style: optimize upload page HTML layout by removing redundant containers and unifying controls"
  ```

---

## Task 3: 重构前端 UploadTab 交互器生命周期

**Files:**
- Modify: `public/js/tabs/upload.js`

### 详细步骤:

- [ ] **Step 3.1: 升级拖入/选择交互**
  修改 `public/js/tabs/upload.js`：
  - 彻底注销与已删除 DOM（`upload-date`、`selected-file-info`、`upload-progress-container`、`upload-status-box`、`batch-console-container`）绑定的事件、变量定义。
  - 彻底移除 `uploadFile(file, dateStr)` 整个旧方法。
  - 重写 `handleFiles(files)` 方法。无论拖拽或选择几个文件：
    - 一律将其加入上传队列，并立刻压入当前的待处理列表 R2 表格（`pending-tbody`）中！
    - 为这些新任务赋予临时的 `status: 'uploading'` 并显示加载指示器（进度条/转圈）。
    - 异步并行并发启动网络上传（调用 `api.batchUpload`）。
    - 上传成功后，自动调用接口，将该行更新为“待处理”并装载上 R2 pending key、智能解析的 suggestedDate（同时解锁日期 picker）。
    - 上传失败，则渲染红色“上传失败”警告并附带重试按钮。

- [ ] **Step 3.2: 精简合并冗余状态方法**
  - 删除 `setupBatchQueue`、`renderBatchTable`、`renderTaskRow`、`updateTaskUI`、`toggleBatchControls`、`startBatchPipeline` 等本地批量控制方法。
  - 将整个上传卡、仪表盘统一托管到更干净、反应更敏捷的 `loadPendingQueue()` 生命周期中。
  - 强化 `loadPendingQueue()`：从后端获取全部 `images/pending/` 数据。如果列表数组为空，则在 `pending-tbody` 中动态填入精致的“无暂存数据”行占位符。

- [ ] **Step 3.3: 运行本地打包和干跑测试**
  Run: `npm run check`
  Expected: 全端类型检查 100% 通配无故障。

- [ ] **Step 3.4: 提交前端 JS 精简合并重构**
  ```bash
  git add public/js/tabs/upload.js
  git commit -m "refactor: simplify UploadTab lifecycle, implementing direct cloud stashing with integrated progress state"
  ```
