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

			// 智能 analysis 建议日期
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

		// 3. 多表级联 D1 批量事务写入 (Delegated to SummaryRepository)
		const { sectorsCount, stocksCount } = await this.summaryRepo.saveReviewData(
			date,
			summary,
			sectorsAndStocks,
			this.sectorRepo
		);

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

		// 5. 永久物理备份 Markdown 原始文本，方便日后随时纠错与重新 D1 入库
		const mdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(mdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount,
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

		// 2. 多表级联 D1 批量事务写入 (Delegated to SummaryRepository)
		const { sectorsCount, stocksCount } = await this.summaryRepo.saveReviewData(
			date,
			summary,
			sectorsAndStocks,
			this.sectorRepo
		);

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

		// 4. 永久物理备份 Markdown 原始文本，方便日后随时纠错与重新 D1 入库
		const backupMdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(backupMdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount,
			stocksCount,
			rawMarkdown
		};
	}

	async getMarkdownByDate(date: string): Promise<string> {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}
		const mdKey = `markdowns/${date}.md`;
		const mdObject = await this.r2Bucket.get(mdKey);
		if (!mdObject) {
			throw new Error(`未找到该日期对应的 Markdown 备份文件，无法执行纠错修改。`);
		}
		return await mdObject.text();
	}

	async commitMarkdownUpdate(date: string, rawMarkdown: string) {
		if (!this.r2Bucket) {
			throw new Error("R2 bucket is not configured");
		}

		// 1. 调用 OcrParser 再次对最新手动修改的文本进行解析与清洗
		const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

		// 2. 多表级联 D1 批量事务写入 (Delegated to SummaryRepository)
		const { sectorsCount, stocksCount } = await this.summaryRepo.saveReviewData(
			date,
			summary,
			sectorsAndStocks,
			this.sectorRepo
		);

		// 3. 覆盖 R2 中的 Markdown 备份
		const mdKey = `markdowns/${date}.md`;
		await this.r2Bucket.put(mdKey, rawMarkdown, {
			httpMetadata: {
				contentType: "text/markdown; charset=utf-8"
			}
		});

		return {
			success: true,
			summary: {
				...summary,
				date
			},
			sectorsCount,
			stocksCount
		};
	}
}
