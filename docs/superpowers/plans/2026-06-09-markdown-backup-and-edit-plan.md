# 每日复盘数据纠错与 Markdown 物理备份 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现已入库数据的后置随时纠错功能。1. 在后端自动把 OCR 完毕的原始 Markdown 备份在 R2 `markdowns/` 目录；2. 在前端每日复盘页增加“修正数据”按钮，支持一键拉取备份 md 并在浏览器中进行手动编辑修改、重新自动解析入库并实时刷新，形成完美闭环。

**Architecture:**
- **R2 物理 Markdown 备份**：通过 `markdowns/{date}.md` 进行云端资产备份。
- **重新清洗入库逻辑**：用户纠错提交的文本直接交由 `OcrParser` 再次执行结构化，通过 D1 Batch 级联覆盖，数据完全一致。

**Tech Stack:** Cloudflare Workers, Hono Web Framework, D1 Database, R2 Bucket, Vanilla JS (ES Modules).

---

### Task 1: 升级后端 `UploadService` 与 `processStashedImage` 备份机制

**Files:**
- Modify: `src/services/upload.service.ts`

- [ ] **Step 1: 升级 `processStashedImage` 方法自动在 R2 备份原始 Markdown**

在 `processStashedImage` 成功入库并归档原始长图后（约第 170 行左右），追加对原始大模型 Markdown 识别内容的永久物理备份：
```typescript
		// 5. 永久物理备份 Markdown 原始文本，方便日后随时纠错与重新 D1 入库
		const mdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(mdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});
```

- [ ] **Step 2: 升级 `commitParsedMarkdown` 方法也自动在 R2 备份原始 Markdown**

在 `commitParsedMarkdown` 成功入库并归档原始长图后（约第 274 行左右），追加相同的 R2 备份备份：
```typescript
		// 4. 永久物理备份 Markdown 原始文本，方便日后随时纠错与重新 D1 入库
		const mdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(mdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});
```

- [ ] **Step 3: 新增 `getMarkdownByDate` 与 `commitMarkdownUpdate` 服务层接口**

