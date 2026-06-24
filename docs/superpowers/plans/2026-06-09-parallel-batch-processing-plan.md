# 暂存列表并发处理升级与用户限额配置 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构前端一键处理暂存队列的逻辑，将单线程串行等待处理升级为“可调节的多线程并发控制池”驱动。增加并发选择下拉框（默认3并发，自动持久化记忆），使批量数据处理与 OCR 识别整体运行时间大幅缩短。

**Architecture:** 
- **可调节并发池**：通过前端 HTML 下拉框允许用户调配。调用 `limitConcurrency` 进行控制。
- **零额外时延**：移除任务之间人工写死的 `800ms` 等待卡顿，实现网络 I/O 资源无缝拼装跑满。

**Tech Stack:** Vanilla JS (ES Modules), Tailwind CSS, HTML5.

---

### Task 1: 升级 `public/index.html` 暂存控制面板结构

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: 新增“并发解析线程”选择器 DOM 容器**

在批量暂存管理控制台的“一键顺序处理”按钮左侧，追加一个精致的并发控制下拉菜单。

将原按钮区（约第 268-273 行左右）：
```html
                    <div class="flex items-center space-x-3">
                        <button id="pending-refresh-btn" class="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold shadow-sm transition duration-150 flex items-center space-x-1.5">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>刷新列表</span>
                        </button>
                        <button id="pending-process-all-btn" class="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 flex items-center space-x-1.5">
                            <i data-lucide="play" class="w-3.5 h-3.5"></i>
                            <span>一键顺序处理</span>
                        </button>
                    </div>
```
重构替换为以下并列、带自适应对齐的布局：
```html
                    <div class="flex flex-wrap items-center gap-3">
                        <!-- 并发线程选择框 -->
                        <div class="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 font-semibold shadow-sm">
                            <i data-lucide="zap" class="w-3.5 h-3.5 text-red-500"></i>
                            <span>并行线程:</span>
                            <select id="pending-concurrency-select" class="bg-transparent focus:outline-none text-slate-800 font-bold select-none cursor-pointer">
                                <option value="1">1 (最稳健)</option>
                                <option value="2">2 (双倍速)</option>
                                <option value="3" selected>3 (推荐三倍速)</option>
                                <option value="5">5 (极速)</option>
                                <option value="10">10 (火力全开)</option>
                            </select>
                        </div>

                        <button id="pending-refresh-btn" class="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold shadow-sm transition duration-150 flex items-center space-x-1.5">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>刷新列表</span>
                        </button>
                        <button id="pending-process-all-btn" class="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 flex items-center space-x-1.5">
                            <i data-lucide="play" class="w-3.5 h-3.5"></i>
                            <span>一键并行处理</span>
                        </button>
                    </div>
```

- [ ] **Step 2: 运行编译和格式检查，并 Commit 提交**

```bash
git add public/index.html
git commit -m "feat: add concurrency configuration selector DOM inside stashed pending console on Upload tab"
```

---

### Task 2: 重构前端一键批量并发队列算法 (`public/js/tabs/upload.js`)

**Files:**
- Modify: `public/js/tabs/upload.js`

- [ ] **Step 1: 声明并发度选择器 DOM 引用，并增加本地 LocalStorage 记忆**

1. 在 `initDOM()` 函数中，绑定选择器的 DOM 引用和初始化加载：
```javascript
        this.concurrencySelect = document.getElementById('pending-concurrency-select');
```
并且在 `initDOM()` 的最后（约第 83 行之后），增加对 `localStorage` 的初始化与监听逻辑：
```javascript
        if (this.concurrencySelect) {
            const cachedLimit = localStorage.getItem('pending_concurrency_limit');
            if (cachedLimit !== null) {
                this.concurrencySelect.value = cachedLimit;
            }
            this.concurrencySelect.addEventListener('change', (e) => {
                localStorage.setItem('pending_concurrency_limit', e.target.value);
            });
        }
```

- [ ] **Step 2: 重构 `processAllPending()` 升级为异步并发限制池**

将 `processAllPending()` 方法完整重构，调用并发辅助器，同时在并发时更新特定行、成功/失败计数，完全摒弃原有 `for-of` 串行和人工延迟：
```javascript
    async processAllPending() {
        if (this.isProcessing) return;

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
        this.togglePendingControls(false);

        let successCount = 0;
        let failCount = 0;

        // 提取每一个需要被处理的参数结构体
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
            // 通过 limitConcurrency 并发池一键拉起多 Worker 并行解析
            await this.limitConcurrency(tasks, concurrencyLimit, processWorker);

            await this.app.reloadSummaries();
            alert(`一键并行处理完成！\n成功：${successCount} 个\n失败：${failCount} 个`);
        } catch (err) {
            console.error('Error during parallel processing loop:', err);
            alert(`批量并行处理出现异常: ${err.message || err}`);
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }
```

- [ ] **Step 3: 升级 `togglePendingControls(enabled)` 连带同步锁止并发下拉菜单**

在 `togglePendingControls(enabled)` 中增加对下拉菜单的可用性禁用和样式置灰处理（约第 677 行左右）：
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
            this.pendingProcessAllBtn.setAttribute('disabled', 'true');
            this.pendingProcessAllBtn.classList.add('opacity-50', 'cursor-not-allowed');
            if (this.concurrencySelect) {
                this.concurrencySelect.setAttribute('disabled', 'true');
                this.concurrencySelect.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }
```

- [ ] **Step 4: 运行 `npm run check` 校验并 Commit 提交**

```bash
git add public/js/tabs/upload.js
git commit -m "feat: implement high-throughput client-side parallel concurrency pool for stashed pending OCR queue"
```
