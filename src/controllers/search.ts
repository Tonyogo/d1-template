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
