# A股涨停复盘看板重构实施计划 (A-Share Limit-up Dashboard Refactoring Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将原本单文件的 A股涨停复盘看板项目重构为前后端彻底分离的架构（使用 Hono 框架构建后端三层架构，并将前端 SPA 网页移交 Cloudflare Wrangler Assets 静态 CDN 托管）。

**Architecture:** 
1. **前端 (Wrangler Assets)**：完全移出 Worker 代码，剥离至 `./public`，按功能模块模块化 JS 文件，极低冷启动，极致边缘分发。
2. **后端 (Hono Router + 3-Tier Backend)**：通过 Hono 托管 API 路由，以控制器、服务、数据访问层三层模型处理请求与 D1、R2 交互，具有高内聚、易测试的特点。

**Tech Stack:** Cloudflare Workers, Hono Web Framework, D1 Database, R2 Object Storage, Tailwind CSS, Vanilla JS, TypeScript 5.9.3.

---

### Task 1: 初始化依赖与路由框架 Hono

**Files:**
- Modify: `package.json`
- Modify: `wrangler.json`
- Create: `src/index.ts`
- Create: `src/types.ts`

- [ ] **Step 1: 安装 Hono 依赖**

Run: `npm install hono`
Expected: `package.json` 的 `dependencies` 中成功添加 `hono`

- [ ] **Step 2: 修改 `wrangler.json` 启用静态 Assets 托管**

将 `wrangler.json` 替换为：
```json
{
	"compatibility_date": "2025-10-08",
	"compatibility_flags": ["nodejs_compat"],
	"main": "src/index.ts",
	"name": "d1-template",
	"upload_source_maps": true,
	"assets": {
		"directory": "./public"
	},
	"d1_databases": [
		{
			"binding": "DB",
			"database_id": "7fc94f1b-0a1f-4880-924f-fa2c36e5033f",
			"database_name": "d1-db"
		}
	],
	"r2_buckets": [
		{
			"binding": "BUCKET",
			"bucket_name": "a-share-limit-up-images"
		}
	],
	"observability": {
		"enabled": true
	},
	"vars": {
		"GEMINI_API_BASE": "https://gemini-balance-lite.tonyogo.deno.net",
		"GEMINI_MODEL": "gemini-flash-latest"
	}
}
```

- [ ] **Step 3: 创建 `src/types.ts` 定义全局业务类型**

创建 `src/types.ts` 并写入：
```typescript
export interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	GEMINI_API_KEY?: string;
	GEMINI_API_BASE?: string;
	GEMINI_MODEL?: string;
}

export interface DailySummary {
	date: string;
	stock_count: number;
	upgrade_rate: number | null;
	limit_broken_rate: number | null;
	bidding_increase_rate: number | null;
}

export interface SectorRow {
	id: number;
	date: string;
	name: string;
	description: string | null;
}

export interface StockRow {
	id: number;
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_id: number | null;
}

export interface SearchRow {
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_name: string | null;
}

export interface LeaderRow {
	sector_name: string;
	code: string;
	stock_name: string;
	limit_up_count: number;
}

export interface ActiveSectorMetricRow {
	name: string;
	appearances: number;
	total_stocks_count: number;
	latest_date: string;
	description: string | null;
}

export interface StockParsed {
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
}

export interface SectorParsed {
	name: string;
	description: string;
	stocks: StockParsed[];
}
```

- [ ] **Step 4: 创建 Hono 基础骨架 `src/index.ts`**

创建并写入 `src/index.ts`：
```typescript
import { Hono } from 'hono';
import { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// 所有的后端 API 一律挂载至 /api 前缀下
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'A-Share Limit-up Backend' }));

export default app;
```

- [ ] **Step 5: 运行本地构建与类型检查，确保 Hono 跑通**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 6: Commit**

```bash
git add package.json wrangler.json src/index.ts src/types.ts
git commit -m "chore: initialize hono framework and static assets deployment config"
```

---

### Task 2: 拆分底层工具类 (OCR Parser & Gemini Client)

**Files:**
- Create: `src/utils/gemini.client.ts`
- Create: `src/utils/ocr-parser.ts`

- [ ] **Step 1: 创建 Gemini API 包装器 `src/utils/gemini.client.ts`**

写入 `src/utils/gemini.client.ts`：
```typescript
import { Env } from '../types';

declare const Buffer: any;

export class GeminiClient {
	constructor(private env: Env) {}

	async callOCR(imageBlob: Blob, mimeType: string): Promise<string> {
		const arrayBuffer = await imageBlob.arrayBuffer();
		const base64String = Buffer.from(arrayBuffer).toString('base64');

		const apiBase = this.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
		const model = this.env.GEMINI_MODEL || 'gemini-flash-latest';
		const apiKey = this.env.GEMINI_API_KEY;

		if (!apiKey) {
			throw new Error("GEMINI_API_KEY is not configured");
		}

		const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;

		const payload = {
			contents: [
				{
					parts: [
						{
							inlineData: {
								data: base64String,
								mimeType: mimeType
							}
						},
						{
							text: "请对输入图片执行以下任务：1. 提取图片中所有可见文字 2. 保持原始阅读顺序 3. 按内容结构转换为 Markdown 4. 只输出最终 Markdown 格式"
						}
					],
					role: "user"
				}
			],
			systemInstruction: {
				parts: [
					{
						text: "# OCR 助手\n你是一个专业的 OCR 与文档结构重建引擎。\n你的任务是将图片中的文字内容，严格、完整地转换为 Markdown 文档。\n\n必须遵守以下规则：\n1. 只输出 Markdown，不要输出任何解释性文字\n2. 不增加、不删除、不改写原始内容\n3. 保持原始阅读顺序\n4. 无法识别的内容用 `<!-- unreadable -->` 标记\n5. 所有文字都是从图片中获取，不要掺杂非图片中的文字\n\n结构转换规则：\n- 标题 → # / ## / ###\n- 段落 → 普通文本\n- 列表 → Markdown 列表\n- 表格 → Markdown 表格\n- 代码 → ``` 包裹\n- 强调 → ** / *\n\n排版规则：\n- 合并不必要的换行\n- 保持语义完整\n"
					}
				],
				role: "user"
			}
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errText}`);
		}

		const json: any = await response.json();
		if (!json.candidates || json.candidates.length === 0 || !json.candidates[0].content || !json.candidates[0].content.parts || json.candidates[0].content.parts.length === 0) {
			throw new Error("Empty or invalid response from Gemini API");
		}

		return json.candidates[0].content.parts[0].text;
	}
}
```

- [ ] **Step 2: 创建 Markdown 清洗与正则提取器 `src/utils/ocr-parser.ts`**

写入 `src/utils/ocr-parser.ts`：
```typescript
import { DailySummary, SectorParsed, StockParsed } from '../types';

export class OcrParser {
	static parse(markdown: string): { summary: Omit<DailySummary, 'date'>; sectorsAndStocks: SectorParsed[] } {
		const cleanMarkdown = markdown.replace(/\*/g, '');

		const STOCK_COUNT_PAT = /(?:涨停个数|涨停个股|涨停数)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*(?:只|个)?/;
		const UPGRADE_PAT = /(?:总晋级率|连板晋级率|晋级率|连晋率|总首板率|首板率|总普涨率|普涨率|总普盈率|普盈率)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const BROKEN_PAT = /(?:总炸板率|炸板率|总体板率|总结板率|总昨板率|总触板率)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const BIDDING_PAT = /(?:总竞价涨幅|竞价涨幅|急昨价涨幅)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const SECTOR_PAT = /^(#{2,3})\s*([^：:\n]+)(?:[:：]\s*(.*))?$/;

		const scMatch = cleanMarkdown.match(STOCK_COUNT_PAT);
		const upMatch = cleanMarkdown.match(UPGRADE_PAT);
		const brMatch = cleanMarkdown.match(BROKEN_PAT);
		const biMatch = cleanMarkdown.match(BIDDING_PAT);

		const summary = {
			stock_count: scMatch ? parseInt(scMatch[1], 10) : 0,
			upgrade_rate: upMatch ? parseFloat(upMatch[1]) : null,
			limit_broken_rate: brMatch ? parseFloat(brMatch[1]) : null,
			bidding_increase_rate: biMatch ? parseFloat(biMatch[1]) : null,
		};

		const lines = markdown.split('\n');
		let currentSector: SectorParsed | null = null;
		const sectorsAndStocks: SectorParsed[] = [];

		for (const line of lines) {
			const stripped = line.trim();
			if (!stripped) {
				continue;
			}

			const secMatch = stripped.match(SECTOR_PAT);
			if (secMatch) {
				const name = secMatch[2].trim();
				const desc = secMatch[3] ? secMatch[3].trim() : "";

				const skipList = ['一字涨停', 'T字涨停', '复盘', '说明', '同花顺数据可视化', 'A股涨停复盘'];
				if (!skipList.includes(name)) {
					currentSector = {
						name,
						description: desc,
						stocks: []
					};
					sectorsAndStocks.push(currentSector);
				}
				continue;
			}

			if (stripped.startsWith('|') && stripped.endsWith('|')) {
				const parts = stripped.split('|').slice(1, -1).map(p => p.trim());
				if (parts.length === 5) {
					const code = parts[1];
					if (/^\d{6}$/.test(code)) {
						const stockRow: StockParsed = {
							status: parts[0] || null,
							code,
							name: parts[2],
							time: parts[3] || null,
							concept_reason: parts[4] || null
						};

						if (currentSector) {
							currentSector.stocks.push(stockRow);
						} else {
							currentSector = {
								name: "其他概念",
								description: "",
								stocks: [stockRow]
							};
							sectorsAndStocks.push(currentSector);
						}
					}
				}
			}
		}

		return { summary, sectorsAndStocks };
	}
}
```

