import { Context } from 'hono';
import { StockRepository } from '../repositories/stock.repository';
import { ActiveService } from '../services/active.service';

export async function getActiveSectors(c: Context) {
	const daysParam = c.req.query('days') || '30';
	const activeService = new ActiveService(new StockRepository(c.env.DB));

	try {
		const results = await activeService.getActiveSectorsList(daysParam);
		return c.json(results);
	} catch (error: any) {
		return c.json({ error: "Active sectors analysis failed", message: error.message }, 500);
	}
}
