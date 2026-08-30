# Upload Queue Page Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Upload & Pending Queue tab (`public/js/tabs/upload.js` and `public/index.html`) with batch selection & multi-delete, smart filename date extraction, balanced 12-column desktop table grid with dedicated status badge column, and modern high-density mobile card layouts.

**Architecture:** Pure frontend improvements within decoupled assets (`public/`). `UploadTab` manages selection states via `Set`, smart date parsing through regex rules, batch operations (batch delete and batch apply date), and renders updated desktop/mobile queues.

**Tech Stack:** Vanilla JavaScript (ES Modules), Tailwind CSS, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-08-30-upload-queue-optimization-design.md`

## Global Constraints

- Preserve 3-Tier backend decoupling: frontend changes in `public/` only.
- Strict backward compatibility with existing backend endpoints (`/api/pending-images`, `/api/delete-pending-image`, etc.).
- Responsive design: clean 12-col desktop layout and touch-friendly mobile cards.

---

### Task 1: Update HTML Markup for Batch Controls & Table Grid (`public/index.html`)

**Files:**
- Modify: `public/index.html:425-490`

**Interfaces:**
- Produces: Updated `#pending-console-container` markup containing:
  - Select-all checkbox (`#pending-select-all-header`)
  - Batch delete button (`#pending-batch-delete-btn`)
  - Batch "Set all to today" button (`#pending-batch-today-btn`)
  - Redesigned 12-column desktop header:
    - Col 1: Select All Checkbox
    - Col 1: Thumbnail
    - Col 3: Filename & Upload Time
    - Col 3: Target Review Date
    - Col 1: Status Badge
    - Col 1: File Size
    - Col 2: Actions (Process / Delete)

- [ ] **Step 1: Update `public/index.html`**

In `public/index.html`, replace the `#pending-console-container` header and toolbar section with:

```html
            <!-- Stashed Pending Queue Panel -->
            <div id="pending-console-container" class="financial-card p-6 rounded-2xl space-y-4">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-900 flex items-center space-x-2">
                            <i data-lucide="layers" class="w-4 h-4 text-rose-600"></i>
                            <span>待处理暂存队列 (云端 R2)</span>
                            <span id="pending-queue-badge" class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">0 项</span>
                        </h3>
                        <p class="text-xs text-slate-500 mt-0.5">批量图片在此安全暂存，支持多选批量管理、单项解析或一键多线程并发入库</p>
                    </div>
                    <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 w-full lg:w-auto lg:shrink-0">
                        <!-- Batch Tools -->
                        <div class="flex items-center space-x-2">
                            <button id="pending-batch-today-btn" class="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs" title="将所有待处理项日期设为今日">
                                <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                                <span>设为今日</span>
                            </button>
                            <button id="pending-batch-delete-btn" disabled class="px-3 py-1.5 border border-rose-200/80 bg-rose-50/50 text-rose-600 opacity-50 cursor-not-allowed rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                <span id="pending-batch-delete-text">批量删除</span>
                            </button>
                        </div>

                        <!-- Concurrency selector -->
                        <div class="flex items-center justify-between lg:justify-start space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-500 font-semibold shadow-xs">
                            <div class="flex items-center space-x-1.5">
                                <i data-lucide="zap" class="w-3.5 h-3.5 text-rose-600"></i>
                                <span>并发:</span>
                            </div>
                            <select id="pending-concurrency-select" class="bg-transparent focus:outline-none text-slate-800 font-bold select-none cursor-pointer py-0 my-0 border-none font-mono">
                                <option value="1">1 (稳健)</option>
                                <option value="2">2 (双倍)</option>
                                <option value="3" selected>3 (推荐)</option>
                                <option value="5">5 (极速)</option>
                                <option value="10">10 (全开)</option>
                            </select>
                        </div>

                        <!-- Controls -->
                        <div class="grid grid-cols-2 gap-2 w-full lg:flex lg:items-center lg:space-x-2 lg:w-auto">
                            <button id="pending-refresh-btn" class="justify-center px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5">
                                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                                <span>刷新列表</span>
                            </button>
                            <button id="pending-process-all-btn" class="justify-center px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5">
                                <i data-lucide="play" class="w-3.5 h-3.5"></i>
                                <span>一键并发处理</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Table Container -->
                <div class="overflow-hidden border border-slate-200/80 rounded-xl">
                    <!-- Desktop Table Header -->
                    <div class="hidden md:grid grid-cols-12 gap-3 bg-slate-50/80 px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/60 items-center">
                        <div class="col-span-1 flex items-center space-x-2">
                            <input type="checkbox" id="pending-select-all-header" class="w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer">
                        </div>
                        <div class="col-span-1">缩略图</div>
                        <div class="col-span-3">文件名 / 上传时间</div>
                        <div class="col-span-3">目标复盘日期</div>
                        <div class="col-span-1 text-center">状态</div>
                        <div class="col-span-1">大小</div>
                        <div class="col-span-2 text-right">操作</div>
                    </div>
                    <!-- Queue List Body -->
                    <div id="pending-tbody" class="divide-y divide-slate-100 bg-white">
                        <div id="pending-empty-row" class="text-center py-12 text-slate-400">
                            <div class="flex flex-col items-center justify-center space-y-2.5">
                                <div class="p-3 bg-slate-50 rounded-full text-slate-300 border border-slate-200/50">
                                    <i data-lucide="inbox" class="w-8 h-8"></i>
                                </div>
                                <div class="text-xs font-semibold text-slate-600">云端暂存队列为空</div>
                                <p class="text-[11px] text-slate-400 max-w-xs mx-auto">
                                    拖拽或选择复盘长图至上方区域即可进入云端暂存池。
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
```

