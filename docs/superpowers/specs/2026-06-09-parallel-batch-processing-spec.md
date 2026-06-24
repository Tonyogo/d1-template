---
name: parallel-batch-processing-spec
description: Spec for accelerating batch OCR processing via client-side concurrency control, featuring an interactive slider/select in the upload tab.
metadata:
  type: project
---

# 🚀 暂存列表并发处理升级与用户限额配置规格书 (Parallel Batch Spec)

本文档规范了 A股涨停复盘批量长图暂存列表中一键入库流程的速度加速重构。通过前端异步并发池控制，大幅降低 I/O 闲置时间，且支持用户根据其 API Key 级别进行弹性并发配置。

---

## 🏛️ 1. 并发与降噪设计

我们将原先落后的、单线程完全串行的 `processAllPending` 升级为**多线程异步并发池（Client-Side Concurrency Control Pool）**：

### 1.1 前台界面增加“并发度”调节
*   **设计**：在批量暂存控制台的“一键处理”按钮左侧，新增一个极度精致、低噪的**并发数选择下拉菜单**（`id="pending-concurrency-select"`）。
*   **选项范围**：
    *   `1` (极稳健：适合免费版官方 Key 慢速排队，完全零超额熔断风险)
    *   `2` (双倍速)
    *   `3` (三倍速：默认，最契合上行与 D1 数据库级联写入效率)
    *   `5` (五倍速：适合本地高速中转 Proxy 或付费官方 Key 玩家)
*   **本地持久化**：用户选择的并发数值，利用 `localStorage` 自动跨页面刷新记忆保存。

### 1.2 异步并发机制优化
*   利用已有的 `limitConcurrency(tasks, limit, fn)` 调度核心。
*   一键处理时，将所有任务（行 DOM 对象）并行送入执行器中，多路 I/O 同时请求，进度条和卡片状态同时滚动，处理时间呈**线性倍数级别缩短**。

---

## 📂 2. 后端新增与优化方法

### 2.1 后端 API 无需任何修改
由于后端 Workers API（`/api/batch/process`）本身天然具备弹性高并发执行特征，完美支持多图同时发起解析。

### 2.2 前端控制层 `public/js/tabs/upload.js`
*   重构 `processAllPending`，由 `for-of` 串行等待升级为 `await this.limitConcurrency(rows, concurrency, workerFn)` 并行化调度。
*   移除原先人工写死的 `800ms` 阻断线程延迟，实现 100% 极限带宽跑满。
