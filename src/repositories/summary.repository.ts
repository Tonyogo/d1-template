import { DailySummary } from '../types';

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
