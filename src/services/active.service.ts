import { StockRepository } from '../repositories/stock.repository';
import { SummaryRepository } from '../repositories/summary.repository';

export class ActiveService {
	constructor(
		private stockRepo: StockRepository,
		private summaryRepo: SummaryRepository
	) {}

	async getActiveSectorsList(daysParam: string) {
		const limitVal = daysParam !== "all" ? (parseInt(daysParam, 10) || 30) : undefined;
		const targetDates = await this.summaryRepo.getLatestDates(limitVal);

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