- [ ] **Step 3: 运行类型检查，验证拆分工具类无语法错误**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add src/utils/
git commit -m "feat: extract and decouple gemini client and ocr markdown parser"
```

---

### Task 3: 搭建数据库访问层 (Repositories Layer)

**Files:**
- Create: `src/repositories/summary.repository.ts`
- Create: `src/repositories/sector.repository.ts`
- Create: `src/repositories/stock.repository.ts`

- [ ] **Step 1: 创建复盘摘要表数据访问层 `src/repositories/summary.repository.ts`**

写入 `src/repositories/summary.repository.ts`：
```typescript
import { DailySummary } from '../types';

export class SummaryRepository {
	constructor(private db: D1Database) {}

	async getAll(): Promise<DailySummary[]> {
		const { results } = await this.db.prepare(`
			SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
			FROM daily_summary
			ORDER BY date DESC
		`).all<DailySummary>();
		return results || [];
	}

	async deleteByDate(date: string): Promise<void> {
		await this.db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date).run();
	}

	async insert(summary: DailySummary): Promise<void> {
		await this.db.prepare(`
			INSERT INTO daily_summary (date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate)
			VALUES (?, ?, ?, ?, ?)
		`).bind(
			summary.date,
			summary.stock_count,
			summary.upgrade_rate,
			summary.limit_broken_rate,
			summary.bidding_increase_rate
		).run();
	}
}
```

- [ ] **Step 2: 创建板块表数据访问层 `src/repositories/sector.repository.ts`**

写入 `src/repositories/sector.repository.ts`：
```typescript
import { SectorRow } from '../types';

export class SectorRepository {
	constructor(private db: D1Database) {}

	async deleteByDate(date: string): Promise<void> {
		await this.db.prepare("DELETE FROM sectors WHERE date = ?").bind(date).run();
	}

	async getByDate(date: string): Promise<SectorRow[]> {
		const { results } = await this.db.prepare(`
			SELECT id, name, description
			FROM sectors
			WHERE date = ?
			ORDER BY id ASC
		`).bind(date).all<SectorRow>();
		return results || [];
	}

	// 提取当天所有板块对应的数据库自增 ID，并建立 板块名 -> ID 词典
	async getSectorIdMap(date: string): Promise<Record<string, number>> {
		const rows = await this.getByDate(date);
		const map: Record<string, number> = {};
		for (const row of rows) {
			map[row.name] = row.id;
		}
		return map;
	}
}
```

- [ ] **Step 3: 创建个股表数据访问层 `src/repositories/stock.repository.ts`**

这里承载了原先在控制器里的多表 HAVING 复合检索，以及 D1 Batch 和带有 CTE (Common Table Expression) 龙头股统计的复杂逻辑。

写入 `src/repositories/stock.repository.ts`：
```typescript
import { StockRow, SearchRow, ActiveSectorMetricRow, LeaderRow } from '../types';

export class StockRepository {
	constructor(private db: D1Database) {}

	async deleteByDate(date: string): Promise<void> {
		await this.db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date).run();
	}

	async getByDate(date: string): Promise<StockRow[]> {
		const { results } = await this.db.prepare(`
			SELECT id, status, code, name, time, concept_reason, sector_id
			FROM limit_up_stocks
			WHERE date = ?
			ORDER BY id ASC
		`).bind(date).all<StockRow>();
		return results || [];
	}

	// 复杂的多重交集检索
	async searchStocks(q: string, sectors: string[], reasons: string[], matchMode: 'exact' | 'fuzzy'): Promise<SearchRow[]> {
		if (!q && sectors.length === 0 && reasons.length === 0) {
			return [];
		}

		if (sectors.length > 0 || reasons.length > 0) {
			const havingClauses: string[] = [];
			const params: any[] = [];

			if (sectors.length > 0) {
				const uniqueSectors = Array.from(new Set(sectors));
				if (matchMode === "fuzzy") {
					for (const sec of uniqueSectors) {
						havingClauses.push("SUM(CASE WHEN s.name LIKE ? THEN 1 ELSE 0 END) > 0");
						params.push(`%${sec}%`);
					}
				} else {
					for (const sec of uniqueSectors) {
						havingClauses.push("SUM(CASE WHEN s.name = ? THEN 1 ELSE 0 END) > 0");
						params.push(sec);
					}
				}
			}

			if (reasons.length > 0) {
				const uniqueReasons = Array.from(new Set(reasons));
				for (const reason of uniqueReasons) {
					havingClauses.push("SUM(CASE WHEN l.concept_reason LIKE ? THEN 1 ELSE 0 END) > 0");
					params.push(`%${reason}%`);
				}
			}

			const innerQuery = `
				SELECT l.code
				FROM limit_up_stocks l
				LEFT JOIN sectors s ON l.sector_id = s.id
				GROUP BY l.code
				HAVING ${havingClauses.join(" AND ")}
			`;

			let outerQuery = "";
			if (q) {
				outerQuery = `
					SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
					FROM limit_up_stocks l
					LEFT JOIN sectors s ON l.sector_id = s.id
					WHERE l.code IN (${innerQuery}) AND (l.code LIKE ? OR l.name LIKE ?)
					ORDER BY l.date DESC
				`;
				const qParam = `%${q}%`;
				params.push(qParam, qParam);
			} else {
				outerQuery = `
					SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
					FROM limit_up_stocks l
					LEFT JOIN sectors s ON l.sector_id = s.id
					WHERE l.code IN (${innerQuery})
					ORDER BY l.date DESC
				`;
			}

			const stmt = this.db.prepare(outerQuery).bind(...params);
			const { results } = await stmt.all<SearchRow>();
			return results || [];
		} else {
			const queryParam = `%${q}%`;
			const { results } = await this.db.prepare(`
				SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
				FROM limit_up_stocks l
				LEFT JOIN sectors s ON l.sector_id = s.id
				WHERE l.code LIKE ? OR l.name LIKE ?
				ORDER BY l.date DESC
			`).bind(queryParam, queryParam).all<SearchRow>();
			return results || [];
		}
	}

	// 统计活跃板块的多 D1 batch 物理查询
	async getActiveSectorsRaw(targetDates: string[]): Promise<[ActiveSectorMetricRow[], LeaderRow[]]> {
		const placeholders = targetDates.map(() => "?").join(", ");
		
		const batchResult = await this.db.batch([
			this.db.prepare(`
				SELECT
					s.name,
					COUNT(DISTINCT s.date) AS appearances,
					COUNT(l.id) AS total_stocks_count,
					MAX(s.date) AS latest_date,
					(SELECT s2.description FROM sectors s2 WHERE s2.name = s.name ORDER BY s2.date DESC LIMIT 1) AS description
				FROM sectors s
				LEFT JOIN limit_up_stocks l ON s.id = l.sector_id
				WHERE s.date IN (${placeholders})
				GROUP BY s.name
				ORDER BY total_stocks_count DESC, appearances DESC
			`).bind(...targetDates),

			this.db.prepare(`
				WITH RankedStocks AS (
					SELECT
						s.name AS sector_name,
						l.code,
						l.name AS stock_name,
						COUNT(l.id) AS limit_up_count,
						ROW_NUMBER() OVER (PARTITION BY s.name ORDER BY COUNT(l.id) DESC, l.date DESC) AS rank
					FROM limit_up_stocks l
					JOIN sectors s ON l.sector_id = s.id
					WHERE s.date IN (${placeholders})
					GROUP BY s.name, l.code, l.name
				)
				SELECT sector_name, code, stock_name, limit_up_count
				FROM RankedStocks
				WHERE rank <= 3
				ORDER BY sector_name, limit_up_count DESC
			`).bind(...targetDates)
		]);

		return [
			(batchResult[0].results as ActiveSectorMetricRow[]) || [],
			(batchResult[1].results as LeaderRow[]) || []
		];
	}
}
```

- [ ] **Step 4: 运行编译和类型检查**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add src/repositories/
git commit -m "feat: implement database repositories for daily_summary, sectors, and stocks"
```

---

### Task 4: 实现业务服务层 (Services Layer)

**Files:**
- Create: `src/services/review.service.ts`
- Create: `src/services/search.service.ts`
- Create: `src/services/active.service.ts`
- Create: `src/services/upload.service.ts`

- [ ] **Step 1: 创建复盘明细服务 `src/services/review.service.ts`**

