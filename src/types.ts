export interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	GEMINI_API_KEY?: string;
	GEMINI_API_BASE?: string;
	GEMINI_MODEL?: string;
}

export interface DailySummary {
	date: string;
	stock_count: number;
	upgrade_rate: number | null;
	limit_broken_rate: number | null;
	bidding_increase_rate: number | null;
}

export interface SectorRow {
	id: number;
	date: string;
	name: string;
	description: string | null;
}

export interface StockRow {
	id: number;
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_id: number | null;
}

export interface SearchRow {
	date: string;
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
	sector_name: string | null;
}

export interface LeaderRow {
	sector_name: string;
	code: string;
	stock_name: string;
	limit_up_count: number;
}

export interface ActiveSectorMetricRow {
	name: string;
	appearances: number;
	total_stocks_count: number;
	latest_date: string;
	description: string | null;
}

export interface StockParsed {
	status: string | null;
	code: string;
	name: string;
	time: string | null;
	concept_reason: string | null;
}

export interface SectorParsed {
	name: string;
	description: string;
	stocks: StockParsed[];
}
