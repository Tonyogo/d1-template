# 批量暂存并行解析队列优雅取消功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发批量一键并行处理时的“优雅取消/停止”功能。1. 前台一键并行处理按钮在处理期间自动切换为“🛑 停止处理”；2. 增加 `isCancelRequested` 信号锁，点击停止时温和切断网络排队链（不再开启新图片解析），允许当前已经开始解析的 2~3 个活动线程完整跑完并出结果，确保数据事务一致性与 Tokens 利用率，完毕后优雅收尾。

**Architecture:**
- **自切换按钮模型**：通过复用同一个 `pending-process-all-btn` 按钮元素实现视觉切换，不占用额外宽度。
- **并发分发前置拦截**：在并发池 `limitConcurrency` 内核中对 `runNext()` 挂载前置 `isCancelRequested` 拦截器。

**Tech Stack:** Vanilla JS (ES Modules), Tailwind CSS, HTML5.

---

### Task 1: 升级前端控制层 `public/js/tabs/upload.js` 异步取消控制内核

**Files:**
- Modify: `public/js/tabs/upload.js`

- [ ] **Step 1: 新增 `isCancelRequested` 信号属性并在 `constructor` 声明**

在 `public/js/tabs/upload.js` 的 `constructor` 中声明取消状态变量（约第 5 行之后）：
```javascript
        this.isCancelRequested = false;
```

- [ ] **Step 2: 升级并发池 `limitConcurrency` 驱动方法支持前置取消截断**

修改 `limitConcurrency`（约第 734-747 行左右），增加对 `this.isCancelRequested` 的前置判断：
```javascript
    async limitConcurrency(tasks, limit, fn) {
        let index = 0;
        const runNext = async () => {
            // 前置截断：如果用户请求了停止，立刻停止启动下一个待处理的任务
            if (this.isCancelRequested) return;
            if (index >= tasks.length) return;
            const currentIdx = index++;
            const task = tasks[currentIdx];
            await fn(task);
            await runNext();
        };

        const workers = [];
        for (let i = 0; i < Math.min(limit, tasks.length); i++) {
            workers.push(runNext());
        }
        await Promise.all(workers);
    }
```

- [ ] **Step 3: 优化 `togglePendingControls(enabled)` 允许保留一键处理按钮可触性**

在 `togglePendingControls(enabled)`（约第 691-705 行左右）中，**当批量处理开始、控制台禁用时，不要禁用 `pendingProcessAllBtn` 按钮**。因为我们需要用户能够点它来触发取消。
将原：
```javascript
            this.pendingProcessAllBtn.removeAttribute('disabled');
            this.pendingProcessAllBtn.classList.remove('opacity-50', 'cursor-not-allowed');
```
修改为：
在禁用时（`enabled === false`）只置灰“刷新按钮”和“并发选择器”，让“一键处理”按钮保持可点击：
```javascript
    togglePendingControls(enabled) {
        this.dropZone.style.pointerEvents = enabled ? 'auto' : 'none';
        if (enabled) {
            this.dropZone.classList.remove('opacity-50');
            this.pendingRefreshBtn.removeAttribute('disabled');
            this.pendingRefreshBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            this.pendingProcessAllBtn.removeAttribute('disabled');
            this.pendingProcessAllBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            if (this.concurrencySelect) {
                this.concurrencySelect.removeAttribute('disabled');
                this.concurrencySelect.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } else {
            this.dropZone.classList.add('opacity-50');
            this.pendingRefreshBtn.setAttribute('disabled', 'true');
            this.pendingRefreshBtn.classList.add('opacity-50', 'cursor-not-allowed');
            // 注意：正在执行时不禁用本按钮，允许点击以触发优雅取消
            if (this.concurrencySelect) {
                this.concurrencySelect.setAttribute('disabled', 'true');
                this.concurrencySelect.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }
```

- [ ] **Step 4: 重构 `processAllPending()` 控制按钮自切换与温和落锁逻辑**

