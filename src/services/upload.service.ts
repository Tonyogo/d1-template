import { SummaryRepository } from '../repositories/summary.repository';
import { SectorRepository } from '../repositories/sector.repository';
import { StockRepository } from '../repositories/stock.repository';
import { GeminiClient } from '../utils/gemini.client';
import { OcrParser } from '../utils/ocr-parser';
import { Env } from '../types';

export class UploadService {
	async deletePendingImage(key: string): Promise<{ success: boolean }> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}
		if (!key.startsWith("images/pending/")) {
			throw new Error("Invalid stashed image key pattern");
		}
		await this.r2Bucket.delete(key);
		return { success: true };
	}
	constructor(
		private summaryRepo: SummaryRepository,
		private sectorRepo: SectorRepository,
		private stockRepo: StockRepository,
		private env: Env,
		private r2Bucket: R2Bucket | null
	) {}

	async stashPendingImage(file: File): Promise<{ success: boolean; imageKey: string }> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured for stashing");
		}
		const timestamp = Date.now();
		// 过滤和清理文件名中的非法字符
		const cleanedName = file.name.replace(/[\/\?<>\\:\*\|"]/g, '_');
		const pendingKey = `images/pending/${timestamp}_${cleanedName}`;

		await this.r2Bucket.put(pendingKey, file.stream(), {
			httpMetadata: {
				contentType: file.type || "image/png"
			}
		});

		return { success: true, imageKey: pendingKey };
	}

	async listPendingImages(): Promise<any[]> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}
		const listed = await this.r2Bucket.list({ prefix: "images/pending/" });
		const results: any[] = [];

		for (const obj of listed.objects) {
			const key = obj.key;
			// 提取真实文件名：去掉 images/pending/${timestamp}_
			const prefixMatch = key.match(/^images\/pending\/\d+_(.+)$/);
			const originalName = prefixMatch ? prefixMatch[1] : key.replace("images/pending/", "");

			// 智能分析建议日期
			const dateMatch = originalName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
			const suggestedDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

			results.push({
				key,
				originalName,
				size: obj.size,
				uploadedAt: obj.uploaded.toISOString(),
				suggestedDate
			});
		}

		// 按时间戳倒序排列（最新上传的优先展示）
		return results.sort((a, b) => b.key.localeCompare(a.key));
	}

	async processStashedImage(key: string, date: string) {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}

		// 1. 获取指定 key 对应的 pending 资源
		if (!key.startsWith("images/pending/")) {
			throw new Error("Invalid stashed image key pattern");
		}
		const pendingObject = await this.r2Bucket.get(key);
		if (!pendingObject) {
			throw new Error(`Stashed pending image not found: ${key}`);
		}

		const mimeType = pendingObject.httpMetadata?.contentType || "image/png";
		const tempResponse = new Response(pendingObject.body);
		const imageBlob = await tempResponse.blob();

		// 2. Gemini OCR 智能多模态提取
		const rawMarkdown = await GeminiClient.callGeminiOCR(imageBlob, mimeType, this.env);
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// 3. 多表级联 D1 批量事务写入
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

		// 4. 将图片重命名移动 to 正式归档目录，并彻底安全删除 images/pending/ 下的原图
		const fileExtension = key.split('.').pop() || 'png';
		const formalKey = `images/${date}.${fileExtension}`;

		// 再次取得 pending 对象的只读 Body 并推送到正式归档
		const archiveObject = await this.r2Bucket.get(key);
		if (archiveObject) {
			await this.r2Bucket.put(formalKey, archiveObject.body, {
				httpMetadata: {
					contentType: mimeType,
					cacheControl: "public, max-age=31536000", // 归档持久化 1 年缓存
				},
				customMetadata: {
					uploadDate: new Date().toISOString()
				}
			});
			// 彻底物理删除 R2 的 pending 区域图片，保障空间整洁
			await this.r2Bucket.delete(key);
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

	async commitParsedMarkdown(key: string, date: string, rawMarkdown: string) {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}

		if (!key.startsWith("images/pending/")) {
			throw new Error("Invalid stashed image key pattern");
		}

		const pendingObject = await this.r2Bucket.get(key);
		if (!pendingObject) {
			throw new Error(`Stashed pending image not found: ${key}`);
		}

		const mimeType = pendingObject.httpMetadata?.contentType || "image/png";

		// 1. OcrParser 智能提取
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// 2. 多表级联 D1 批量事务写入
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

		// 3. 将图片重命名移动到正式归档目录，并彻底安全删除 images/pending/ 下的原图
		const fileExtension = key.split('.').pop() || 'png';
		const formalKey = `images/${date}.${fileExtension}`;

		await this.r2Bucket.put(formalKey, pendingObject.body, {
			httpMetadata: {
				contentType: mimeType,
				cacheControl: "public, max-age=31536000", // 归档持久化 1 年缓存
			},
			customMetadata: {
				uploadDate: new Date().toISOString()
			}
		});

		// 彻底物理删除 R2 的 pending 区域图片，保障空间整洁
		await this.r2Bucket.delete(key);

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
