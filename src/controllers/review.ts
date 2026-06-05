import { Context } from 'hono';
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { ReviewService } from '../services/review.service';

export async function getSummaries(c: Context) {
	const summaryRepo = new SummaryRepository(c.env.DB);
	try {
		const summaries = await summaryRepo.getAll();
		return c.json(summaries);
	} catch (error: any) {
		return c.json({ error: "Failed to load summaries", message: error.message }, 500);
	}
}

export async function getDetails(c: Context) {
	const dateParam = c.req.param('date');
	if (!dateParam) {
		return c.json({ error: "Missing date parameter" }, 400);
	}
	const date = decodeURIComponent(dateParam);
	const db = c.env.DB;
	const reviewService = new ReviewService(
		new SummaryRepository(db),
		new SectorRepository(db),
		new StockRepository(db)
	);

	try {
		const data = await reviewService.getReviewDetails(date);
		if (!data) {
			return c.json({ error: `No data available for date: ${date}` }, 404);
		}
		return c.json(data);
	} catch (error: any) {
		return c.json({ error: "Failed to load daily details", message: error.message }, 500);
	}
}
