import { StockRepository } from '../repositories/stock.repository';

export class SearchService {
	constructor(private stockRepo: StockRepository) {}

	async search(q: string, sectors: string[], reasons: string[], matchMode: 'exact' | 'fuzzy') {
		return this.stockRepo.searchStocks(q, sectors, reasons, matchMode);
	}
}
