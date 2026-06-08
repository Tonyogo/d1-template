import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { GeminiClient } from '../utils/gemini.client';
import { OcrParser } from '../utils/ocr-parser';
import { Env } from '../types';

export class UploadService {
	constructor(
		private summaryRepo: SummaryRepository,
		private sectorRepo: SectorRepository,
		private stockRepo: StockRepository,
		private env: Env,
		private r2Bucket: R2Bucket | null
	) {}

	async processUploadPipeline(file: File, date: string) {
		const mimeType = file.type || "image/png";
		const rawMarkdown = await GeminiClient.callGeminiOCR(file, mimeType, this.env);
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// D1 Database operations
		const db = this.summaryRepo.db;

		const del1 = db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
		const del2 = db.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
		const del3 = db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

		const insSummary = db.prepare(`
			INSERT INTO daily_summary (date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate)
			VALUES (?, ?, ?, ?, ?)
		`).bind(
			date,
			summary.stock_count,
			summary.upgrade_rate,
			summary.limit_broken_rate,
			summary.bidding_increase_rate
		);

		const insSectors = sectorsAndStocks.map(sec =>
			db.prepare(`
				INSERT INTO sectors (date, name, description)
				VALUES (?, ?, ?)
			`).bind(date, sec.name, sec.description || null)
		);

		await db.batch([del1, del2, del3, insSummary, ...insSectors]);

		const sectorIdMap = await this.sectorRepo.getSectorIdMap(date);

		const stockStatements: any[] = [];
		let stocksCount = 0;

		for (const sec of sectorsAndStocks) {
			const sectorId = sectorIdMap[sec.name] || null;
			for (const stock of sec.stocks) {
				stockStatements.push(
					db.prepare(`
						INSERT INTO limit_up_stocks (date, status, code, name, time, concept_reason, sector_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`).bind(
						date,
						stock.status,
						stock.code,
						stock.name,
						stock.time,
						stock.concept_reason,
						sectorId
					)
				);
				stocksCount++;
			}
		}

		if (stockStatements.length > 0) {
			await db.batch(stockStatements);
		}

		if (this.r2Bucket) {
			try {
				const fileExtension = file.name.split('.').pop() || 'png';
				const imageKey = `images/${date}.${fileExtension}`;
				await this.r2Bucket.put(imageKey, file.stream(), {
					httpMetadata: {
						contentType: mimeType,
						cacheControl: "public, max-age=31536000",
					},
					customMetadata: {
						uploadDate: new Date().toISOString(),
						originalName: file.name
					}
				});
			} catch (r2Error: any) {
				console.error("Warning: Failed to save image to R2 inside service:", r2Error);
			}
		}

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount: sectorsAndStocks.length,
			stocksCount,
			rawMarkdown
		};
	}

	async stashPendingImage(file: File, date: string): Promise<{ success: boolean; imageKey: string }> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured for stashing");
		}
		const fileExtension = file.name.split('.').pop() || 'png';
		const pendingKey = `images/pending/${date}.${fileExtension}`;

		await this.r2Bucket.put(pendingKey, file.stream(), {
			httpMetadata: {
				contentType: file.type || "image/png"
			}
		});

		return { success: true, imageKey: pendingKey };
	}

	async processStashedImage(date: string) {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}

		// 1. Find and fetch R2 stashed image
		const extensions = ["png", "jpg", "jpeg", "webp"];
		let pendingObject: any = null;
		let foundExtension = "";

		for (const ext of extensions) {
			const obj = await this.r2Bucket.get(`images/pending/${date}.${ext}`);
			if (obj) {
				pendingObject = obj;
				foundExtension = ext;
				break;
			}
		}

		if (!pendingObject) {
			throw new Error(`No pending image found for date: ${date}`);
		}

		const mimeType = pendingObject.httpMetadata?.contentType || "image/png";
		const tempResponse = new Response(pendingObject.body);
		const imageBlob = await tempResponse.blob();

		// 2. Gemini OCR extraction
		const rawMarkdown = await GeminiClient.callGeminiOCR(imageBlob, mimeType, this.env);
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// 3. Database cascade write transaction
		const db = this.summaryRepo.db;
		const del1 = db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
		const del2 = db.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
		const del3 = db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

		const insSummary = db.prepare(`
			INSERT INTO daily_summary (date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate)
			VALUES (?, ?, ?, ?, ?)
		`).bind(
			date,
			summary.stock_count,
			summary.upgrade_rate,
			summary.limit_broken_rate,
			summary.bidding_increase_rate
		);

		const insSectors = sectorsAndStocks.map(sec =>
			db.prepare(`
				INSERT INTO sectors (date, name, description)
				VALUES (?, ?, ?)
			`).bind(date, sec.name, sec.description || null)
		);

		await db.batch([del1, del2, del3, insSummary, ...insSectors]);

		const sectorIdMap = await this.sectorRepo.getSectorIdMap(date);
		const stockStatements: any[] = [];
		let stocksCount = 0;

		for (const sec of sectorsAndStocks) {
			const sectorId = sectorIdMap[sec.name] || null;
			for (const stock of sec.stocks) {
				stockStatements.push(
					db.prepare(`
						INSERT INTO limit_up_stocks (date, status, code, name, time, concept_reason, sector_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`).bind(
						date,
						stock.status,
						stock.code,
						stock.name,
						stock.time,
						stock.concept_reason,
						sectorId
					)
				);
				stocksCount++;
			}
		}

		if (stockStatements.length > 0) {
			await db.batch(stockStatements);
		}

		// 4. Archive image and delete pending stashed file
		const formalKey = `images/${date}.${foundExtension}`;
		const archiveObject = await this.r2Bucket.get(`images/pending/${date}.${foundExtension}`);
		if (archiveObject) {
			await this.r2Bucket.put(formalKey, archiveObject.body, {
				httpMetadata: {
					contentType: mimeType,
					cacheControl: "public, max-age=31536000",
				},
				customMetadata: {
					uploadDate: new Date().toISOString()
				}
			});
			await this.r2Bucket.delete(`images/pending/${date}.${foundExtension}`);
		}

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount: sectorsAndStocks.length,
			stocksCount,
			rawMarkdown
		};
	}
}
