import { DailySummary, SectorParsed, StockParsed } from '../types';

export class OcrParser {
	/**
	 * Parse markdown text returned by Gemini OCR into DailySummary and SectorParsed structure
	 */
	static parseOcrMarkdown(markdown: string): { summary: DailySummary; sectorsAndStocks: SectorParsed[] } {
		// Clean stars * from the markdown first.
		const cleanMarkdown = markdown.replace(/\*/g, '');

		const STOCK_COUNT_PAT = /(?:涨停个数|涨停个股|涨停数)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*(?:只|个)?/;
		const UPGRADE_PAT = /(?:总晋级率|连板晋级率|晋级率|连晋率|总首板率|首板率|总普涨率|普涨率|总普盈率|普盈率)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const BROKEN_PAT = /(?:总炸板率|炸板率|总体板率|总结板率|总昨板率|总触板率)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const BIDDING_PAT = /(?:总竞价涨幅|竞价涨幅|急昨价涨幅)\s*[:：]\s*([-+]?\d+(?:\.\d+)?)\s*%/;
		const SECTOR_PAT = /^(#{2,3})\s*([^：:\n]+)(?:[:：]\s*(.*))?$/;

		const scMatch = cleanMarkdown.match(STOCK_COUNT_PAT);
		const upMatch = cleanMarkdown.match(UPGRADE_PAT);
		const brMatch = cleanMarkdown.match(BROKEN_PAT);
		const biMatch = cleanMarkdown.match(BIDDING_PAT);

		const summary: DailySummary = {
			date: "", // to be filled by caller
			stock_count: scMatch ? parseInt(scMatch[1], 10) : 0,
			upgrade_rate: upMatch ? parseFloat(upMatch[1]) : null,
			limit_broken_rate: brMatch ? parseFloat(brMatch[1]) : null,
			bidding_increase_rate: biMatch ? parseFloat(biMatch[1]) : null,
		};

		const lines = markdown.split('\n');
		let currentSector: SectorParsed | null = null;
		const sectorsAndStocks: SectorParsed[] = [];

		for (const line of lines) {
			const stripped = line.trim();
			if (!stripped) {
				continue;
			}

			// Check for sector header
			const secMatch = stripped.match(SECTOR_PAT);
			if (secMatch) {
				const name = secMatch[2].trim();
				const desc = secMatch[3] ? secMatch[3].trim() : "";

				// Skip file headers or legend/descriptions
				const skipList = ['一字涨停', 'T字涨停', '复盘', '说明', '同花顺数据可视化', 'A股涨停复盘'];
				if (!skipList.includes(name)) {
					currentSector = {
						name,
						description: desc,
						stocks: []
					};
					sectorsAndStocks.push(currentSector);
				}
				continue;
			}

			// Check for stock table row
			if (stripped.startsWith('|') && stripped.endsWith('|')) {
				const parts = stripped.split('|').slice(1, -1).map(p => p.trim());
				if (parts.length === 5) {
					const code = parts[1];
					if (/^\d{6}$/.test(code)) {
						const stockRow: StockParsed = {
							status: parts[0] || null,
							code,
							name: parts[2],
							time: parts[3] || null,
							concept_reason: parts[4] || null
						};

						if (currentSector) {
							currentSector.stocks.push(stockRow);
						} else {
							currentSector = {
								name: "其他概念",
								description: "",
								stocks: [stockRow]
							};
							sectorsAndStocks.push(currentSector);
						}
					}
				}
			}
		}

		return { summary, sectorsAndStocks };
	}
}
