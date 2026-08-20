import { StockDataService } from '../services/stock-data.js';

/**
 * KlineModalComponent - Manages the K-line chart modal with ECharts candlestick rendering,
 * Moving Averages (MA5, MA10, MA20), volume sub-grid, and interactive timeframe switcher.
 */
export class KlineModalComponent {
    constructor() {
        this.stockDataService = new StockDataService();
        this.currentCode = null;
        this.currentName = null;
        this.currentTimeframe = 60; // Default 60 days
        this.chartInstance = null;
        this.currentData = null;

        this.initDOM();
        this.initEventListeners();
    }

    initDOM() {
        this.modal = document.getElementById('kline-modal');
        this.backdrop = document.getElementById('kline-modal-backdrop');
        this.closeBtn = document.getElementById('kline-modal-close-btn');
        this.retryBtn = document.getElementById('kline-retry-btn');
        this.loader = document.getElementById('kline-loader');
        this.errorOverlay = document.getElementById('kline-error-overlay');
        this.chartContainer = document.getElementById('kline-chart-container');

        // Header and quote elements
        this.stockNameEl = document.getElementById('kline-stock-name');
        this.stockCodeEl = document.getElementById('kline-stock-code');
        this.latestPriceEl = document.getElementById('kline-latest-price');
        this.priceChangeEl = document.getElementById('kline-price-change');
        this.highPriceEl = document.getElementById('kline-high-price');
        this.lowPriceEl = document.getElementById('kline-low-price');
        this.openPriceEl = document.getElementById('kline-open-price');

        // Timeframe buttons (desktop and mobile)
        this.btn30 = document.getElementById('kline-btn-30');
        this.btn60 = document.getElementById('kline-btn-60');
        this.btn120 = document.getElementById('kline-btn-120');
        this.btn30M = document.getElementById('kline-btn-30-m');
        this.btn60M = document.getElementById('kline-btn-60-m');
        this.btn120M = document.getElementById('kline-btn-120-m');
    }

