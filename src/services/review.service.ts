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
