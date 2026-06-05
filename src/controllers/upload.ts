import { Context } from 'hono';
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { UploadService } from '../services/upload.service';

export async function uploadReview(c: Context) {
	if (!c.env.GEMINI_API_KEY) {
		return c.json({ error: "GEMINI_API_KEY is not configured. Please set it in your environment." }, 400);
	}

	try {
		const formData = await c.req.formData();
		const date = formData.get("date") as string;
		const file = (formData.get("file") || formData.get("image")) as File | null;

		if (!date) {
			return c.json({ error: "Missing date parameter" }, 400);
		}
		if (!file) {
			return c.json({ error: "Missing file parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.processUploadPipeline(file, date);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside upload controller:", error);
		return c.json({ error: "Internal Server Error during upload processing", message: error.message }, 500);
	}
}
