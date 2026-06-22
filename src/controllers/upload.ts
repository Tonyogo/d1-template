import { Context } from 'hono';
import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { UploadService } from '../services/upload.service';

export async function batchUpload(c: Context) {
	try {
		const formData = await c.req.formData();
		const file = (formData.get("file") || formData.get("image")) as File | null;

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

		const result = await uploadService.stashPendingImage(file);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside batchUpload controller:", error);
		return c.json({ error: "Internal Server Error during batch upload", message: error.message }, 500);
	}
}

export async function listPendingImages(c: Context) {
	if (!c.env.BUCKET) {
		return c.json({ error: "R2 bucket is not configured" }, 500);
	}
	try {
		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET
		);
		const list = await uploadService.listPendingImages();
		return c.json(list);
	} catch (error: any) {
		console.error("Error inside listPendingImages controller:", error);
		return c.json({ error: "Internal Server Error listing pending images", message: error.message }, 500);
	}
}

export async function deletePendingImage(c: Context) {
	try {
		const body = await c.req.json();
		const key = body?.key as string;

		if (!key) {
			return c.json({ error: "Missing key parameter" }, 400);
		}

		if (!key.startsWith("images/pending/")) {
			return c.json({ error: "Invalid stashed image key pattern" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.deletePendingImage(key);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside deletePendingImage controller:", error);
		return c.json({ error: "Internal Server Error during pending image deletion", message: error.message }, 500);
	}
}

export async function batchProcess(c: Context) {
	if (!c.env.GEMINI_API_KEY) {
		return c.json({ error: "GEMINI_API_KEY is not configured. Please set it in your environment." }, 400);
	}

	try {
		const body = await c.req.json();
		const key = body?.key as string;
		const date = body?.date as string;

		if (!key) {
			return c.json({ error: "Missing R2 pending file key" }, 400);
		}
		if (!date) {
			return c.json({ error: "Missing target date parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.processStashedImage(key, date);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside batchProcess controller:", error);
		return c.json({ error: "Internal Server Error during batch processing", message: error.message }, 500);
	}
}

export async function commitParsed(c: Context) {
	try {
		const body = await c.req.json();
		const key = body?.key as string;
		const date = body?.date as string;
		const rawMarkdown = body?.rawMarkdown as string;

		if (!key) {
			return c.json({ error: "Missing R2 pending file key" }, 400);
		}
		if (!date) {
			return c.json({ error: "Missing target date parameter" }, 400);
		}
		if (!rawMarkdown) {
			return c.json({ error: "Missing rawMarkdown parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.commitParsedMarkdown(key, date, rawMarkdown);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside commitParsed controller:", error);
		return c.json({ error: "Internal Server Error during parsing commit", message: error.message }, 500);
	}
}

export async function getMarkdown(c: Context) {
	const date = c.req.query('date');
	if (!date) {
		return c.json({ error: "Missing date parameter" }, 400);
	}

	try {
		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const markdown = await uploadService.getMarkdownByDate(date);
		return c.json({ success: true, markdown });
	} catch (error: any) {
		console.error("Error inside getMarkdown controller:", error);
		return c.json({ error: "Internal Server Error during markdown retrieval", message: error.message }, 500);
	}
}

export async function commitMarkdownUpdate(c: Context) {
	try {
		const body = await c.req.json();
		const date = body?.date as string;
		const rawMarkdown = body?.rawMarkdown as string;

		if (!date) {
			return c.json({ error: "Missing date parameter" }, 400);
		}
		if (!rawMarkdown) {
			return c.json({ error: "Missing rawMarkdown parameter" }, 400);
		}

		const db = c.env.DB;
		const uploadService = new UploadService(
			new SummaryRepository(db),
			new SectorRepository(db),
			new StockRepository(db),
			c.env,
			c.env.BUCKET || null
		);

		const result = await uploadService.commitMarkdownUpdate(date, rawMarkdown);
		return c.json(result);
	} catch (error: any) {
		console.error("Error inside commitMarkdownUpdate controller:", error);
		return c.json({ error: "Internal Server Error during markdown commit", message: error.message }, 500);
	}
}