写入 `src/services/review.service.ts`：
```typescript
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';

export class ReviewService {
	constructor(
		private summaryRepo: SummaryRepository,
		private sectorRepo: SectorRepository,
		private stockRepo: StockRepository
	) {}

	async getReviewDetails(date: string) {
		const summary = await this.summaryRepo.db.prepare(`
			SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
			FROM daily_summary
			WHERE date = ?
		`).bind(date).first<any>();

		if (!summary) {
			return null;
		}

		const sectors = await this.sectorRepo.getByDate(date);
		const stocks = await this.stockRepo.getByDate(date);

		const sectorsDict: Record<number, any> = {};
		for (const sec of sectors) {
			sectorsDict[sec.id] = {
				id: sec.id,
				name: sec.name,
				description: sec.description,
				stocks: []
			};
		}

		const otherStocks: any[] = [];
		for (const stock of stocks) {
			const sId = stock.sector_id;
			if (sId !== null && sId in sectorsDict) {
				sectorsDict[sId].stocks.push(stock);
			} else {
				otherStocks.push(stock);
			}
		}

		const finalSectors = Object.values(sectorsDict);
		if (otherStocks.length > 0) {
			finalSectors.push({
				id: -1,
				name: "其他概念",
				description: "未归类板块个股",
				stocks: otherStocks
			});
		}

		return {
			summary,
			sectors: finalSectors
		};
	}
}
```

- [ ] **Step 2: 创建查询过滤服务 `src/services/search.service.ts`**

写入 `src/services/search.service.ts`：
```typescript
import { StockRepository } from '../repositories/stock.repository';

export class SearchService {
	constructor(private stockRepo: StockRepository) {}

	async search(q: string, sectors: string[], reasons: string[], matchMode: 'exact' | 'fuzzy') {
		return this.stockRepo.searchStocks(q, sectors, reasons, matchMode);
	}
}
```

- [ ] **Step 3: 创建活跃板块计算服务 `src/services/active.service.ts`**

写入 `src/services/active.service.ts`：
```typescript
import { StockRepository } from '../repositories/stock.repository';

export class ActiveService {
	constructor(private stockRepo: StockRepository) {}

	async getActiveSectorsList(daysParam: string) {
		let datesQuery = "SELECT date FROM daily_summary ORDER BY date DESC";
		const datesParams: any[] = [];
		if (daysParam !== "all") {
			const limitVal = parseInt(daysParam, 10) || 30;
			datesQuery += " LIMIT ?";
			datesParams.push(limitVal);
		}

		const { results: dateRows } = await this.stockRepo.db.prepare(datesQuery).bind(...datesParams).all<{ date: string }>();
		const targetDates = (dateRows || []).map(r => r.date);

		if (targetDates.length === 0) {
			return [];
		}

		const [sectorMetrics, leaderStocks] = await this.stockRepo.getActiveSectorsRaw(targetDates);

		const leadersBySector: Record<string, any[]> = {};
		for (const leader of leaderStocks) {
			const sName = leader.sector_name;
			if (!(sName in leadersBySector)) {
				leadersBySector[sName] = [];
			}
			leadersBySector[sName].push({
				code: leader.code,
				name: leader.stock_name,
				count: leader.limit_up_count
			});
		}

		return sectorMetrics.map(sec => ({
			name: sec.name,
			description: sec.description,
			appearances: sec.appearances,
			total_stocks_count: sec.total_stocks_count,
			latest_date: sec.latest_date,
			leaders: leadersBySector[sec.name] || []
		}));
	}
}
```

- [ ] **Step 4: 创建核心上传流水线服务 `src/services/upload.service.ts`**

写入 `src/services/upload.service.ts`：
```typescript
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { GeminiClient } from '../utils/gemini.client';
import { OcrParser } from '../utils/ocr-parser';

export class UploadService {
	constructor(
		private summaryRepo: SummaryRepository,
		private sectorRepo: SectorRepository,
		private stockRepo: StockRepository,
		private geminiClient: GeminiClient,
		private r2Bucket: R2Bucket | null
	) {}

	async processUploadPipeline(file: File, date: string) {
		const mimeType = file.type || "image/png";
		const rawMarkdown = await this.geminiClient.callOCR(file, mimeType);
		const { summary, sectorsAndStocks } = OcrParser.parse(rawMarkdown);

		// D1 Database operations
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

		if (this.r2Bucket) {
			try {
				const fileExtension = file.name.split('.').pop() || 'png';
				const imageKey = `images/${date}.${fileExtension}`;
				await this.r2Bucket.put(imageKey, file.stream(), {
					httpMetadata: {
						contentType: mimeType,
						cacheControl: "public, max-age=31536000",
					},
					customMetadata: {
						uploadDate: new Date().toISOString(),
						originalName: file.name
					}
				});
			} catch (r2Error: any) {
				console.error("Warning: Failed to save image to R2 inside service:", r2Error);
			}
		}

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount: sectorsAndStocks.length,
			stocksCount,
			rawMarkdown
		};
	}
}
```

- [ ] **Step 5: 验证编译和类型安全**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 6: Commit**

```bash
git add src/services/
git commit -m "feat: complete services layer for review, search, active and upload operations"
```

---

### Task 5: 整合 Hono 控制器与接口路由配置 (Controller & Route Layer)

**Files:**
- Create: `src/controllers/review.ts`
- Create: `src/controllers/search.ts`
- Create: `src/controllers/active.ts`
- Create: `src/controllers/upload.ts`
- Create: `src/controllers/image.ts`
- Create: `src/controllers/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 创建复盘详情控制器 `src/controllers/review.ts`**

写入 `src/controllers/review.ts`：
```typescript
import { Context } from 'hono';
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { ReviewService } from '../services/review.service';

export async function getSummaries(c: Context) {
	const summaryRepo = new SummaryRepository(c.env.DB);
	try {
		const summaries = await summaryRepo.getAll();
		return c.json(summaries);
	} catch (error: any) {
		return c.json({ error: "Failed to load summaries", message: error.message }, 500);
	}
}

export async function getDetails(c: Context) {
	const date = decodeURIComponent(c.req.param('date'));
	const db = c.env.DB;
	const reviewService = new ReviewService(
		new SummaryRepository(db),
		new SectorRepository(db),
		new StockRepository(db)
	);

	try {
		const data = await reviewService.getReviewDetails(date);
		if (!data) {
			return c.json({ error: `No data available for date: ${date}` }, 404);
		}
		return c.json(data);
	} catch (error: any) {
		return c.json({ error: "Failed to load daily details", message: error.message }, 500);
	}
}
```

- [ ] **Step 2: 创建查询控制器 `src/controllers/search.ts`**

写入 `src/controllers/search.ts`：
```typescript
import { Context } from 'hono';
import { StockRepository } from '../repositories/stock.repository';
import { SearchService } from '../services/search.service';

export async function search(c: Context) {
	const q = c.req.query('q') || '';
	const sectors = c.req.queries('sectors') || [];
	const conceptReasons = c.req.queries('concept_reasons') || [];
	const sectorMatchMode = c.req.query('sector_match_mode') || 'exact';

	if (!q && sectors.length === 0 && conceptReasons.length === 0) {
		return c.json([]);
	}

	const searchService = new SearchService(new StockRepository(c.env.DB));
	try {
		const results = await searchService.search(q, sectors, conceptReasons, sectorMatchMode as 'exact' | 'fuzzy');
		return c.json(results);
	} catch (error: any) {
		return c.json({ error: "Search query failed", message: error.message }, 500);
	}
}
```

- [ ] **Step 3: 创建活跃板块控制器 `src/controllers/active.ts`**

写入 `src/controllers/active.ts`：
```typescript
import { Context } from 'hono';
import { StockRepository } from '../repositories/stock.repository';
import { ActiveService } from '../services/active.service';

export async function getActiveSectors(c: Context) {
	const daysParam = c.req.query('days') || '30';
	const activeService = new ActiveService(new StockRepository(c.env.DB));

	try {
		const results = await activeService.getActiveSectorsList(daysParam);
		return c.json(results);
	} catch (error: any) {
		return c.json({ error: "Active sectors analysis failed", message: error.message }, 500);
	}
}
```

- [ ] **Step 4: 创建 R2 图片流控制器 `src/controllers/image.ts`**

写入 `src/controllers/image.ts`：
```typescript
import { Context } from 'hono';