    initEventListeners() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }
        if (this.retryBtn) {
            this.retryBtn.addEventListener('click', () => {
                if (this.currentCode) {
                    this.fetchAndRender(this.currentCode, this.currentName, this.currentTimeframe);
                }
            });
        }

        // Timeframe switcher bindings
        const handleTimeframeChange = (days) => {
            if (this.currentTimeframe === days) return;
            this.currentTimeframe = days;
            this.updateTimeframeButtonsUI();
            if (this.currentCode) {
                this.fetchAndRender(this.currentCode, this.currentName, this.currentTimeframe);
            }
        };

        if (this.btn30) this.btn30.addEventListener('click', () => handleTimeframeChange(30));
        if (this.btn60) this.btn60.addEventListener('click', () => handleTimeframeChange(60));
        if (this.btn120) this.btn120.addEventListener('click', () => handleTimeframeChange(120));

        if (this.btn30M) this.btn30M.addEventListener('click', () => handleTimeframeChange(30));
        if (this.btn60M) this.btn60M.addEventListener('click', () => handleTimeframeChange(60));
        if (this.btn120M) this.btn120M.addEventListener('click', () => handleTimeframeChange(120));

        // ESC key listener
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });

        // Window resize listener to resize ECharts instance
        window.addEventListener('resize', () => {
            if (this.chartInstance && this.modal && !this.modal.classList.contains('hidden')) {
                this.chartInstance.resize();
            }
        });
    }

    updateTimeframeButtonsUI() {
        const days = this.currentTimeframe;
        const setButtonStyle = (btn, isActive) => {
            if (!btn) return;
            if (isActive) {
                btn.className = "px-3 sm:px-4 py-1 text-xs font-semibold rounded-lg bg-white text-slate-900 shadow-sm border border-slate-200/60 transition";
            } else {
                btn.className = "px-3 sm:px-4 py-1 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition";
            }
        };

        setButtonStyle(this.btn30, days === 30);
        setButtonStyle(this.btn60, days === 60);
        setButtonStyle(this.btn120, days === 120);
        setButtonStyle(this.btn30M, days === 30);
        setButtonStyle(this.btn60M, days === 60);
        setButtonStyle(this.btn120M, days === 120);
    }

    async open(code, name) {
        this.currentCode = code;
        this.currentName = name || code;
        this.currentTimeframe = 60; // Reset to default 60 days
        this.updateTimeframeButtonsUI();

        if (this.stockNameEl) this.stockNameEl.textContent = this.currentName;
        if (this.stockCodeEl) this.stockCodeEl.textContent = String(code).trim();

        // Reset indicators
        if (this.latestPriceEl) this.latestPriceEl.textContent = '--';
        if (this.priceChangeEl) {
            this.priceChangeEl.textContent = '--';
            this.priceChangeEl.className = 'font-mono font-semibold px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600';
        }
        if (this.highPriceEl) this.highPriceEl.textContent = '--';
        if (this.lowPriceEl) this.lowPriceEl.textContent = '--';
        if (this.openPriceEl) this.openPriceEl.textContent = '--';

        if (this.modal) {
            this.modal.classList.remove('hidden');
        }
        if (this.errorOverlay) {
            this.errorOverlay.classList.add('hidden');
        }
        if (this.loader) {
            this.loader.classList.remove('hidden');
        }

        await this.fetchAndRender(this.currentCode, this.currentName, this.currentTimeframe);
    }

    async fetchAndRender(code, name, daysCount) {
        if (this.loader) this.loader.classList.remove('hidden');
        if (this.errorOverlay) this.errorOverlay.classList.add('hidden');

        try {
            // Fetch adequate number of data points based on timeframe
            const fetchCount = Math.max(daysCount * 2, 320);
            const data = await this.stockDataService.fetchKlineData(code, fetchCount);
            this.currentData = data;

            // Slice candles to match the requested timeframe (30, 60, or 120 days)
            let candles = data.candles || [];
            if (candles.length > daysCount) {
                candles = candles.slice(candles.length - daysCount);
            }

            if (candles.length === 0) {
                throw new Error('No candle data available for this timeframe');
            }

            // Update header indicators
            const latest = candles[candles.length - 1];
            const prevClose = candles.length >= 2 ? candles[candles.length - 2].close : latest.open;
            const change = parseFloat((latest.close - prevClose).toFixed(2));
            const changePct = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;
            const isRise = change >= 0;

            if (this.latestPriceEl) this.latestPriceEl.textContent = latest.close.toFixed(2);
            if (this.priceChangeEl) {
                const sign = isRise ? '+' : '';
                this.priceChangeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
                if (isRise) {
                    this.priceChangeEl.className = 'font-mono font-semibold px-1.5 py-0.5 rounded text-[11px] bg-rose-50 text-rose-600 border border-rose-200';
                } else {
                    this.priceChangeEl.className = 'font-mono font-semibold px-1.5 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-200';
                }
            }

            if (this.highPriceEl) this.highPriceEl.textContent = latest.high.toFixed(2);
            if (this.lowPriceEl) this.lowPriceEl.textContent = latest.low.toFixed(2);
            if (this.openPriceEl) this.openPriceEl.textContent = latest.open.toFixed(2);

            // Render ECharts Candlestick
            this.renderChart(candles, name);

        } catch (err) {
            console.error('Failed to load stock K-line data:', err);
            if (this.errorOverlay) {
                this.errorOverlay.classList.remove('hidden');
            }
        } finally {
            if (this.loader) {
                this.loader.classList.add('hidden');
            }
        }
    }

    renderChart(candles, stockName) {
        if (!this.chartContainer) return;

        if (!this.chartInstance) {
            this.chartInstance = echarts.init(this.chartContainer);
        }

        const dates = candles.map(item => item.date);
        // ECharts candlestick format: [open, close, lowest, highest]
        const candleValues = candles.map(item => [item.open, item.close, item.low, item.high]);
        const volumes = candles.map((item, index) => {
            // Volume color: Red for rise (close >= open), Green for fall (close < open)
            const isRise = item.close >= item.open;
            return {
                value: item.volume,
                itemStyle: {
                    color: isRise ? '#ef4444' : '#10b981'
                }
            };
        });

        // Use pre-calculated MAs from candles array (calculated over full dataset in StockDataService)
        const ma5 = candles.map(c => c.ma5);
        const ma10 = candles.map(c => c.ma10);
        const ma20 = candles.map(c => c.ma20);

        const isSmallScreen = window.innerWidth < 640;
        const option = {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    crossStyle: { color: '#94a3b8' }
                },
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                textStyle: { color: '#1e293b', fontSize: 11 },
                formatter: (params) => {
                    if (!params || params.length === 0) return '';
                    const dataIndex = params[0].dataIndex;
                    const candle = candles[dataIndex];
                    if (!candle) return '';

                    const isRise = candle.close >= candle.open;
                    const colorClass = isRise ? 'color: #ef4444;' : 'color: #10b981;';
                    const change = candle.close - candle.open;
                    const pct = candle.open > 0 ? ((change / candle.open) * 100).toFixed(2) : '0.00';
                    const sign = change >= 0 ? '+' : '';

                    let html = `<div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px;">${candle.date} - ${stockName}</div>`;
                    html += `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; font-family: monospace; font-size: 11px;">`;
                    html += `<div>开盘: <span style="font-weight: bold;">${candle.open.toFixed(2)}</span></div>`;
                    html += `<div>收盘: <span style="font-weight: bold; ${colorClass}">${candle.close.toFixed(2)}</span></div>`;
                    html += `<div>最高: <span style="font-weight: bold; color: #ef4444;">${candle.high.toFixed(2)}</span></div>`;
                    html += `<div>最低: <span style="font-weight: bold; color: #10b981;">${candle.low.toFixed(2)}</span></div>`;
                    html += `<div>涨跌幅: <span style="font-weight: bold; ${colorClass}">${sign}${pct}%</span></div>`;
                    html += `<div>成交量: <span style="font-weight: bold;">${(candle.volume / 10000).toFixed(2)}万股</span></div>`;
                    html += `</div>`;

                    // MA values
                    html += `<div style="margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 3px; font-family: monospace; font-size: 10px; color: #64748b; display: flex; gap: 8px;">`;
                    if (ma5[dataIndex] !== null) html += `<span style="color: #eab308;">MA5: ${ma5[dataIndex]}</span>`;
                    if (ma10[dataIndex] !== null) html += `<span style="color: #3b82f6;">MA10: ${ma10[dataIndex]}</span>`;
                    if (ma20[dataIndex] !== null) html += `<span style="color: #a855f7;">MA20: ${ma20[dataIndex]}</span>`;
                    html += `</div>`;

                    return html;
                }
            },
            axisPointer: {
                link: [{ xAxisIndex: 'all' }],
                label: { backgroundColor: '#777' }
            },
            grid: [
                {
                    left: isSmallScreen ? '42px' : '50px',
                    right: isSmallScreen ? '12px' : '20px',
                    top: '25px',
                    height: isSmallScreen ? '58%' : '62%'
                },
                {
                    left: isSmallScreen ? '42px' : '50px',
                    right: isSmallScreen ? '12px' : '20px',
                    top: isSmallScreen ? '75%' : '78%',
                    height: isSmallScreen ? '15%' : '16%'
                }
            ],
            xAxis: [
                {
                    type: 'category',
                    data: dates,
                    boundaryGap: true,
                    axisLine: { lineStyle: { color: '#cbd5e1' } },
                    axisLabel: { textStyle: { color: '#64748b', fontSize: 10 }, interval: 'auto' },
                    splitLine: { show: false }
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: dates,
                    boundaryGap: true,
                    axisLine: { lineStyle: { color: '#cbd5e1' } },
                    axisTick: { show: false },
                    axisLabel: { show: false },
                    splitLine: { show: false }
                }
            ],
            yAxis: [
                {
                    scale: true,
                    axisLine: { lineStyle: { color: '#cbd5e1' } },
                    axisSplitLine: { lineStyle: { color: '#f1f5f9' } },
                    axisLabel: { textStyle: { color: '#64748b', fontSize: 10 } },
                    splitLine: { lineStyle: { color: '#f1f5f9' } }
                },
                {
                    scale: true,
                    gridIndex: 1,
                    splitNumber: 2,
                    axisLabel: { show: false },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false }
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100
                },
                {
                    show: !isSmallScreen,
                    xAxisIndex: [0, 1],
                    type: 'slider',
                    top: '95%',
                    height: '16px',
                    borderColor: '#e2e8f0',
                    fillerColor: 'rgba(244, 63, 94, 0.15)',
                    handleStyle: { color: '#f43f5e', borderColor: '#f43f5e' },
                    textStyle: { color: '#64748b', fontSize: 10 }
                }
            ],
            series: [
                {
                    name: 'K线',
                    type: 'candlestick',
                    data: candleValues,
                    itemStyle: {
                        color: '#ef4444',      // Rise color (Red)
                        color0: '#10b981',    // Fall color (Green)
                        borderColor: '#ef4444',
                        borderColor0: '#10b981'
                    }
                },
                {
                    name: 'MA5',
                    type: 'line',
                    data: ma5,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#eab308' } // Yellow
                },
                {
                    name: 'MA10',
                    type: 'line',
                    data: ma10,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#3b82f6' } // Blue
                },
                {
                    name: 'MA20',
                    type: 'line',
                    data: ma20,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#a855f7' } // Purple
                },
                {
                    name: '成交量',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: volumes
                }
            ]
        };

        this.chartInstance.setOption(option, true);
        this.chartInstance.resize();
        setTimeout(() => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
        }, 50);
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
        if (this.chartInstance) {
            this.chartInstance.dispose();
            this.chartInstance = null;
        }
        this.currentCode = null;
        this.currentName = null;
        this.currentData = null;
    }
}