在 `UploadService` 类尾部，追加实现用于拉取备份和处理手动纠错后再次结构化写 D1 与覆盖 R2 备份的完整流程：
```typescript
	async getMarkdownByDate(date: string): Promise<string> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}
		const mdKey = `markdowns/${date}.md`;
		const mdObject = await this.r2Bucket.get(mdKey);
		if (!mdObject) {
			throw new Error(`未找到该日期对应的 Markdown 备份文件，无法执行纠错修改。`);
		}
		return await mdObject.text();
	}

	async commitMarkdownUpdate(date: string, rawMarkdown: string) {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}

		// 1. 调用 OcrParser 再次对最新手动修改的文本进行解析与清洗
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// 2. 多表级联 D1 批量事务写入
		const db = this.summaryRepo.db;
		const del1 = db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
		const del2 = db.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
		const del3 = db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

		const insSummary = db.prepare(`
			INSERT INTO daily_summary (date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate)
			VALUES (?, ?, ?, ?, ?)
		`).bind(
			date,
			summary.stock_count,
			summary.upgrade_rate,
			summary.limit_broken_rate,
			summary.bidding_increase_rate
		);

		const insSectors = sectorsAndStocks.map(sec =>
			db.prepare(`
				INSERT INTO sectors (date, name, description)
				VALUES (?, ?, ?)
			`).bind(date, sec.name, sec.description || null)
		);

		await db.batch([del1, del2, del3, insSummary, ...insSectors]);

		const sectorIdMap = await this.sectorRepo.getSectorIdMap(date);
		const stockStatements: any[] = [];
		let stocksCount = 0;

		for (const sec of sectorsAndStocks) {
			const sectorId = sectorIdMap[sec.name] || null;
			for (const stock of sec.stocks) {
				stockStatements.push(
					db.prepare(`
						INSERT INTO limit_up_stocks (date, status, code, name, time, concept_reason, sector_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`).bind(
						date,
						stock.status,
						stock.code,
						stock.name,
						stock.time,
						stock.concept_reason,
						sectorId
					)
				);
				stocksCount++;
			}
		}

		if (stockStatements.length > 0) {
			await db.batch(stockStatements);
		}

		// 3. 覆盖 R2 中的 Markdown 备份
		const mdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(mdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount: sectorsAndStocks.length,
			stocksCount
		};
	}
```

- [ ] **Step 4: 运行 `npm run check` 检查语法，确保无 TS 类型安全错误**

Run: `npm run check`
Expected: 编译通过。

---

### Task 2: 升级控制层 `src/controllers/upload.ts` 并挂载接口

**Files:**
- Modify: `src/controllers/upload.ts`
- Modify: `src/controllers/index.ts`

- [ ] **Step 1: 在 `src/controllers/upload.ts` 中新增 `getMarkdown` 与 `commitMarkdownUpdate` 方法**

追加并在最后导出两个控制器方法：
```typescript
export async function getMarkdown(c: Context) {
	const date = c.req.query('date');
	if (!date) {
		return c.json({ error: "Missing date parameter" }, 400);
	}

	try {
		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const markdown = await uploadService.getMarkdownByDate(date);
		return c.json({ success: true, markdown });
	} catch (error: any) {
		console.error("Error inside getMarkdown controller:", error);
		return c.json({ error: "Internal Server Error during markdown retrieval", message: error.message }, 500);
	}
}

export async function commitMarkdownUpdate(c: Context) {
	try {
		const body = await c.req.json();
		const date = body?.date as string;
		const rawMarkdown = body?.rawMarkdown as string;

		if (!date) {
			return c.json({ error: "Missing date parameter" }, 400);
		}
		if (!rawMarkdown) {
			return c.json({ error: "Missing rawMarkdown parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.commitMarkdownUpdate(date, rawMarkdown);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside commitMarkdownUpdate controller:", error);
		return c.json({ error: "Internal Server Error during markdown commit", message: error.message }, 500);
	}
}
```

- [ ] **Step 2: 在 `src/controllers/index.ts` 中完成路由绑定**

在 `registerRoutes` 中追加以下两个接口定义：
```typescript
	app.get('/api/markdown', uploadController.getMarkdown);
	app.post('/api/markdown/commit', uploadController.commitMarkdownUpdate);
```

- [ ] **Step 3: 运行 `npm run check` 检查语法无误**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: implement markdown backup retrieval and recommit API endpoints and services"
```

---

### Task 3: 升级前端 UI 面板与数据绑定支持

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: 增加复盘页纠错按钮 DOM 并新增纠错编辑 Modal**

1. 在“选择复盘日期”选择器外面（约第 136 行之后）增加“修正数据”按钮 DOM：
```html
                <div class="flex items-center space-x-3">
                    <div class="p-2.5 bg-slate-100 rounded-xl text-slate-600">
                        <i data-lucide="filter" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <label for="date-select" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">选择复盘日期</label>
                        <select id="date-select" class="mt-1 block w-48 pl-3 pr-10 py-1.5 text-base border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg bg-slate-50 font-medium text-slate-900">
                            <option value="">加载中...</option>
                        </select>
                    </div>
                    <!-- 新增：修正复盘数据按钮 -->
                    <button id="review-edit-btn" class="hidden mt-5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 flex items-center space-x-1.5 h-9">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                        <span>修正数据</span>
                    </button>
                </div>
```
2. 在 `index.html` 闭合标签 `</body>` 之前，追加一个全新纠错弹窗 DOM 结构：
```html
    <!-- ==================== MARKDOWN EDIT MODAL (NEW) ==================== -->
    <div id="edit-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                    <h3 class="text-base font-extrabold text-slate-900">修正复盘数据</h3>
                    <p id="edit-modal-date" class="text-xs text-slate-400 mt-0.5">正在修改 -- 的复盘 Markdown</p>
                </div>
                <button id="edit-modal-close" class="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <!-- Textarea Editor -->
            <div class="p-6 flex-grow overflow-y-auto">
                <label for="edit-markdown-textarea" class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">原始 Markdown 文本</label>
                <textarea id="edit-markdown-textarea" class="w-full h-80 p-4 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500" placeholder="正在加载原始 Markdown..."></textarea>
                <p class="text-[10px] text-slate-400 mt-2 leading-relaxed">提示：您可以手动添加板块（格式如 `### 板块名称`）、修改个股数据行（格式如 `|首板|600123|股票名称|时间|概念原因|`）。点击下方保存后，系统将自动重新校验入库并同步刷新复盘页面。</p>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end space-x-3">
                <button id="edit-modal-cancel-btn" class="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition">取消</button>
                <button id="edit-modal-save-btn" class="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center space-x-1.5">
                    <i data-lucide="check" class="w-4 h-4"></i>
                    <span>确认修改并入库</span>
                </button>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: add revision button and modal elements for historical markdown editing"
```

---

### Task 4: 编写前端纠错控制逻辑并闭环刷新机制

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/tabs/review.js`

**Interfaces:**
- Consumes: `/api/markdown`, `/api/markdown/commit`
- Produces: 每日复盘页面的点击获取、弹出、编辑、提交、重载刷新全链路。

- [ ] **Step 1: 在 `public/js/api.js` 中新增飞书安全校验环境变量声明**

在 `api` 字典中，增加两个用于获取 Markdown 和提交纠错的方法：
```javascript
    getMarkdown: (date) => fetch(`/api/markdown?date=${encodeURIComponent(date)}`).then(r => r.json()),
    commitMarkdownUpdate: (payload) => fetch('/api/markdown/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()),
```

- [ ] **Step 2: 升级 `public/js/tabs/review.js` 全套控制器逻辑**

重写 `review.js` 全文件，挂载纠错按钮、加载原始 Markdown 文本、控制 Modal 展示以及处理确认纠错提交：
```javascript
import { api } from '../api.js';

export class ReviewTab {
    constructor(app) {
        this.app = app;
        this.currentLoadedDate = null;
        this.initDOM();
        this.initEditModalDOM();
    }

    initDOM() {
        this.select = document.getElementById('date-select');
        this.statCount = document.getElementById('stat-count');
        this.statUpgrade = document.getElementById('stat-upgrade');
        this.statBroken = document.getElementById('stat-broken');
        this.statBidding = document.getElementById('stat-bidding');
        this.imageCard = document.getElementById('review-image-card');
        this.imageToggleBtn = document.getElementById('image-toggle-btn');
        this.imageCollapse = document.getElementById('image-collapse');
        this.imageChevron = document.getElementById('image-chevron');
        this.imageToggleStatus = document.getElementById('image-toggle-status');
        this.reviewImg = document.getElementById('review-image');
        this.loader = document.getElementById('review-loader');
        this.accordionContainer = document.getElementById('sectors-accordion');

        // 纠错按钮
        this.editBtn = document.getElementById('review-edit-btn');

        this.select.addEventListener('change', (e) => this.loadDailyDetails(e.target.value));
        this.imageToggleBtn.addEventListener('click', () => this.toggleImage());
        this.editBtn.addEventListener('click', () => this.openEditModal());
    }

    initEditModalDOM() {
        this.editModal = document.getElementById('edit-modal');
        this.editModalDate = document.getElementById('edit-modal-date');
        this.editModalClose = document.getElementById('edit-modal-close');
        this.editMarkdownTextarea = document.getElementById('edit-markdown-textarea');
        this.editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
        this.editModalSaveBtn = document.getElementById('edit-modal-save-btn');

        this.editModalClose.addEventListener('click', () => this.closeEditModal());
        this.editModalCancelBtn.addEventListener('click', () => this.closeEditModal());
        this.editModalSaveBtn.addEventListener('click', () => this.saveMarkdownCorrection());

        this.editModal.addEventListener('click', (e) => {
            if (e.target === this.editModal) {
                this.closeEditModal();
            }
        });
    }

    toggleImage() {
        const isHidden = this.imageCollapse.classList.contains('hidden');
        this.imageCollapse.classList.toggle('hidden');
        this.imageToggleStatus.textContent = isHidden ? '收起' : '展开';

        const chevron = document.getElementById('image-chevron');
        if (chevron) {
            chevron.classList.toggle('rotate-180', isHidden);
        }
    }

    async loadDailyDetails(date) {
        if (!date) {
            this.currentLoadedDate = null;
            this.editBtn.classList.add('hidden');
            return;
        }

        this.currentLoadedDate = date;
        this.loader.classList.remove('hidden');
        this.accordionContainer.innerHTML = '';
        this.editBtn.classList.add('hidden'); // 加载中先隐藏按钮

        try {
            this.reviewImg.src = '/api/image?date=' + date;
            this.reviewImg.onload = () => this.imageCard.classList.remove('hidden');
            this.reviewImg.onerror = () => {
                this.imageCard.classList.add('hidden');
                this.imageCollapse.classList.add('hidden');
                const chevron = document.getElementById('image-chevron');
                if (chevron) chevron.classList.remove('rotate-180');
                this.imageToggleStatus.textContent = '展开';
                lucide.createIcons();
            };

            const data = await api.getDailyDetails(date);

            const summary = data.summary;
            this.statCount.innerHTML = `${summary.stock_count || '--'} <span class="text-xs font-medium text-slate-400">只</span>`;
            this.statUpgrade.textContent = summary.upgrade_rate !== null ? `${summary.upgrade_rate}%` : '--%';
            this.statBroken.textContent = summary.limit_broken_rate !== null ? `${summary.limit_broken_rate}%` : '--%';
            this.statBidding.textContent = summary.bidding_increase_rate !== null ? `${summary.bidding_increase_rate}%` : '--%';

            this.renderSectorsAccordion(data.sectors);
            
            // 数据成功加载后，展现“修正数据”按钮
            this.editBtn.classList.remove('hidden');
        } catch (err) {
            console.error(err);
            this.accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-500">无法加载此日期的详细复盘数据</div>';
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    renderSectorsAccordion(sectors) {
        this.accordionContainer.innerHTML = '';
        if (!sectors || sectors.length === 0) {
            this.accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-400">当日暂未捕获板块分类</div>';
            return;
        }

        sectors.forEach(sector => {
            if (sector.stocks.length === 0) return;

            const item = document.createElement('div');
            item.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";

            let stockRows = '';
            sector.stocks.forEach(stock => {
                const statusStyle = this.app.getStatusBadgeStyle(stock.status);
                stockRows += `
                    <tr class="flex flex-col md:table-row hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0 md:border-b-0">
                        <td class="px-4 pt-3 pb-1 md:px-6 md:py-3 text-sm whitespace-nowrap flex justify-between items-center md:table-cell">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                ${stock.status || '涨停'}
                            </span>
                            <span class="text-sm text-slate-500 font-mono md:hidden">${stock.time || '--:--'}</span>
                        </td>
                        <td class="hidden md:table-cell px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.code}</td>
                        <td class="px-4 py-1 md:px-6 md:py-3 text-sm text-slate-900 whitespace-nowrap hover:text-red-500 cursor-pointer flex items-baseline space-x-2 md:table-cell" stock-link="${stock.code}" stock-name="${stock.name}">
                            <span class="text-base font-bold md:text-sm md:font-bold">${stock.name}</span>
                            <span class="text-xs text-slate-400 font-mono font-medium md:hidden">${stock.code}</span>
                        </td>
                        <td class="hidden md:table-cell px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.time || '--:--'}</td>
                        <td class="px-4 py-2.5 text-sm text-slate-600 bg-slate-50 rounded-lg mx-4 mb-3 md:mx-0 md:mb-0 md:bg-transparent md:px-6 md:py-3 md:table-cell">${stock.concept_reason || '--'}</td>
                    </tr>
                `;
            });

            item.innerHTML = `
                <button class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 font-bold">
                    <div class="flex items-center space-x-3 truncate">
                        <div class="p-1.5 bg-red-50 text-red-500 rounded-lg"><i data-lucide="hash" class="w-4 h-4"></i></div>
                        <div class="truncate">
                            <span class="text-base font-extrabold text-slate-900">${sector.name}</span>
                            ${sector.description ? `<span class="text-xs text-slate-400 ml-3 font-medium truncate hidden sm:inline-block">${sector.description}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-4 shrink-0">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">${sector.stocks.length} 只个股</span>
                        <div class="p-1 text-slate-400"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i></div>
                    </div>
                </button>
                <div class="sector-collapse hidden border-t border-slate-100 overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-100">
                        <thead class="bg-slate-50/50 hidden md:table-header-group">
                            <tr>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">板式</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">代码</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">名称</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">时间</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">${stockRows}</tbody>
                    </table>
                </div>
            `;

            const btnToggle = item.querySelector('button');
            const collapse = item.querySelector('.sector-collapse');
            const icon = btnToggle.querySelector('.transition-transform');

            btnToggle.addEventListener('click', () => {
                collapse.classList.toggle('hidden');
                if (icon) {
                    icon.classList.toggle('rotate-180');
                }
            });

            item.querySelectorAll('[stock-link]').forEach(el => {
                el.addEventListener('click', () => {
                    const code = el.getAttribute('stock-link');
                    const name = el.getAttribute('stock-name');
                    this.app.deepLinkStock(code, name);
                });
            });

            this.accordionContainer.appendChild(item);
        });
        lucide.createIcons();
    }

    async openEditModal() {
        if (!this.currentLoadedDate) return;

        this.editModalDate.textContent = `正在读取 ${this.currentLoadedDate} 的 R2 原始 Markdown 备份...`;
        this.editMarkdownTextarea.value = '';
        this.editMarkdownTextarea.disabled = true;
        this.editModalSaveBtn.disabled = true;
        this.editModalSaveBtn.classList.add('opacity-50');

        this.editModal.classList.remove('hidden');
        lucide.createIcons();

        try {
            const data = await api.getMarkdown(this.currentLoadedDate);
            if (data.error || !data.markdown) {
                throw new Error(data.message || data.error || '获取 Markdown 文件失败');
            }
            this.editMarkdownTextarea.value = data.markdown;
            this.editModalDate.textContent = `正在修改 ${this.currentLoadedDate} 的复盘 Markdown 备份`;
            this.editMarkdownTextarea.disabled = false;
            this.editModalSaveBtn.disabled = false;
            this.editModalSaveBtn.classList.remove('opacity-50');
        } catch (err) {
            console.error(err);
            alert(`获取失败: ${err.message || err}`);
            this.closeEditModal();
        }
    }

    closeEditModal() {
        this.editModal.classList.add('hidden');
    }

    async saveMarkdownCorrection() {
        if (!this.currentLoadedDate || this.editMarkdownTextarea.disabled) return;

        const text = this.editMarkdownTextarea.value.trim();
        if (!text) {
            alert('Markdown 文本不能为空！');
            return;
        }

        const originalBtnHTML = this.editModalSaveBtn.innerHTML;
        this.editModalSaveBtn.disabled = true;
        this.editModalSaveBtn.classList.add('opacity-50');
        this.editMarkdownTextarea.disabled = true;
        this.editModalSaveBtn.innerHTML = `<div class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div> <span>重新解析入库中...</span>`;

        try {
            const payload = {
                date: this.currentLoadedDate,
                rawMarkdown: text
            };

            const data = await api.commitMarkdownUpdate(payload);
            if (data.error) {
                throw new Error(data.message || data.error);
            }

            alert('纠错修改成功！数据已重新级联入库。');
            this.closeEditModal();

            // 联动重载刷新当前每日复盘面板
            await this.loadDailyDetails(this.currentLoadedDate);
        } catch (err) {
            console.error('Failed to save correction:', err);
            alert(`修改入库失败: ${err.message || err}`);
        } finally {
            this.editModalSaveBtn.disabled = false;
            this.editModalSaveBtn.classList.remove('opacity-50');
            this.editMarkdownTextarea.disabled = false;
            this.editModalSaveBtn.innerHTML = originalBtnHTML;
            lucide.createIcons();
        }
    }
}
```

- [ ] **Step 3: 运行 `npm run check` 校验并提交代码**

```bash
git add public/
git commit -m "feat: implement inline Markdown revision panel with real-time reload on Daily Review tab"
```