export async function getImage(c: Context) {
	const date = c.req.query('date');
	if (!date) {
		return c.json({ error: "Missing date parameter" }, 400);
	}

	if (!c.env.BUCKET) {
		return c.json({ error: "R2 bucket is not configured" }, 500);
	}

	const extensions = ["png", "jpg", "jpeg", "webp"];
	let object: R2ObjectBody | null = null;
	for (const ext of extensions) {
		const tempObj = await c.env.BUCKET.get(`images/${date}.${ext}`);
		if (tempObj) {
			object = tempObj;
			break;
		}
	}

	if (!object) {
		return c.json({ error: "Image Not Found for specified date" }, 404);
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000");

	return new Response(object.body, { headers });
}
```

- [ ] **Step 5: 创建 OCR 上传控制器 `src/controllers/upload.ts`**

写入 `src/controllers/upload.ts`：
```typescript
import { Context } from 'hono';
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { GeminiClient } from '../utils/gemini.client';
import { UploadService } from '../services/upload.service';

export async function uploadReview(c: Context) {
	if (!c.env.GEMINI_API_KEY) {
		return c.json({ error: "GEMINI_API_KEY is not configured. Please set it in your environment." }, 400);
	}

	try {
		const formData = await c.req.formData();
		const date = formData.get("date") as string;
		const file = (formData.get("file") || formData.get("image")) as File | null;

		if (!date) {
			return c.json({ error: "Missing date parameter" }, 400);
		}
		if (!file) {
			return c.json({ error: "Missing file parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			new GeminiClient(c.env),
			c.env.BUCKET || null
		);

		const result = await uploadService.processUploadPipeline(file, date);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside upload controller:", error);
		return c.json({ error: "Internal Server Error during upload processing", message: error.message }, 500);
	}
}
```

- [ ] **Step 6: 创建控制器统一路由器注册 `src/controllers/index.ts`**

写入 `src/controllers/index.ts`：
```typescript
import { Hono } from 'hono';
import { Env } from '../types';
import * as reviewController from './review';
import * as searchController from './search';
import * as activeController from './active';
import * as imageController from './image';
import * as uploadController from './upload';

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
	app.get('/api/daily-summaries', reviewController.getSummaries);
	app.get('/api/daily-details/:date', reviewController.getDetails);
	app.get('/api/search', searchController.search);
	app.get('/api/active-sectors', activeController.getActiveSectors);
	app.get('/api/image', imageController.getImage);
	app.post('/api/upload', uploadController.uploadReview);
}
```

- [ ] **Step 7: 在 `src/index.ts` 注册 API 路由器**

修改 `src/index.ts` 为：
```typescript
import { Hono } from 'hono';
import { Env } from './types';
import { registerRoutes } from './controllers';

const app = new Hono<{ Bindings: Env }>();

// 自动向 Hono 注册所有的 API 路由
registerRoutes(app);

export default app;
```

- [ ] **Step 8: 运行编译与类型安全审查**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 9: Commit**

```bash
git add src/controllers/ src/index.ts
git commit -m "feat: design routing logic with hono routers and controllers"
```

---

### Task 6: 迁移与重构前端代码 (Wrangler Assets & Decoupling)

我们将彻底拆解并升级 `src/indexHtml.ts` 中的 1500 多行前端页面。

**Files:**
- Create: `public/index.html`
- Create: `public/css/app.css`
- Create: `public/js/api.js`
- Create: `public/js/tabs/search.js`
- Create: `public/js/tabs/review.js`
- Create: `public/js/tabs/active.js`
- Create: `public/js/tabs/upload.js`
- Create: `public/js/app.js`

- [ ] **Step 1: 创建 `public/index.html` 主静态视图**

创建并写入 `public/index.html`，保持原有的 CSS 外部引用和 Tab 外观骨架不变。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A股涨停复盘看板</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="/css/app.css">
</head>
<body class="bg-slate-50 font-sans text-slate-800 antialiased min-h-screen flex flex-col">

    <header class="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-3">
                    <div class="p-2 bg-red-500 rounded-lg text-white">
                        <i data-lucide="trending-up" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h1 class="text-lg font-bold text-slate-900 tracking-tight">A股涨停复盘数据看板</h1>
                        <p class="text-xs text-slate-500">智能量化每日行情与个股查询系统</p>
                    </div>
                </div>

                <nav class="flex space-x-1 bg-slate-100 p-1 rounded-xl" aria-label="Tabs">
                    <button id="tab-btn-search" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm">
                        <i data-lucide="search" class="w-4 h-4 text-red-500"></i>
                        <span>个股查询</span>
                    </button>
                    <button id="tab-btn-review" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        <span>每日复盘</span>
                    </button>
                    <button id="tab-btn-active" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="award" class="w-4 h-4"></i>
                        <span>活跃板块</span>
                    </button>
                    <button id="tab-btn-upload" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="cloud-upload" class="w-4 h-4"></i>
                        <span>上传数据</span>
                    </button>
                </nav>
            </div>
        </div>
    </header>

    <main class="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- ==================== TAB 1: STOCK SEARCH ==================== -->
        <section id="tab-content-search" class="space-y-6">
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full space-y-4">
                <h2 class="text-lg font-bold text-slate-900">个股历史涨停查询</h2>
                <p class="text-xs text-slate-500">输入个股名称（如：大唐电信）或六位数股票代码（如：600198）即可快速查询其全部历史涨停复盘记录。</p>
                <div class="relative rounded-xl shadow-sm flex">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i data-lucide="search" class="h-5 w-5 text-slate-400"></i>
                    </div>
                    <input type="text" id="search-input" placeholder="输入股票名称、代码查询..." class="block w-full pl-10 pr-24 py-3 sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                    <button id="search-btn" class="absolute right-1.5 top-1.5 px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold shadow-sm transition duration-150 flex items-center space-x-1.5">
                        <span>查询</span>
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                    <div class="space-y-2 flex flex-col">
                        <label for="sector-filter-input" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">板块/概念 过滤 (AND 逻辑求交集)</label>
                        <div class="relative rounded-xl shadow-sm flex">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="hash" class="h-4 w-4 text-slate-400"></i>
                            </div>
                            <input type="text" id="sector-filter-input" placeholder="输入板块名称（如：机器人），按回车..." class="block w-full pl-9 pr-16 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                            <button id="sector-add-btn" class="absolute right-1 top-1 bottom-1 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xxs font-semibold shadow-sm transition duration-150 flex items-center justify-center">
                                <span>添加</span>
                            </button>
                        </div>
                        <div class="flex items-center space-x-2 mt-1 text-xs">
                            <span class="font-bold text-slate-400 text-xxs uppercase tracking-wider">匹配模式:</span>
                            <div class="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200" role="radiogroup">
                                <button id="btn-mode-exact" class="px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm">精确</button>
                                <button id="btn-mode-fuzzy" class="px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800">模糊 (LIKE)</button>
                            </div>
                        </div>
                        <div id="sector-tags-container" class="flex flex-wrap gap-1.5 mt-1"></div>
                    </div>
                    <div class="space-y-2 flex flex-col">
                        <label for="reason-filter-input" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">概念/原因 过滤 (支持多个，AND 模糊求交集)</label>
                        <div class="relative rounded-xl shadow-sm flex">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="tag" class="h-4 w-4 text-slate-400"></i>
                            </div>
                            <input type="text" id="reason-filter-input" placeholder="输入涨停动因（如：并购、低空），按回车..." class="block w-full pl-9 pr-16 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                            <button id="reason-add-btn" class="absolute right-1 top-1 bottom-1 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xxs font-semibold shadow-sm transition duration-150 flex items-center justify-center">
                                <span>添加</span>
                            </button>
                        </div>
                        <div class="text-xxs text-slate-400 mt-1 italic">*本项仅支持模糊匹配</div>
                        <div id="reason-tags-container" class="flex flex-wrap gap-1.5 mt-1"></div>
                    </div>
                </div>
            </div>
            <div class="w-full">
                <div id="search-loader" class="hidden flex justify-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>
                <div id="search-empty-state" class="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
                    <div class="inline-flex p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
                        <i data-lucide="pie-chart" class="w-10 h-10"></i>
                    </div>
                    <h3 class="text-base font-semibold text-slate-900">暂无查询数据</h3>
                    <p class="text-xs text-slate-400 mt-1">请输入有效的股票名、代码，或者添加概念板块、涨停动因过滤来查询历史数据。</p>
                </div>
                <div id="search-results-container" class="hidden space-y-4">
                    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 id="search-result-title" class="text-sm font-bold text-slate-900">查询结果</h3>
                            <p id="search-result-count" class="text-xs text-slate-400 mt-0.5">找到 -- 条历史纪录</p>
                        </div>
                    </div>
                    <div id="search-results-body" class="space-y-4"></div>
                </div>
            </div>
        </section>

        <!-- ==================== TAB 2: DAILY REVIEW ==================== -->
        <section id="tab-content-review" class="hidden space-y-6">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                </div>
                <div id="selected-date-info" class="text-right hidden md:block">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-500"></span>数据状态：已同步
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-blue-50 rounded-xl text-blue-600"><i data-lucide="box" class="w-6 h-6"></i></div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">涨停家数</p>
                        <h3 id="stat-count" class="text-2xl font-bold text-slate-900 mt-1">--</h3>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-emerald-50 rounded-xl text-emerald-600"><i data-lucide="chevrons-up" class="w-6 h-6"></i></div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">晋级率</p>
                        <h3 id="stat-upgrade" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-rose-50 rounded-xl text-rose-600"><i data-lucide="zap-off" class="w-6 h-6"></i></div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">炸板率</p>
                        <h3 id="stat-broken" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-purple-50 rounded-xl text-purple-600"><i data-lucide="activity" class="w-6 h-6"></i></div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">竞价涨幅</p>
                        <h3 id="stat-bidding" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>
            </div>

            <div id="review-image-card" class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hidden">
                <button id="image-toggle-btn" class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100 font-bold">
                    <div class="flex items-center space-x-3">
                        <div class="p-1.5 bg-red-50 text-red-500 rounded-lg"><i data-lucide="image" class="w-4 h-4"></i></div>
                        <span class="text-sm font-extrabold text-slate-900">查看当日复盘原始长图</span>
                    </div>
                    <div class="p-1 text-slate-400 flex items-center space-x-2">
                        <span id="image-toggle-status" class="text-xs font-semibold text-slate-400">展开</span>
                        <i id="image-chevron" data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i>
                    </div>
                </button>
                <div id="image-collapse" class="hidden p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                    <img id="review-image" src="" alt="复盘长图" class="max-w-full md:max-w-3xl h-auto rounded-xl shadow-md border border-slate-200" />
                </div>
            </div>

            <div id="review-loader" class="hidden flex justify-center py-20">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
            </div>
            <div id="sectors-accordion" class="w-full space-y-4"></div>
        </section>

        <!-- ==================== TAB 3: ACTIVE SECTORS ==================== -->
        <section id="tab-content-active" class="hidden space-y-6">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex flex-wrap items-center gap-4">
                    <div class="flex items-center space-x-2">
                        <div class="p-2 bg-slate-100 rounded-xl text-slate-600"><i data-lucide="clock" class="w-5 h-5"></i></div>
                        <div>
                            <label for="active-scope-select" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">分析时间跨度</label>
                            <select id="active-scope-select" class="mt-1 block w-44 pl-3 pr-10 py-1.5 text-base border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg bg-slate-50 font-medium text-slate-900">
                                <option value="7">近 7 个交易日</option>
                                <option value="30" selected>近 30 个交易日</option>
                                <option value="all">全历史数据</option>
                            </select>
                        </div>
                    </div>
                    <div class="relative rounded-xl shadow-sm w-64 mt-4 md:mt-0 pt-1">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i data-lucide="filter" class="h-4 w-4 text-slate-400"></i></div>
                        <input type="text" id="active-search-input" placeholder="筛选概念板块名称..." class="block w-full pl-9 pr-4 py-2 sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                    </div>
                </div>
                <div class="text-right hidden md:block">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>已计算热度龙头股
                    </span>
                </div>
            </div>
            <div id="active-loader" class="hidden flex justify-center py-20">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
            </div>
            <div id="active-sectors-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"></div>
        </section>

        <!-- ==================== TAB 4: UPLOAD DATA ==================== -->
        <section id="tab-content-upload" class="hidden space-y-6">
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900">上传复盘图片</h2>
                        <p class="text-xs text-slate-500 mt-1">支持拖入或点击选择 A股涨停复盘的长图（.png, .jpg, .jpeg, .webp），智能识别并自动入库。</p>
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                        <label for="upload-date" class="text-xs font-semibold text-slate-500 uppercase tracking-wider">复盘日期</label>
                        <input type="date" id="upload-date" class="block pl-3 pr-3 py-1.5 text-sm border border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 rounded-lg bg-slate-50 font-medium text-slate-900">
                    </div>
                </div>
                <div id="drop-zone" class="border-2 border-dashed border-slate-300 hover:border-red-400 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-8 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center min-h-[220px]">
                    <input type="file" id="file-input" class="hidden" accept=".png,.jpg,.jpeg,.webp">
                    <div class="p-4 bg-white rounded-full text-slate-400 shadow-sm mb-4 border border-slate-100"><i data-lucide="cloud-upload" class="w-10 h-10 text-red-500"></i></div>
                    <p class="text-sm font-bold text-slate-700">将复盘长图拖拽至此，或 <span class="text-red-500 hover:text-red-600">点击上传</span></p>
                    <p class="text-xxs text-slate-400 mt-2">支持常见图片格式：PNG, JPG, JPEG, WEBP</p>
                    <div id="selected-file-info" class="hidden mt-4 px-3 py-1.5 bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-center space-x-2 text-xs font-semibold">
                        <i data-lucide="file-image" class="w-4 h-4"></i><span id="selected-file-name">filename.png</span>
                    </div>
                </div>
            </div>

            <div id="upload-progress-container" class="hidden bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div class="flex items-center space-x-4">
                    <div id="upload-loader" class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 shrink-0"></div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-900">正在处理上传数据</h3>
                        <p id="current-phase-desc" class="text-xs text-slate-400 mt-0.5">请勿关闭页面，系统正在按步骤处理中...</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                    <div id="phase-read" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100"><i data-lucide="file-text" class="w-4 h-4"></i></div>
                        <span class="text-xs font-bold">1. 读取图片</span>
                    </div>
                    <div id="phase-ocr" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100"><i data-lucide="cpu" class="w-4 h-4"></i></div>
                        <span class="text-xs font-bold">2. Gemini 识别</span>
                    </div>
                    <div id="phase-parse" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100"><i data-lucide="binary" class="w-4 h-4"></i></div>
                        <span class="text-xs font-bold">3. 解析数据</span>
                    </div>
                    <div id="phase-save" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100"><i data-lucide="database" class="w-4 h-4"></i></div>
                        <span class="text-xs font-bold">4. 数据入库</span>
                    </div>
                </div>
            </div>

            <div id="upload-status-box" class="hidden space-y-6">
                <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start space-x-4">
                    <div class="p-2.5 bg-emerald-500 rounded-xl text-white shadow-sm shrink-0"><i data-lucide="check-circle" class="w-6 h-6"></i></div>
                    <div class="flex-grow">
                        <h3 class="text-base font-black text-emerald-900 font-bold">解析并上传数据成功！</h3>
                        <p class="text-xs text-emerald-700 mt-1">复盘数据已完整写入 D1 数据库。该日期的复盘记录现在已即时可查。</p>
                        <div class="mt-3 flex space-x-3">
                            <button id="view-review-btn" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">立即查看复盘</button>
                            <button id="continue-upload-btn" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold shadow-sm transition">继续上传</button>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-blue-50 rounded-xl text-blue-600 shrink-0"><i data-lucide="box" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">个股总数</p>
                            <h3 id="upload-stat-stocks" class="text-xl font-bold text-slate-900 mt-1">--</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-indigo-50 rounded-xl text-indigo-600 shrink-0"><i data-lucide="hash" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">板块概念</p>
                            <h3 id="upload-stat-sectors" class="text-xl font-bold text-slate-900 mt-1">--</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0"><i data-lucide="chevrons-up" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">晋级率</p>
                            <h3 id="upload-stat-upgrade" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-purple-50 rounded-xl text-purple-600 shrink-0"><i data-lucide="activity" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">竞价涨幅</p>
                            <h3 id="upload-stat-bidding" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4 col-span-2 lg:col-span-1">
                        <div class="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0"><i data-lucide="zap-off" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">炸板率</p>
                            <h3 id="upload-stat-broken" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                </div>
                <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <button id="markdown-toggle-btn" class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100 font-bold">
                        <div class="flex items-center space-x-3">
                            <div class="p-1.5 bg-slate-100 text-slate-600 rounded-lg"><i data-lucide="file-text" class="w-4 h-4"></i></div>
                            <span class="text-sm font-extrabold text-slate-900">查看 Gemini OCR 原始 Markdown 识别内容</span>
                        </div>
                        <div class="p-1 text-slate-400"><i id="markdown-chevron" data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></div>
                    </button>
                    <div id="markdown-collapse" class="hidden p-6 bg-slate-950 font-mono text-slate-200 text-xs overflow-x-auto max-h-[500px]">
                        <pre id="raw-markdown-pre" class="whitespace-pre-wrap leading-relaxed"></pre>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer class="bg-white border-t border-slate-200 py-6 mt-12">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p class="text-xs text-slate-400">A-Share Market Review App • Powered by Cloudflare D1 & Hono</p>
        </div>
    </footer>

    <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 `public/css/app.css` 前端样式**

写入 `public/css/app.css`：
```css
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: #f1f5f9;
}
::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}
```

- [ ] **Step 3: 创建 `public/js/api.js` API 网络请求抽象接口**

写入 `public/js/api.js`：
```javascript
export const api = {
    getDailySummaries: () => fetch('/api/daily-summaries').then(r => r.json()),
    getDailyDetails: (date) => fetch(`/api/daily-details/${encodeURIComponent(date)}`).then(r => r.json()),
    searchStocks: (params) => {
        const queryParams = new URLSearchParams();
        if (params.q) queryParams.append('q', params.q);
        if (params.sectors) {
            params.sectors.forEach(s => queryParams.append('sectors', s));
        }
        if (params.concept_reasons) {
            params.concept_reasons.forEach(r => queryParams.append('concept_reasons', r));
        }
        queryParams.append('sector_match_mode', params.sector_match_mode || 'exact');
        return fetch('/api/search?' + queryParams.toString()).then(r => r.json());
    },
    getActiveSectors: (days) => fetch(`/api/active-sectors?days=${days}`).then(r => r.json()),
    uploadImage: (formData) => fetch('/api/upload', { method: 'POST', body: formData }).then(r => r.json())
};
```

- [ ] **Step 4: 创建 `public/js/tabs/search.js` 个股历史查询控制模块**

写入 `public/js/tabs/search.js`：
```javascript
import { api } from '../api.js';

