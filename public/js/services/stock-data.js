/**
 * StockDataService - Handles fetching K-line data from Tencent API and calculating technical indicators (MA)
 */
export class StockDataService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Determine stock prefix based on code prefix
     * 60x / 688x -> sh
     * 00x / 300x / 301x -> sz
     * 8xx / 4xx / 920x -> bj
     */
    getSymbol(code) {
        const cleanCode = String(code).trim();
        if (cleanCode.startsWith('60') || cleanCode.startsWith('688')) {
            return `sh${cleanCode}`;
        }
        if (cleanCode.startsWith('00') || cleanCode.startsWith('300') || cleanCode.startsWith('301')) {
            return `sz${cleanCode}`;
        }
        if (cleanCode.startsWith('8') || cleanCode.startsWith('4') || cleanCode.startsWith('920')) {
            return `bj${cleanCode}`;
        }
        // Default fallback rules
        if (cleanCode.startsWith('5') || cleanCode.startsWith('6') || cleanCode.startsWith('9')) {
            return `sh${cleanCode}`;
        }
        return `sz${cleanCode}`;
    }

    /**
     * Calculate Moving Average (MA) for an array of numbers or objects
     * @param {number} dayCount - MA period (e.g., 5, 10, 20)
     * @param {Array<number|Object>} values - Array of values or objects with a 'close' or numeric property
     * @returns {Array<number|null>} Array of MA values corresponding to input
     */
    calculateMA(dayCount, values) {
        const result = [];
        for (let i = 0; i < values.length; i++) {
            if (i < dayCount - 1) {
                result.push(null);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < dayCount; j++) {
                const val = values[i - j];
                const num = typeof val === 'object' && val !== null ? (val.close !== undefined ? val.close : val.value) : val;
                sum += Number(num) || 0;
            }
            const avg = sum / dayCount;
            result.push(Number(avg.toFixed(2)));
        }
        return result;
    }

    /**
     * Fetch K-line data from Tencent API
     * URL: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,{count},qfq
     * @param {string} code - Stock code (e.g. "000001", "600519")
     * @param {number} count - Number of data points (default 320)
     * @returns {Promise<Object>} Parsed stock data including candles, MAs, and stats
     */
    async fetchKlineData(code, count = 320) {
        const symbol = this.getSymbol(code);
        const cacheKey = `${symbol}_${count}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${count},qfq`;

        try {
            // Using JSONP or standard fetch if CORS permits, or fallback via proxy if needed.
            // Tencent API generally allows direct CORS fetch from browser in most contexts.
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();

            if (!json || json.code !== 0 || !json.data) {
                throw new Error('Invalid response structure from Tencent API');
            }

            const stockDataKey = symbol;
            const stockObj = json.data[stockDataKey];
            if (!stockObj) {
                throw new Error(`Stock data not found for symbol: ${symbol}`);
            }

            // qfqday or day depending on response structure
            const klineKey = stockObj.qfqday ? 'qfqday' : (stockObj.day ? 'day' : null);
            if (!klineKey || !stockObj[klineKey]) {
                throw new Error(`K-line data array not found for symbol: ${symbol}`);
            }

            const rawCandles = stockObj[klineKey];
            const candles = [];
            const dates = [];
            const closes = [];
            const volumes = [];

            for (const item of rawCandles) {
                // Format: [date, open, close, high, low, volume]
                if (Array.isArray(item) && item.length >= 6) {
                    const date = item[0];
                    const open = parseFloat(item[1]);
                    const close = parseFloat(item[2]);
                    const high = parseFloat(item[3]);
                    const low = parseFloat(item[4]);
                    const volume = parseFloat(item[5]);

                    dates.push(date);
                    closes.push(close);
                    volumes.push(volume);
                    candles.push({
                        date,
                        open,
                        close,
                        high,
                        low,
                        volume
                    });
                }
            }

            // Calculate MAs
            const ma5 = this.calculateMA(5, closes);
            const ma10 = this.calculateMA(10, closes);
            const ma20 = this.calculateMA(20, closes);

            // Attach MAs to candles
            for (let i = 0; i < candles.length; i++) {
                candles[i].ma5 = ma5[i];
                candles[i].ma10 = ma10[i];
                candles[i].ma20 = ma20[i];
            }

            // Calculate latest stats (change, changePct)
            let change = 0;
            let changePct = 0;
            let latestPrice = 0;
            let prevClose = 0;

            if (closes.length >= 2) {
                latestPrice = closes[closes.length - 1];
                prevClose = closes[closes.length - 2];
                change = parseFloat((latestPrice - prevClose).toFixed(2));
                changePct = parseFloat(((change / prevClose) * 100).toFixed(2));
            } else if (closes.length === 1) {
                latestPrice = closes[0];
                prevClose = latestPrice;
            }

            const result = {
                code,
                symbol,
                name: stockObj.name || code,
                candles,
                latestPrice,
                prevClose,
                change,
                changePct,
                updatedAt: new Date().toISOString()
            };

            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error(`Failed to fetch kline data for ${code} (${symbol}):`, error);
            throw error;
        }
    }
}
