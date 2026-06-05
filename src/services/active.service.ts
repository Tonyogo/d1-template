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