export class SearchTab {
    constructor(app) {
        this.app = app;
        this.activeSectors = [];
        this.activeReasons = [];
        this.sectorMatchMode = 'exact';
        
        this.initDOM();
    }

    initDOM() {
        this.input = document.getElementById('search-input');
        this.btnSearch = document.getElementById('search-btn');
        this.sectorInput = document.getElementById('sector-filter-input');
        this.sectorAddBtn = document.getElementById('sector-add-btn');
        this.reasonInput = document.getElementById('reason-filter-input');
        this.reasonAddBtn = document.getElementById('reason-add-btn');
        this.btnExact = document.getElementById('btn-mode-exact');
        this.btnFuzzy = document.getElementById('btn-mode-fuzzy');
        this.loader = document.getElementById('search-loader');
        this.emptyState = document.getElementById('search-empty-state');
        this.resultsContainer = document.getElementById('search-results-container');
        this.resultsBody = document.getElementById('search-results-body');
        this.resultTitle = document.getElementById('search-result-title');
        this.resultCount = document.getElementById('search-result-count');
        this.sectorTagsContainer = document.getElementById('sector-tags-container');
        this.reasonTagsContainer = document.getElementById('reason-tags-container');

        this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.performSearch(); });
        this.btnSearch.addEventListener('click', () => this.performSearch());

        this.sectorInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addSectorTag(); });
        this.sectorAddBtn.addEventListener('click', () => this.addSectorTag());

        this.reasonInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addReasonTag(); });
        this.reasonAddBtn.addEventListener('click', () => this.addReasonTag());

        this.btnExact.addEventListener('click', () => this.setMatchMode('exact'));
        this.btnFuzzy.addEventListener('click', () => this.setMatchMode('fuzzy'));
    }

    setMatchMode(mode) {
        if (this.sectorMatchMode === mode) return;
        this.sectorMatchMode = mode;
        if (mode === 'exact') {
            this.btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
            this.btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
        } else {
            this.btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
            this.btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
        }
        if (this.activeSectors.length > 0) this.performSearch();
    }

    addSectorTag() {
        const value = this.sectorInput.value.trim();
        if (!value) return;
        if (!this.activeSectors.includes(value)) {
            this.activeSectors.push(value);
            this.renderSectorTags();
            this.performSearch();
        }
        this.sectorInput.value = '';
    }

    removeSectorTag(val) {
        this.activeSectors = this.activeSectors.filter(s => s !== val);
        this.renderSectorTags();
        this.performSearch();
    }

    renderSectorTags() {
        this.sectorTagsContainer.innerHTML = '';
        this.activeSectors.forEach(name => {
            const span = document.createElement('span');
            span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 shadow-sm";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-red-500 hover:text-red-900 focus:outline-none"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            `;
            span.querySelector('button').addEventListener('click', () => this.removeSectorTag(name));
            this.sectorTagsContainer.appendChild(span);
        });
        lucide.createIcons();
    }

    addReasonTag() {
        const value = this.reasonInput.value.trim();
        if (!value) return;
        if (!this.activeReasons.includes(value)) {
            this.activeReasons.push(value);
            this.renderReasonTags();
            this.performSearch();
        }
        this.reasonInput.value = '';
    }

    removeReasonTag(val) {
        this.activeReasons = this.activeReasons.filter(r => r !== val);
        this.renderReasonTags();
        this.performSearch();
    }

    renderReasonTags() {
        this.reasonTagsContainer.innerHTML = '';
        this.activeReasons.forEach(name => {
            const span = document.createElement('span');
            span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-indigo-500 hover:text-indigo-900 focus:outline-none"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            `;
            span.querySelector('button').addEventListener('click', () => this.removeReasonTag(name));
            this.reasonTagsContainer.appendChild(span);
        });
        lucide.createIcons();
    }

    async performSearch() {
        const q = this.input.value.trim();
        if (!q && this.activeSectors.length === 0 && this.activeReasons.length === 0) {
            this.loader.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            this.resultsContainer.classList.add('hidden');
            return;
        }

        this.loader.classList.remove('hidden');
        this.emptyState.classList.add('hidden');
        this.resultsContainer.classList.add('hidden');
        this.resultsBody.innerHTML = '';

        try {
            const data = await api.searchStocks({
                q,
                sectors: this.activeSectors,
                concept_reasons: this.activeReasons,
                sector_match_mode: this.sectorMatchMode
            });

            if (data.length === 0) {
                this.emptyState.classList.remove('hidden');
                this.resultCount.textContent = '找到 0 条历史纪录';
            } else {
                let displayTitle = q ? `“${q}”` : '';
                if (this.activeSectors.length > 0) {
                    displayTitle += (displayTitle ? ' + ' : '') + `板块 [${this.activeSectors.join(' & ')}]`;
                }
                if (this.activeReasons.length > 0) {
                    displayTitle += (displayTitle ? ' + ' : '') + `动因 [${this.activeReasons.join(' & ')}]`;
                }
                displayTitle += ' 的历史涨停记录';

                const grouped = {};
                data.forEach(item => {
                    if (!grouped[item.code]) {
                        grouped[item.code] = { code: item.code, name: item.name, history: [] };
                    }
                    grouped[item.code].history.push(item);
                });
                
                const stockList = Object.values(grouped);
                stockList.forEach(s => s.history.sort((a, b) => b.date.localeCompare(a.date)));
                stockList.sort((a, b) => b.history[0].date.localeCompare(a.history[0].date));

                this.resultTitle.textContent = displayTitle;
                this.resultCount.textContent = `找到 ${stockList.length} 家个股（共 ${data.length} 条历史纪录）`;

                stockList.forEach(stock => {
                    const latest = stock.history[0];
                    const card = document.createElement('div');
                    card.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";
                    
                    let historyRows = '';
                    stock.history.forEach(item => {
                        const statusStyle = this.app.getStatusBadgeStyle(item.status);
                        historyRows += `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="px-6 py-3 text-sm whitespace-nowrap text-slate-700 font-semibold font-mono hover:text-red-500 cursor-pointer" date-link="${item.date}">${item.date}</td>
                                <td class="px-6 py-3 text-sm whitespace-nowrap">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                        ${item.status || '涨停'}
                                    </span>
                                </td>
                                <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${item.time || '--:--'}</td>
                                <td class="px-6 py-3 text-sm whitespace-nowrap hover:text-red-500 cursor-pointer" sector-link="${item.sector_name || '其他概念'}">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        ${item.sector_name || '其他概念'}
                                    </span>
                                </td>
                                <td class="px-6 py-3 text-sm text-slate-600 max-w-sm truncate" title="${item.concept_reason || ''}">${item.concept_reason || '--'}</td>
                            </tr>
                        `;
                    });

                    const statusStyle = this.app.getStatusBadgeStyle(latest.status);
                    card.innerHTML = `
                        <button class="w-full px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/50 transition-colors text-left border-b border-slate-100 gap-4">
                            <div class="flex items-center space-x-3 truncate">
                                <div class="p-2 bg-red-50 text-red-500 rounded-lg shrink-0"><i data-lucide="trending-up" class="w-4 h-4"></i></div>
                                <div class="truncate">
                                    <span class="text-base font-extrabold text-slate-900">${stock.name}</span>
                                    <span class="text-xs text-slate-400 ml-2 font-mono font-medium">${stock.code}</span>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                                <div class="text-xs text-slate-500">
                                    最新：<span class="font-semibold text-slate-700 font-mono">${latest.date}</span>
                                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusStyle} ml-1">${latest.status || '涨停'}</span>
                                </div>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                    ${stock.history.length} 次记录
                                </span>
                                <div class="p-1 text-slate-400"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i></div>
                            </div>
                        </button>
                        <div class="hidden border-t border-slate-100 overflow-x-auto bg-slate-50/30">
                            <table class="min-w-full divide-y divide-slate-100">
                                <thead class="bg-slate-50/50">
                                    <tr>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">日期</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">板式/状态</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">涨停时间</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">所属概念板块</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">${historyRows}</tbody>
                            </table>
                        </div>
                    `;

                    const btnToggle = card.querySelector('button');
                    const collapse = card.querySelector('div:last-child');
                    const icon = card.querySelector('button i[data-lucide="chevron-down"]');

                    btnToggle.addEventListener('click', () => {
                        if (collapse.classList.contains('hidden')) {
                            collapse.classList.remove('hidden');
                            icon.setAttribute('data-lucide', 'chevron-up');
                        } else {
                            collapse.classList.add('hidden');
                            icon.setAttribute('data-lucide', 'chevron-down');
                        }
                        lucide.createIcons();
                    });

                    // 给跨 Tab 的跳转项绑定点击监听
                    card.querySelectorAll('[date-link]').forEach(el => {
                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.deepLinkDate(el.getAttribute('date-link'));
                        });
                    });

                    card.querySelectorAll('[sector-link]').forEach(el => {
                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.deepLinkSector(el.getAttribute('sector-link'));
                        });
                    });

                    this.resultsBody.appendChild(card);
                });

                this.resultsContainer.classList.remove('hidden');
                lucide.createIcons();
            }
        } catch (err) {
            console.error(err);
            alert('个股查询失败');
            this.emptyState.classList.remove('hidden');
        } finally {
            this.loader.classList.add('hidden');
        }
    }
}
```

- [ ] **Step 5: 创建 `public/js/tabs/review.js` 每日复盘控制模块**

写入 `public/js/tabs/review.js`：
```javascript
import { api } from '../api.js';

