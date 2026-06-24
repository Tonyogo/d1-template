import { Context } from 'hono';
import { StockRepository } from '../repositories/stock.repository';
import { SummaryRepository } from '../repositories/summary.repository';
import { ActiveService } from '../services/active.service';

export async function getActiveSectors(c: Context) {
	const daysParam = c.req.query('days') || '30';
	const db = c.env.DB;
	const activeService = new ActiveService(
		new StockRepository(db),
		new SummaryRepository(db)
	);

	try {
		const results = await activeService.getActiveSectorsList(daysParam);
		return c.json(results);
	} catch (error: any) {
		return c.json({ error: "Active sectors analysis failed", message: error.message }, 500);
	}
}