- [ ] **Step 2: Commit Task 1**

```bash
git add public/index.html
git commit -m "feat(ui): add batch tools and 12-col grid header for upload queue"
```

---

### Task 2: Implement Smart Date Parser & Selection Logic in `public/js/tabs/upload.js`

**Files:**
- Modify: `public/js/tabs/upload.js`

**Interfaces:**
- Consumes: DOM elements from Task 1 (`#pending-select-all-header`, `#pending-batch-delete-btn`, `#pending-batch-today-btn`, etc.).
- Produces:
  - `extractDateFromFilename(filename: string): string | null`
  - `selectedKeys: Set<string>`
  - `updateBatchControlsUI(): void`
  - `batchDeleteSelected(): Promise<void>`
  - `batchSetTodayDate(): void`
  - Upgraded `renderPendingRow(img)` with checkbox selection, dedicated status column, and responsive card styling.

- [ ] **Step 1: Implement smart date parser and selection helpers in `public/js/tabs/upload.js`**

Add `extractDateFromFilename(filename)` method to `UploadTab`:
```javascript
    extractDateFromFilename(filename) {
        if (!filename) return null;
        const name = String(filename).trim();

        // 1. Match YYYY-MM-DD, YYYY_MM_DD, YYYY.MM.DD, or YYYYMMDD
        const fullDateMatch = name.match(/(20\d{2})[-_.年](\d{1,2})[-_.月](\d{1,2})日?/);
        if (fullDateMatch) {
            const year = fullDateMatch[1];
            const month = fullDateMatch[2].padStart(2, '0');
            const day = fullDateMatch[3].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const compactMatch = name.match(/(20\d{2})(\d{2})(\d{2})/);
        if (compactMatch) {
            return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
        }

        // 2. Match MM-DD, M.D (e.g. 08-19, 8.19, 8月19日) -> prepends current year
        const monthDayMatch = name.match(/(\d{1,2})[-_.月](\d{1,2})日?/);
        if (monthDayMatch) {
            const year = new Date().getFullYear();
            const month = monthDayMatch[1].padStart(2, '0');
            const day = monthDayMatch[2].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        return null;
    }
```