export class ReviewTab {
    constructor(app) {
        this.app = app;
        this.initDOM();
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

        this.select.addEventListener('change', (e) => this.loadDailyDetails(e.target.value));
        this.imageToggleBtn.addEventListener('click', () => this.toggleImage());
    }

    toggleImage() {
        if (this.imageCollapse.classList.contains('hidden')) {
            this.imageCollapse.classList.remove('hidden');
            this.imageChevron.setAttribute('data-lucide', 'chevron-up');
            this.imageToggleStatus.textContent = '收起';
        } else {
            this.imageCollapse.classList.add('hidden');
            this.imageChevron.setAttribute('data-lucide', 'chevron-down');
            this.imageToggleStatus.textContent = '展开';
        }
        lucide.createIcons();
    }

    async loadDailyDetails(date) {
        if (!date) return;

        this.loader.classList.remove('hidden');
        this.accordionContainer.innerHTML = '';

        try {
            this.reviewImg.src = '/api/image?date=' + date;
            this.reviewImg.onload = () => this.imageCard.classList.remove('hidden');
            this.reviewImg.onerror = () => {
                this.imageCard.classList.add('hidden');
                this.imageCollapse.classList.add('hidden');
                this.imageChevron.setAttribute('data-lucide', 'chevron-down');
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
                    <tr class="hover:bg-slate-50/50 transition-colors">
                        <td class="px-6 py-3 text-sm whitespace-nowrap">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                ${stock.status || '涨停'}
                            </span>
                        </td>
                        <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.code}</td>
                        <td class="px-6 py-3 text-sm font-bold text-slate-900 whitespace-nowrap hover:text-red-500 cursor-pointer" stock-link="${stock.name}">${stock.name}</td>
                        <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.time || '--:--'}</td>
                        <td class="px-6 py-3 text-sm text-slate-600">${stock.concept_reason || '--'}</td>
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
                <div class="hidden border-t border-slate-100 overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-100">
                        <thead class="bg-slate-50/50">
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
            const collapse = item.querySelector('div:last-child');
            const icon = item.querySelector('button i[data-lucide="chevron-down"]');

            btnToggle.addEventListener('click', () => {
                if (collapse.classList.contains('hidden')) {
                    collapse.classList.remove('hidden');
                    icon.setAttribute('data-lucide', 'chevron-up');
                } else {
                    collapse.classList.add('hidden');
                    icon.setAttribute('data-lucide', 'chevron-down');
                }
                lucide.createIcons();
            });

            item.querySelectorAll('[stock-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkStock(el.getAttribute('stock-link'));
                });
            });

            this.accordionContainer.appendChild(item);
        });
        lucide.createIcons();
    }
}
```

- [ ] **Step 6: 创建 `public/js/tabs/active.js` 活跃板块分析模块**

写入 `public/js/tabs/active.js`：
```javascript
import { api } from '../api.js';

