import { indexHtml } from "./indexHtml";

declare const Buffer: any;

// Define TypeScript interfaces for our API responses and DB rows
interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	GEMINI_API_KEY?: string;
	GEMINI_API_BASE?: string;
	GEMINI_MODEL?: string;
}

interface DailySummary {
	date: string;
	stock_count: number;
	upgrade_rate: number | null;
	limit_broken_rate: number | null;
	bidding_increase_rate: number | null;
}

interface SectorRow {
	id: number;
	date: string;
	name: string;
	description: string | null;
}

interface StockRow {
	id: number;
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_id: number | null;
}

interface SearchRow {
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_name: string | null;
}

interface LeaderRow {
	sector_name: string;
	code: string;
	stock_name: string;
	limit_up_count: number;
}

interface ActiveSectorMetricRow {
	name: string;
	appearances: number;
	total_stocks_count: number;
	latest_date: string;
	description: string | null;
}

interface StockParsed {
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
}

interface SectorParsed {
	name: string;
	description: string;
	stocks: StockParsed[];
}

export async function callGeminiOCR(imageBlob: Blob, mimeType: string, env: Env): Promise<string> {
	const arrayBuffer = await imageBlob.arrayBuffer();
	const base64String = Buffer.from(arrayBuffer).toString('base64');

	const apiBase = env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
	const model = env.GEMINI_MODEL || 'gemini-flash-latest';
	const apiKey = env.GEMINI_API_KEY;

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

export function parseOcrMarkdown(markdown: string): { summary: DailySummary; sectorsAndStocks: SectorParsed[] } {
	// Clean stars * from the markdown first.
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

	const summary: DailySummary = {
		date: "", // to be filled by caller
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

		// Check for sector header
		const secMatch = stripped.match(SECTOR_PAT);
		if (secMatch) {
			const name = secMatch[2].trim();
			const desc = secMatch[3] ? secMatch[3].trim() : "";

			// Skip file headers or legend/descriptions
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

		// Check for stock table row
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// POST /api/upload
		if (path === "/api/upload" && request.method === "POST") {
			try {
				if (!env.GEMINI_API_KEY) {
					return Response.json({ error: "GEMINI_API_KEY is not configured. Please set it in your environment." }, { status: 400 });
				}

				const formData = await request.formData();
				const date = formData.get("date") as string;
				const file = (formData.get("file") || formData.get("image")) as File | null;

				if (!date) {
					return Response.json({ error: "Missing date parameter" }, { status: 400 });
				}
				if (!file) {
					return Response.json({ error: "Missing file parameter" }, { status: 400 });
				}

				const mimeType = file.type || "image/png";
				const rawMarkdown = await callGeminiOCR(file, mimeType, env);
				const { summary, sectorsAndStocks } = parseOcrMarkdown(rawMarkdown);
				summary.date = date;

				// Database operations
				const del1 = env.DB.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
				const del2 = env.DB.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
				const del3 = env.DB.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

				const insSummary = env.DB.prepare(`
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
					env.DB.prepare(`
						INSERT INTO sectors (date, name, description)
						VALUES (?, ?, ?)
					`).bind(date, sec.name, sec.description || null)
				);

				// Await first batch run
				await env.DB.batch([del1, del2, del3, insSummary, ...insSectors]);

				// Query sectors to map name to ID
				const { results: dbSectors } = await env.DB.prepare(`
					SELECT id, name FROM sectors WHERE date = ?
				`).bind(date).all<{ id: number; name: string }>();

				const sectorIdMap: Record<string, number> = {};
				for (const row of dbSectors || []) {
					sectorIdMap[row.name] = row.id;
				}

				// Construct and execute stock insertion batch
				const stockStatements: any[] = [];
				let stocksCount = 0;

				for (const sec of sectorsAndStocks) {
					const sectorId = sectorIdMap[sec.name] || null;
					for (const stock of sec.stocks) {
						stockStatements.push(
							env.DB.prepare(`
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
					await env.DB.batch(stockStatements);
				}

				// Store the image inside R2 Bucket if it is bound
				if (env.BUCKET) {
					try {
						const fileExtension = file.name.split('.').pop() || 'png';
						const imageKey = `images/${date}.${fileExtension}`;
						await env.BUCKET.put(imageKey, file.stream(), {
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
						console.error("Warning: Failed to save image to R2:", r2Error);
						// We don't fail the entire response if only R2 upload fails
					}
				}

				return Response.json({
					success: true,
					summary,
					sectorsCount: sectorsAndStocks.length,
					stocksCount,
					rawMarkdown
				});
			} catch (error: any) {
				console.error("Error inside POST /api/upload:", error);
				return Response.json({ error: "Internal Server Error during upload processing", message: error.message }, { status: 500 });
			}
		}

		try {
			// 1. Serve frontend SPA index.html
			if (path === "/" || path === "/index.html") {
				return new Response(indexHtml, {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			}

			// 2. GET /api/daily-summaries
			if (path === "/api/daily-summaries") {
				const { results } = await env.DB.prepare(`
					SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
					FROM daily_summary
					ORDER BY date DESC
				`).all<DailySummary>();

				return Response.json(results);
			}

			// 3. GET /api/daily-details/{date}
			const dailyDetailsMatch = path.match(/^\/api\/daily-details\/([^/]+)$/);
			if (dailyDetailsMatch) {
				const date = decodeURIComponent(dailyDetailsMatch[1]);

				// Retrieve summary, sectors, and stocks in parallel using batch queries
				const batchResult = await env.DB.batch([
					env.DB.prepare(`
						SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
						FROM daily_summary
						WHERE date = ?
					`).bind(date),
					env.DB.prepare(`
						SELECT id, name, description
						FROM sectors
						WHERE date = ?
						ORDER BY id ASC
					`).bind(date),
					env.DB.prepare(`
						SELECT id, status, code, name, time, concept_reason, sector_id
						FROM limit_up_stocks
						WHERE date = ?
						ORDER BY id ASC
					`).bind(date)
				]);

				const summaryRows = batchResult[0].results as DailySummary[];
				const sectorRows = batchResult[1].results as SectorRow[];
				const stockRows = batchResult[2].results as StockRow[];

				if (summaryRows.length === 0) {
					return new Response(JSON.stringify({ error: `No data available for date: ${date}` }), {
						status: 404,
						headers: { "Content-Type": "application/json" }
					});
				}

				// Map sectors to dictionary with initialized empty stocks array
				const sectorsDict: Record<number, any> = {};
				for (const sec of sectorRows) {
					sectorsDict[sec.id] = {
						id: sec.id,
						name: sec.name,
						description: sec.description,
						stocks: []
					};
				}

				const otherStocks: StockRow[] = [];

				// Group stocks into their corresponding sectors
				for (const stock of stockRows) {
					const sId = stock.sector_id;
					if (sId !== null && sId in sectorsDict) {
						sectorsDict[sId].stocks.push(stock);
					} else {
						otherStocks.push(stock);
					}
				}

				const finalSectors = Object.values(sectorsDict);

				// Fallback section for any uncategorized stocks
				if (otherStocks.length > 0) {
					finalSectors.push({
						id: -1,
						name: "其他概念",
						description: "未归类板块个股",
						stocks: otherStocks
					});
				}

				return Response.json({
					summary: summaryRows[0],
					sectors: finalSectors
				});
			}

			// 4. GET /api/search
			if (path === "/api/search") {
				const q = url.searchParams.get("q") || "";
				const sectors = url.searchParams.getAll("sectors");
				const conceptReasons = url.searchParams.getAll("concept_reasons");
				const sectorMatchMode = url.searchParams.get("sector_match_mode") || "exact";

				// If all filter conditions are empty, return empty response
				if (!q && sectors.length === 0 && conceptReasons.length === 0) {
					return Response.json([]);
				}

				// If sector or concept reason filters are present, we run a nested query using SQL SUBQUERY
				if (sectors.length > 0 || conceptReasons.length > 0) {
					const havingClauses: string[] = [];
					const params: any[] = [];

					// Build Sector Conditions
					if (sectors.length > 0) {
						const uniqueSectors = Array.from(new Set(sectors));
						if (sectorMatchMode === "fuzzy") {
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

					// Build Concept Reason Conditions (fuzzy)
					if (conceptReasons.length > 0) {
						const uniqueReasons = Array.from(new Set(conceptReasons));
						for (const reason of uniqueReasons) {
							havingClauses.push("SUM(CASE WHEN l.concept_reason LIKE ? THEN 1 ELSE 0 END) > 0");
							params.push(`%${reason}%`);
						}
					}

					// Fetch all matching stock codes with single DB query containing HAVING clauses
					const innerQuery = `
						SELECT l.code
						FROM limit_up_stocks l
						LEFT JOIN sectors s ON l.sector_id = s.id
						GROUP BY l.code
						HAVING ${havingClauses.join(" AND ")}
					`;

					let results: SearchRow[] = [];
					if (q) {
						// Filter matching codes by stock name or stock code keyword (q)
						const outerQuery = `
							SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
							FROM limit_up_stocks l
							LEFT JOIN sectors s ON l.sector_id = s.id
							WHERE l.code IN (${innerQuery}) AND (l.code LIKE ? OR l.name LIKE ?)
							ORDER BY l.date DESC
						`;
						const qParam = `%${q}%`;
						params.push(qParam, qParam);
						const stmt = env.DB.prepare(outerQuery).bind(...params);
						const queryResult = await stmt.all<SearchRow>();
						results = queryResult.results || [];
					} else {
						const outerQuery = `
							SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
							FROM limit_up_stocks l
							LEFT JOIN sectors s ON l.sector_id = s.id
							WHERE l.code IN (${innerQuery})
							ORDER BY l.date DESC
						`;
						const stmt = env.DB.prepare(outerQuery).bind(...params);
						const queryResult = await stmt.all<SearchRow>();
						results = queryResult.results || [];
					}

					return Response.json(results);
				} else {
					// Keyword-only search (q)
					const queryParam = `%${q}%`;
					const { results } = await env.DB.prepare(`
						SELECT l.date, l.status, l.code, l.name, l.time, l.concept_reason, s.name AS sector_name
						FROM limit_up_stocks l
						LEFT JOIN sectors s ON l.sector_id = s.id
						WHERE l.code LIKE ? OR l.name LIKE ?
						ORDER BY l.date DESC
					`).bind(queryParam, queryParam).all<SearchRow>();

					return Response.json(results);
				}
			}

			// 5. GET /api/active-sectors
			if (path === "/api/active-sectors") {
				const daysParam = url.searchParams.get("days") || "30";

				// Get the dates of the latest N trading summaries
				let datesQuery = "SELECT date FROM daily_summary ORDER BY date DESC";
				const datesParams: any[] = [];
				if (daysParam !== "all") {
					const limitVal = parseInt(daysParam, 10) || 30;
					datesQuery += " LIMIT ?";
					datesParams.push(limitVal);
				}

				const { results: dateRows } = await env.DB.prepare(datesQuery).bind(...datesParams).all<{ date: string }>();
				const targetDates = dateRows.map(r => r.date);

				if (targetDates.length === 0) {
					return Response.json([]);
				}

				// Setup parameter placeholders for our IN arrays
				const placeholders = targetDates.map(() => "?").join(", ");

				// Step A: Active sectors and aggregates inside those dates in parallel with top leader stocks
				// D1 batching lets us send these two database reads together
				const batchResult = await env.DB.batch([
					// Subquery 1: Calculate sector appearance metrics
					env.DB.prepare(`
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

					// Subquery 2: Top 3 leading stocks (龙头股) per sector inside the cycle
					env.DB.prepare(`
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

				const sectorMetrics = batchResult[0].results as ActiveSectorMetricRow[];
				const leaderStocks = batchResult[1].results as LeaderRow[];

				// Group leader stocks by sector name
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

				// Synthesize final outputs
				const activeSectorsList = sectorMetrics.map(sec => ({
					name: sec.name,
					description: sec.description,
					appearances: sec.appearances,
					total_stocks_count: sec.total_stocks_count,
					latest_date: sec.latest_date,
					leaders: leadersBySector[sec.name] || []
				}));

				return Response.json(activeSectorsList);
			}

			// 6. GET /api/image?date=YYYY-MM-DD
			if (path === "/api/image" && request.method === "GET") {
				const date = url.searchParams.get("date");
				if (!date) {
					return new Response(JSON.stringify({ error: "Missing date parameter" }), {
						status: 400,
						headers: { "Content-Type": "application/json" }
					});
				}

				if (!env.BUCKET) {
					return new Response(JSON.stringify({ error: "R2 bucket is not configured" }), {
						status: 500,
						headers: { "Content-Type": "application/json" }
					});
				}

				// Attempt to sequentially search the possible image file extensions
				const extensions = ["png", "jpg", "jpeg", "webp"];
				let object: R2ObjectBody | null = null;
				for (const ext of extensions) {
					const tempObj = await env.BUCKET.get(`images/${date}.${ext}`);
					if (tempObj) {
						object = tempObj;
						break;
					}
				}

				if (!object) {
					return new Response(JSON.stringify({ error: "Image Not Found for specified date" }), {
						status: 404,
						headers: { "Content-Type": "application/json" }
					});
				}

				const headers = new Headers();
				object.writeHttpMetadata(headers);
				headers.set("etag", object.httpEtag);
				headers.set("cache-control", "public, max-age=31536000");

				return new Response(object.body, { headers });
			}

			// Fallback: 404 for unmatched endpoints
			return new Response(JSON.stringify({ error: "Endpoint not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});

		} catch (error: any) {
			console.error("Internal Server Error:", error);
			return new Response(JSON.stringify({ error: "Internal Server Error", message: error.message }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
	}
} satisfies ExportedHandler<Env>;
