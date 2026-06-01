import { indexHtml } from "./indexHtml";

// Define TypeScript interfaces for our API responses and DB rows
interface Env {
	DB: D1Database;
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

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