export class ActiveTab {
    constructor(app) {
        this.app = app;
        this.rawData = [];
        this.initDOM();
    }

    initDOM() {
        this.select = document.getElementById('active-scope-select');
        this.input = document.getElementById('active-search-input');
        this.loader = document.getElementById('active-loader');
        this.grid = document.getElementById('active-sectors-grid');

        this.select.addEventListener('change', (e) => this.loadActiveSectors(e.target.value));
        this.input.addEventListener('input', (e) => this.filterSectors(e.target.value));
    }

    async loadActiveSectors(scopeDays) {
        this.loader.classList.remove('hidden');
        this.grid.innerHTML = '';
        this.input.value = '';

        try {
            const data = await api.getActiveSectors(scopeDays);
            this.rawData = data;
            this.renderActiveSectors(data);
        } catch (err) {
            console.error(err);
            this.grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-500">计算板块活跃热度失败</div>';
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    filterSectors(text) {
        const val = text.trim().toLowerCase();
        if (!val) {
            this.renderActiveSectors(this.rawData);
            return;
        }
        const filtered = this.rawData.filter(sec =>
            sec.name.toLowerCase().includes(val) ||
            (sec.description && sec.description.toLowerCase().includes(val))
        );
        this.renderActiveSectors(filtered);
    }

    renderActiveSectors(sectors) {
        this.grid.innerHTML = '';
        if (!sectors || sectors.length === 0) {
            this.grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400">没有找到符合筛选条件的活跃板块</div>';
            return;
        }

        sectors.forEach(sector => {
            const card = document.createElement('div');
            card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-205 flex flex-col justify-between";

            let leadersMarkup = '';
            if (sector.leaders && sector.leaders.length > 0) {
                leadersMarkup = `
                    <div class="mt-4 pt-4 border-t border-slate-100">
                        <span class="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">领涨龙头股 (Dragon Head Leaders)</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${sector.leaders.map(ld => `
                                <button class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900 border border-red-100 transition-colors font-sans" stock-leader-link="${ld.name}">
                                    <span class="w-1 h-1 bg-red-500 rounded-full mr-1.5 shrink-0"></span>
                                    <span>${ld.name}</span>
                                    <span class="text-slate-400 font-mono ml-1 font-medium">(${ld.count}次)</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                leadersMarkup = `
                    <div class="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
                        分析周期内暂无主线龙头个股
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="space-y-3 flex-grow">
                    <div class="flex items-start justify-between gap-2">
                        <button class="text-lg font-black text-slate-900 hover:text-red-500 transition-colors text-left font-sans truncate font-bold" sector-link="${sector.name}">
                            ${sector.name}
                        </button>
                        <button class="inline-flex items-center px-2 py-0.5 rounded text-xxs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0" date-link="${sector.latest_date}">
                            活跃：${sector.latest_date.substring(5)}
                        </button>
                    </div>
                    <div class="flex items-center space-x-4 text-xs font-bold">
                        <div class="text-blue-600 flex items-center space-x-1">
                            <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                            <span>上榜 ${sector.appearances} 天</span>
                        </div>
                        <div class="text-indigo-600 flex items-center space-x-1">
                            <i data-lucide="box" class="w-3.5 h-3.5"></i>
                            <span>累计 ${sector.total_stocks_count} 只涨停</span>
                        </div>
                    </div>
                    <p class="text-xs text-slate-500 leading-relaxed font-normal line-clamp-3" title="${sector.description || ''}">
                        ${sector.description || '当前周期暂未捕获详细概念催化驱动。'}
                    </p>
                </div>
                ${leadersMarkup}
            `;

            card.querySelectorAll('[stock-leader-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkStock(el.getAttribute('stock-leader-link'));
                });
            });

            card.querySelectorAll('[sector-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkSector(el.getAttribute('sector-link'));
                });
            });

            card.querySelectorAll('[date-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkDate(el.getAttribute('date-link'));
                });
            });

            this.grid.appendChild(card);
        });
        lucide.createIcons();
    }
}
```

- [ ] **Step 7: 创建 `public/js/tabs/upload.js` 长图识别导入模块**

写入 `public/js/tabs/upload.js`：
```javascript
import { api } from '../api.js';

export class UploadTab {
    constructor(app) {
        this.app = app;
        this.initDOM();
    }