将 `processAllPending()` 重构为以下融合一键并行与在线优雅取消的双向驱动形态：
```javascript
    async processAllPending() {
        // 如果当前已经在处理中，点击该按钮意味着触发“优雅停止”
        if (this.isProcessing) {
            if (this.isCancelRequested) return; // 避免重复点击
            this.isCancelRequested = true;
            this.pendingProcessAllBtn.disabled = true;
            this.pendingProcessAllBtn.className = "px-4 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-bold shadow-sm cursor-not-allowed flex items-center space-x-1.5";
            this.pendingProcessAllBtn.innerHTML = `<div class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div> <span>正在优雅停止...</span>`;
            console.log("[BatchProcess] Cancel requested. Stopping worker queue after active tasks finish...");
            return;
        }

        const rows = Array.from(this.pendingTbody.querySelectorAll('tr[id^="pending-row-"]'));
        if (rows.length === 0) {
            alert('当前队列中没有暂存任务！');
            return;
        }

        const concurrencyLimit = this.concurrencySelect ? parseInt(this.concurrencySelect.value, 10) : 3;

        if (!confirm(`确定要开始一键并行处理当前队列中的所有 ${rows.length} 张图片吗？\n将开启 ${concurrencyLimit} 路线程同时并发导入。`)) {
            return;
        }

        this.isProcessing = true;
        this.isCancelRequested = false; // 初始化重置信号
        this.togglePendingControls(false);

        // 按钮自切换为“停止处理”样式
        this.pendingProcessAllBtn.className = "px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 flex items-center space-x-1.5";
        this.pendingProcessAllBtn.innerHTML = `<i data-lucide="square" class="w-3.5 h-3.5 text-red-400 fill-red-400"></i> <span>停止处理</span>`;
        lucide.createIcons();

        let successCount = 0;
        let failCount = 0;

        const tasks = rows.map(row => {
            const picker = row.querySelector('input[type="date"]');
            const processBtn = row.querySelector('button.bg-red-500');
            const deleteBtn = row.querySelector('button.text-slate-500');
            const key = row.getAttribute('data-key');
            return { row, picker, processBtn, deleteBtn, key, processed: false };
        }).filter(t => t.processBtn && t.deleteBtn && t.picker && !t.processBtn.disabled);

        const processWorker = async (t) => {
            const date = t.picker.value;
            if (!this.isValidDate(date)) {
                t.row.className = "bg-red-50/30 transition duration-150";
                failCount++;
                return;
            }

            t.processBtn.disabled = true;
            t.deleteBtn.disabled = true;
            t.picker.disabled = true;

            const originalBtnHTML = t.processBtn.innerHTML;
            t.processBtn.className = "px-3 py-1 bg-red-400 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1 cursor-not-allowed";
            t.processBtn.innerHTML = `<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> <span>解析中...</span>`;
            t.row.className = "bg-blue-50/30 transition duration-150";

            try {
                let data;
                const ext = t.key.split('.').pop().toLowerCase();
                const mimeMap = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'png': 'image/png' };
                const mimeType = mimeMap[ext] || 'image/png';

                const localMarkdown = await this.ocrWithLocalProxy(t.key, mimeType);

                if (localMarkdown) {
                    console.log("Using decentralized local proxy OCR result.");
                    data = await api.commitParsedMarkdown(t.key, date, localMarkdown);
                } else {
                    console.log("Fallback to cloud worker proxy OCR.");
                    data = await api.processPendingImage(t.key, date);
                }

                if (data.error) {
                    throw new Error(data.message || data.error);
                }

                t.row.className = "bg-emerald-50/30 transition duration-150";
                t.processBtn.className = "px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1";
                t.processBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>解析成功</span>`;
                lucide.createIcons();

                successCount++;

                setTimeout(() => {
                    t.row.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                    setTimeout(() => {
                        t.row.remove();
                        this.checkAndRenderEmptyRow();
                    }, 500);
                }, 1200);

            } catch (err) {
                console.error('Failed processing item in loop:', err);
                t.row.className = "bg-red-50/30 transition duration-150";
                t.processBtn.disabled = false;
                t.deleteBtn.disabled = false;
                t.picker.disabled = false;
                t.processBtn.className = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 inline-flex items-center space-x-1";
                t.processBtn.innerHTML = originalBtnHTML;
                lucide.createIcons();
                failCount++;
            }
        };

        try {
            await this.limitConcurrency(tasks, concurrencyLimit, processWorker);

            await this.app.reloadSummaries();
            
            if (this.isCancelRequested) {
                alert(`队列已优雅停止！\n停止前处理成功：${successCount} 个\n失败：${failCount} 个\n未开始排队的文件已安全保留在列表中。`);
            } else {
                alert(`一键并行处理完成！\n成功：${successCount} 个\n失败：${failCount} 个`);
            }
        } catch (err) {
            console.error('Error during parallel processing loop:', err);
            alert(`批量并行处理出现异常: ${err.message || err}`);
        } finally {
            this.isProcessing = false;
            this.isCancelRequested = false;
            this.togglePendingControls(true);

            // 还原按钮初始状态
            this.pendingProcessAllBtn.disabled = false;
            this.pendingProcessAllBtn.className = "px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 flex items-center space-x-1.5";
            this.pendingProcessAllBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> <span>一键并行处理</span>`;
            lucide.createIcons();
        }
    }
```

- [ ] **Step 5: 运行 `npm run check` 校验编译**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 6: Commit 提交**

```bash
git add public/js/tabs/upload.js
git commit -m "feat: implement graceful cancellation queue handler for parallel batch processing"
```
