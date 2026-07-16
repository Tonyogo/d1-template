import { DailySummary, SectorParsed } from '../types';
import { SectorRepository } from './sector.repository';

export class SummaryRepository {
	constructor(public db: D1Database) {}

	async getAll(): Promise<DailySummary[]> {
		const { results } = await this.db.prepare(`
			SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
			FROM daily_summary
			ORDER BY date DESC
		`).all<DailySummary>();
		return results || [];
	}

	async getByDate(date: string): Promise<DailySummary | null> {
		return await this.db.prepare(`
			SELECT date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate
			FROM daily_summary
			WHERE date = ?
		`).bind(date).first<DailySummary>() || null;
	}

	async getLatestDates(limit?: number): Promise<string[]> {
		let query = "SELECT date FROM daily_summary ORDER BY date DESC";
		const params: any[] = [];
		if (limit !== undefined) {
			query += " LIMIT ?";
			params.push(limit);
		}
		const { results } = await this.db.prepare(query).bind(...params).all<{ date: string }>();
		return (results || []).map(r => r.date);
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

	/**
	 * Consolidated atomic multi-table transaction to save daily review summary, sectors, and stocks.
	 */
	async saveReviewData(
		date: string,
		summary: Omit<DailySummary, 'date'>,
		sectorsAndStocks: SectorParsed[],
		sectorRepo: SectorRepository
	): Promise<{ sectorsCount: number; stocksCount: number }> {
		// Stage 1: Batch clean old records and write summary & sectors in one batch transaction
		const del1 = this.db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
		const del2 = this.db.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
		const del3 = this.db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

		const insSummary = this.db.prepare(`
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
			this.db.prepare(`
				INSERT OR REPLACE INTO sectors (date, name, description)
				VALUES (?, ?, ?)
			`).bind(date, sec.name, sec.description || null)
		);

		await this.db.batch([del1, del2, del3, insSummary, ...insSectors]);

		// 2. Obtain newly created Sector auto-increment ID mapping
		const sectorIdMap = await sectorRepo.getSectorIdMap(date);
		const stockStatements: any[] = [];
		let stocksCount = 0;

		for (const sec of sectorsAndStocks) {
			const sectorId = sectorIdMap[sec.name] || null;
			for (const stock of sec.stocks) {
				stockStatements.push(
					this.db.prepare(`
						INSERT OR REPLACE INTO limit_up_stocks (date, status, code, name, time, concept_reason, sector_id)
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
			await this.db.batch(stockStatements);
		}

		return {
			sectorsCount: sectorsAndStocks.length,
			stocksCount
		};
	}
}