    initDOM() {
        this.dateInput = document.getElementById('upload-date');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.selectedFileInfo = document.getElementById('selected-file-info');
        this.selectedFileName = document.getElementById('selected-file-name');
        this.progressContainer = document.getElementById('upload-progress-container');
        this.phaseDesc = document.getElementById('current-phase-desc');
        this.statusBox = document.getElementById('upload-status-box');

        this.statStocks = document.getElementById('upload-stat-stocks');
        this.statSectors = document.getElementById('upload-stat-sectors');
        this.statUpgrade = document.getElementById('upload-stat-upgrade');
        this.statBidding = document.getElementById('upload-stat-bidding');
        this.statBroken = document.getElementById('upload-stat-broken');
        this.rawMarkdownPre = document.getElementById('raw-markdown-pre');

        this.viewReviewBtn = document.getElementById('view-review-btn');
        this.continueUploadBtn = document.getElementById('continue-upload-btn');
        this.markdownToggleBtn = document.getElementById('markdown-toggle-btn');
        this.markdownCollapse = document.getElementById('markdown-collapse');
        this.markdownChevron = document.getElementById('markdown-chevron');

        // 初始化默认日期 (当天)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        this.dateInput.value = `${year}-${month}-${day}`;

        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropZone.classList.add('border-red-400', 'bg-red-50/20');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropZone.classList.remove('border-red-400', 'bg-red-50/20');
            });
        });

        this.dropZone.addEventListener('drop', (e) => {
            this.handleFiles(e.dataTransfer.files);
        });

        this.viewReviewBtn.addEventListener('click', () => {
            this.app.deepLinkDate(this.dateInput.value);
        });
        this.continueUploadBtn.addEventListener('click', () => this.resetForm());
        this.markdownToggleBtn.addEventListener('click', () => this.toggleMarkdown());
    }

    toggleMarkdown() {
        if (this.markdownCollapse.classList.contains('hidden')) {
            this.markdownCollapse.classList.remove('hidden');
            this.markdownChevron.setAttribute('data-lucide', 'chevron-up');
        } else {
            this.markdownCollapse.classList.add('hidden');
            this.markdownChevron.setAttribute('data-lucide', 'chevron-down');
        }
        lucide.createIcons();
    }

    handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];

        this.selectedFileName.textContent = file.name;
        this.selectedFileInfo.classList.remove('hidden');

        // 正则提取文件名里的日期
        const extDate = this.extractDate(file.name);
        if (extDate) {
            this.dateInput.value = extDate;
        }

        this.uploadFile(file, this.dateInput.value);
    }

    extractDate(filename) {
        const match1 = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match1) return `${match1[1]}-${match1[2]}-${match1[3]}`;
        const match2 = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
        if (match2) return `${match2[1]}-${match2[2]}-${match2[3]}`;
        const match3 = filename.match(/(\d{4})(\d{2})(\d{2})/);
        if (match3) return `${match3[1]}-${match3[2]}-${match3[3]}`;
        return null;
    }

    setUploadPhase(phase) {
        const phases = ['read', 'ocr', 'parse', 'save'];
        const desc = {
            'read': '正在读取并上传图片...',
            'ocr': 'Gemini 智能识别中 (可能需要约 10-15 秒)...',
            'parse': '正在解析并结构化复盘数据...',
            'save': '正在将复盘结果安全写入 D1 数据库...'
        };

        this.phaseDesc.textContent = desc[phase] || '处理中...';

        phases.forEach(p => {
            const el = document.getElementById('phase-' + p);
            if (!el) return;
            const iconWrap = el.querySelector('.phase-icon');

            if (p === phase) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 animate-pulse font-semibold shadow-sm";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-red-100 text-red-500";
            } else if (phases.indexOf(p) < phases.indexOf(phase)) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold shadow-sm";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-emerald-100 text-emerald-500";
                const icon = iconWrap.querySelector('i');
                if (icon) icon.setAttribute('data-lucide', 'check');
            } else {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
            }
        });
        lucide.createIcons();
    }

    async uploadFile(file, dateStr) {
        this.progressContainer.classList.remove('hidden');
        this.statusBox.classList.add('hidden');
        this.dropZone.style.pointerEvents = 'none';
        this.dropZone.classList.add('opacity-50');

        this.setUploadPhase('read');

        const ocrTimer = setTimeout(() => this.setUploadPhase('ocr'), 1200);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('date', dateStr);

        try {
            const data = await api.uploadImage(formData);
            if (data.error) {
                throw new Error(data.message || data.error);
            }
            
            clearTimeout(ocrTimer);

            this.setUploadPhase('parse');
            await new Promise(r => setTimeout(r, 600));

            this.setUploadPhase('save');
            await new Promise(r => setTimeout(r, 600));

            this.statStocks.innerHTML = `${data.stocksCount || 0} <span class="text-xs font-medium text-slate-500">只</span>`;
            this.statSectors.innerHTML = `${data.sectorsCount || 0} <span class="text-xs font-medium text-slate-500">个</span>`;
            this.statUpgrade.textContent = data.summary.upgrade_rate !== null ? `${data.summary.upgrade_rate}%` : '--%';
            this.statBidding.textContent = data.summary.bidding_increase_rate !== null ? `${data.summary.bidding_increase_rate}%` : '--%';
            this.statBroken.textContent = data.summary.limit_broken_rate !== null ? `${data.summary.limit_broken_rate}%` : '--%';

            this.rawMarkdownPre.textContent = data.rawMarkdown || '无原始 Markdown 识别内容';

            this.progressContainer.classList.add('hidden');
            this.statusBox.classList.remove('hidden');

            // 联动重载每日复盘
            await this.app.reloadSummaries();
            document.getElementById('date-select').value = dateStr;

        } catch (err) {
            clearTimeout(ocrTimer);
            console.error(err);
            alert('上传文件处理失败: ' + err.message);
            this.progressContainer.classList.add('hidden');
            this.resetForm();
        } finally {
            this.dropZone.style.pointerEvents = 'auto';
            this.dropZone.classList.remove('opacity-50');
        }
    }

    resetForm() {
        this.fileInput.value = '';
        this.selectedFileInfo.classList.add('hidden');
        this.statusBox.classList.add('hidden');
        this.progressContainer.classList.add('hidden');

        ['read', 'ocr', 'parse', 'save'].forEach(p => {
            const el = document.getElementById('phase-' + p);
            if (el) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                const iconWrap = el.querySelector('.phase-icon');
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
            }
        });

        document.querySelector('#phase-read i').setAttribute('data-lucide', 'file-text');
        document.querySelector('#phase-ocr i').setAttribute('data-lucide', 'cpu');
        document.querySelector('#phase-parse i').setAttribute('data-lucide', 'binary');
        document.querySelector('#phase-save i').setAttribute('data-lucide', 'database');

        lucide.createIcons();
    }
}
```

- [ ] **Step 8: 创建前端总协调主入口 `public/js/app.js`**

写入 `public/js/app.js`：
```javascript
import { api } from './api.js';
import { SearchTab } from './tabs/search.js';
import { ReviewTab } from './tabs/review.js';
import { ActiveTab } from './tabs/active.js';
import { UploadTab } from './tabs/upload.js';

class App {
    constructor() {
        this.currentTab = 'search';
        this.initDOM();
        this.initTabs();
    }

    initDOM() {
        this.buttons = {
            search: document.getElementById('tab-btn-search'),
            review: document.getElementById('tab-btn-review'),
            active: document.getElementById('tab-btn-active'),
            upload: document.getElementById('tab-btn-upload')
        };

        this.contents = {
            search: document.getElementById('tab-content-search'),
            review: document.getElementById('tab-content-review'),
            active: document.getElementById('tab-content-active'),
            upload: document.getElementById('tab-content-upload')
        };

        Object.keys(this.buttons).forEach(tab => {
            this.buttons[tab].addEventListener('click', () => this.switchTab(tab));
        });
    }

    initTabs() {
        this.searchTab = new SearchTab(this);
        this.reviewTab = new ReviewTab(this);
        this.activeTab = new ActiveTab(this);
        this.uploadTab = new UploadTab(this);

        this.reloadSummaries();
    }

    async reloadSummaries() {
        try {
            const summaries = await api.getDailySummaries();
            const select = document.getElementById('date-select');
            select.innerHTML = '';

            if (summaries.length === 0) {
                select.innerHTML = '<option value="">暂无数据</option>';
                return;
            }

            summaries.forEach((item, index) => {
                const opt = document.createElement('option');
                opt.value = item.date;
                opt.textContent = item.date + (index === 0 ? ' (最新)' : '');
                select.appendChild(opt);
            });

            // 自动加载最新日期数据
            const latest = summaries[0].date;
            select.value = latest;
            this.reviewTab.loadDailyDetails(latest);

        } catch (err) {
            console.error(err);
            alert('初始化获取复盘列表失败');
        }
    }

    switchTab(tab) {
        this.currentTab = tab;

        // 重置样式
        Object.keys(this.buttons).forEach(t => {
            this.buttons[t].className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900";
            this.contents[t].classList.add('hidden');
        });

        // 激活样式
        this.buttons[tab].className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
        this.contents[tab].classList.remove('hidden');

        if (tab === 'active' && this.activeTab.rawData.length === 0) {
            this.activeTab.loadActiveSectors("30");
        } else if (tab === 'upload') {
            this.uploadTab.resetForm();
        }

        lucide.createIcons();
    }

    getStatusBadgeStyle(status) {
        if (!status) return 'bg-slate-100 text-slate-600';
        const s = status.trim();
        if (s.includes('首板')) return 'bg-blue-50 text-blue-700 border border-blue-100';
        if (s.includes('二')) return 'bg-rose-50 text-rose-700 border border-rose-100';
        if (s.includes('三') || s.includes('四') || s.includes('五') || s.includes('六') || s.includes('七') || s.includes('高度板')) {
            return 'bg-red-100 text-red-800 border border-red-200 font-bold';
        }
        if (s.includes('T') || s.includes('一字')) return 'bg-amber-50 text-amber-700 border border-amber-100';
        return 'bg-slate-50 text-slate-600 border border-slate-100';
    }

    // 跨 Tab 跳转深度链接函数
    deepLinkStock(stockName) {
        this.switchTab('search');
        this.searchTab.input.value = stockName;
        this.searchTab.activeSectors = [];
        this.searchTab.activeReasons = [];
        this.searchTab.renderSectorTags();
        this.searchTab.renderReasonTags();
        this.searchTab.performSearch();
    }

    deepLinkSector(sectorName) {
        this.switchTab('search');
        this.searchTab.input.value = '';
        this.searchTab.setMatchMode('exact');
        this.searchTab.activeSectors = [sectorName];
        this.searchTab.activeReasons = [];
        this.searchTab.renderSectorTags();
        this.searchTab.renderReasonTags();
        this.searchTab.performSearch();
    }

    deepLinkDate(dateStr) {
        this.switchTab('review');
        document.getElementById('date-select').value = dateStr;
        this.reviewTab.loadDailyDetails(dateStr);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    lucide.createIcons();
});
```

- [ ] **Step 9: 检查前端静态资源放置完毕并进行一次完整 Commit**

```bash
git add public/
git commit -m "feat: complete decoupling and modularizing of modern SPA frontend"
```

---

### Task 7: 清理陈旧文件与最终部署检查 (Cleanup & Run dry-run check)

**Files:**
- Modify: `src/index.ts`
- Delete: `src/renderHtml.ts`
- Delete: `src/indexHtml.ts`

- [ ] **Step 1: 删除不再使用的原单文件渲染大字符串**

Run: `rm src/renderHtml.ts src/indexHtml.ts`
Expected: 原冗余文件已清除

- [ ] **Step 2: 运行整个工程的静态类型与干跑构建检查**

Run: `npm run check`
Expected: Type check success, Dry-run deploy success!

- [ ] **Step 3: Commit**

```bash
git rm src/renderHtml.ts src/indexHtml.ts
git commit -m "chore: remove old legacy template single-file templates and files"
```