- [ ] **Step 2: Implement selection state management and batch action handlers in `public/js/tabs/upload.js`**

In `UploadTab.prototype.initDOM`:
- Initialize `this.selectedKeys = new Set()`.
- Bind `#pending-select-all-header` change listener.
- Bind `#pending-batch-delete-btn` click listener.
- Bind `#pending-batch-today-btn` click listener.

Implement `updateBatchControlsUI()`:
```javascript
    updateBatchControlsUI() {
        const count = this.selectedKeys.size;
        if (this.batchDeleteBtn) {
            this.batchDeleteBtn.disabled = count === 0;
            if (count > 0) {
                this.batchDeleteBtn.className = "px-3 py-1.5 border border-rose-300 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs cursor-pointer hover:bg-rose-100";
                if (this.batchDeleteText) this.batchDeleteText.textContent = `批量删除 (${count})`;
            } else {
                this.batchDeleteBtn.className = "px-3 py-1.5 border border-rose-200/80 bg-rose-50/50 text-rose-600 opacity-50 cursor-not-allowed rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs";
                if (this.batchDeleteText) this.batchDeleteText.textContent = '批量删除';
            }
        }
        if (this.selectAllHeader) {
            const totalRows = this.pendingImagesCache ? this.pendingImagesCache.length : 0;
            this.selectAllHeader.checked = totalRows > 0 && this.selectedKeys.size === totalRows;
            this.selectAllHeader.indeterminate = this.selectedKeys.size > 0 && this.selectedKeys.size < totalRows;
        }
    }
```

- [ ] **Step 3: Implement `renderPendingRow(img)` with new grid layout**

Update `renderPendingRow(img)`:
- Add checkbox column (`col-span-1`).
- Display dedicated status badge (`col-span-1`).
- Connect date suggested value using `cachedDate || this.extractDateFromFilename(img.originalName) || img.suggestedDate || this.getTodayDateString()`.
- Bind checkbox click to update `this.selectedKeys` and trigger `updateBatchControlsUI()`.

- [ ] **Step 4: Implement batch delete and batch set today methods**

```javascript
    async batchDeleteSelected() {
        const count = this.selectedKeys.size;
        if (count === 0) return;

        if (!confirm(`确定要批量删除选中的 ${count} 个暂存文件吗？`)) return;

        this.togglePendingControls(false);
        try {
            for (const key of Array.from(this.selectedKeys)) {
                await api.deletePendingImage(key);
                localStorage.removeItem(`pending_date_cache_${key}`);
            }
            this.selectedKeys.clear();
            await this.loadPendingQueue();
        } catch (err) {
            console.error('Batch delete failed:', err);
            alert('批量删除失败: ' + (err.message || err));
        } finally {
            this.togglePendingControls(true);
        }
    }

    batchSetTodayDate() {
        const today = this.getTodayDateString();
        const inputs = this.pendingTbody.querySelectorAll('.pending-date-input');
        inputs.forEach(input => {
            input.value = today;
            const row = input.closest('[data-key]');
            if (row) {
                const key = row.getAttribute('data-key');
                localStorage.setItem(`pending_date_cache_${key}`, today);
            }
        });
    }
```

- [ ] **Step 5: Commit Task 2**

```bash
git add public/js/tabs/upload.js
git commit -m "feat(upload): implement smart date parsing, selection state, and batch operations"
```

---

## Plan Self-Review

1. **Spec coverage:** All requirements from `docs/superpowers/specs/2026-08-30-upload-queue-optimization-design.md` (12-col desktop layout, batch delete, smart date parsing, set to today, mobile responsive card) are covered in Tasks 1 & 2.
2. **Placeholder scan:** No TBDs or vague references.
3. **Type/Signature consistency:** Method names (`extractDateFromFilename`, `batchDeleteSelected`, `batchSetTodayDate`, `updateBatchControlsUI`) match across all files.

---
