import { StockRow, SearchRow, ActiveSectorMetricRow, LeaderRow } from '../types';

export class StockRepository {
	constructor(private db: D1Database) {}

	async deleteByDate(date: string): Promise<void> {
		await this.db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date).run();
	}

	async getByDate(date: string): Promise<StockRow[]> {
		const { results } = await this.db.prepare(`
			SELECT id, date, status, code, name, time, concept_reason, sector_id
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
