import { SectorRow } from '../types';

export class SectorRepository {
	constructor(private db: D1Database) {}

	async deleteByDate(date: string): Promise<void> {
		await this.db.prepare("DELETE FROM sectors WHERE date = ?").bind(date).run();
	}

	async getByDate(date: string): Promise<SectorRow[]> {
		const { results } = await this.db.prepare(`
			SELECT id, name, description, date
			FROM sectors
			WHERE date = ?
			ORDER BY id ASC
		`).bind(date).all<SectorRow>();
		return results || [];
	}

	// 提取当天所有板块对应的数据库自增 ID，并建立 板块名 -> ID 词典
	async getSectorIdMap(date: string): Promise<Record<string, number>> {
		const rows = await this.getByDate(date);
		const map: Record<string, number> = {};
		for (const row of rows) {
			map[row.name] = row.id;
		}
		return map;
	}
}
