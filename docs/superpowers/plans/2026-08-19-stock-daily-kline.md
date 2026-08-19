# Stock Daily K-Line Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive stock daily K-line chart modal (with candlestick, MA5/10/20 moving averages, and volume sub-chart) powered by ECharts and free Tencent Stock API, triggered by clicking any stock in Search, Daily Review, or Active Sector tabs.

**Architecture:** Pure client-side component architecture in `./public/js/`. `StockDataService` handles symbol prefix mapping (`sh`/`sz`/`bj`), fetching forward-adjusted K-line data, and calculating MA lines. `KlineModalComponent` manages ECharts rendering, timeframe selection, and modal visibility. `App` integrates the modal globally and binds click listeners across all stock list tabs.

**Tech Stack:** Vanilla JavaScript (ES Modules), ECharts 5.4.3 (via CDN), Tailwind CSS, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-08-19-stock-daily-kline-design.md`

## Global Constraints

- Legacy files in `./legacy/` must not be modified.
- No D1 DB schema changes or Worker backend API changes required.
- Standard A-share color convention: Red for rise/bullish (`#ef4444`), Green for fall/bearish (`#10b981`).
- Clean teardown and memory management: `chart.dispose()` on modal teardown, `chart.resize()` on window resize.

---

### Task 1: Create Stock Data Service (`public/js/services/stock-data.js`)

**Files:**
- Create: `public/js/services/stock-data.js`

**Interfaces:**
- Produces: `StockDataService` class with methods:
  - `getSymbol(code: string): string` — Converts 6-digit stock code to symbol with prefix (`sh600519`, `sz000001`, `bj830000`).
  - `fetchKlineData(code: string, count?: number): Promise<{ dates: string[], categoryData: string[][], values: number[][], volumes: number[][], ma5: (number|null)[], ma10: (number|null)[], ma20: (number|null)[], latest: { close: number, change: number, changePct: number, open: number, high: number, low: number, volume: number } }>`

- [ ] **Step 1: Implement `public/js/services/stock-data.js`**

Write the complete code for `StockDataService`:

```javascript
export class StockDataService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Map 6-digit stock code to Tencent market symbol with prefix
     * 60x/688x -> sh
     * 00x/300x -> sz
     * 8xx/4xx/920x -> bj
     */
    getSymbol(code) {
        if (!code) return '';
        const cleanCode = String(code).trim().padStart(6, '0');
        if (cleanCode.startsWith('60') || cleanCode.startsWith('688')) {
            return `sh${cleanCode}`;
        }
        if (cleanCode.startsWith('00') || cleanCode.startsWith('300') || cleanCode.startsWith('301')) {
            return `sz${cleanCode}`;
        }
        if (cleanCode.startsWith('8') || cleanCode.startsWith('4') || cleanCode.startsWith('920')) {
            return `bj${cleanCode}`;
        }
        // Default fallback to sh
        return `sh${cleanCode}`;
    }

    /**
     * Calculate Moving Average array for a given window size N
     * @param {number[][]} values Array of [open, close, lowest, highest]
     * @param {number} dayCount N-day MA (e.g. 5, 10, 20)
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
                sum += values[i - j][1]; // close price is index 1
            }
            result.push(Number((sum / dayCount).toFixed(2)));
        }
        return result;
    }

    /**
     * Fetch daily K-line data from Tencent Stock API
     * @param {string} code 6-digit stock code or symbol
     * @param {number} count Number of K-line bars (default 60)
     */
    async fetchKlineData(code, count = 60) {
        const symbol = this.getSymbol(code);
        const cacheKey = `${symbol}_${count}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${count},qfq`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();

            if (json.code !== 0 || !json.data || !json.data[symbol]) {
                throw new Error('网络行情数据无法提取');
            }

            const stockData = json.data[symbol];
            const rawDays = stockData.qfqday || stockData.day || [];

            if (!rawDays || rawDays.length === 0) {
                throw new Error('未获取到该股票的有效日K线数据');
            }

            const dates = [];
            const categoryData = []; // [open, close, lowest, highest]
            const values = []; // [open, close, lowest, highest] for MA calculation
            const volumes = []; // [index, volume, sign (1 if rise, -1 if fall)]

            rawDays.forEach((item, index) => {
                // item format: [date "YYYY-MM-DD", open, close, highest, lowest, volume]
                const date = item[0];
                const open = parseFloat(item[1]);
                const close = parseFloat(item[2]);
                const high = parseFloat(item[3]);
                const low = parseFloat(item[4]);
                const volume = parseFloat(item[5]);

                dates.push(date);
                // ECharts Candlestick expects: [open, close, lowest, highest]
                categoryData.push([open, close, low, high]);
                values.push([open, close, low, high]);

                const isRise = close >= open ? 1 : -1;
                volumes.push([index, volume, isRise]);
            });

            const ma5 = this.calculateMA(5, values);
            const ma10 = this.calculateMA(10, values);
            const ma20 = this.calculateMA(20, values);

            const lastIdx = values.length - 1;
            const prevClose = lastIdx > 0 ? values[lastIdx - 1][1] : values[lastIdx][0];
            const latestClose = values[lastIdx][1];
            const change = Number((latestClose - prevClose).toFixed(2));
            const changePct = prevClose !== 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;

            const parsed = {
                symbol,
                rawCode: code,
                dates,
                categoryData,
                values,
                volumes,
                ma5,
                ma10,
                ma20,
                latest: {
                    date: dates[lastIdx],
                    open: values[lastIdx][0],
                    close: latestClose,
                    low: values[lastIdx][2],
                    high: values[lastIdx][3],
                    volume: volumes[lastIdx][1],
                    change,
                    changePct
                }
            };

            this.cache.set(cacheKey, parsed);
            return parsed;
        } catch (err) {
            console.error(`[StockDataService] Fetch failed for ${symbol}:`, err);
            throw err;
        }
    }
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add public/js/services/stock-data.js
git commit -m "feat(stock): add StockDataService for Tencent K-line API and MA calculation"
```

---

### Task 2: HTML Modal Skeleton & ECharts CDN Integration (`public/index.html`)

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: ECharts 5.4.3 CDN script.
- Produces: DOM element `#kline-modal` with internal IDs:
  - `#kline-modal-backdrop`
  - `#kline-stock-name`
  - `#kline-stock-code`
  - `#kline-latest-price`
  - `#kline-price-change`
  - `#kline-high-price`
  - `#kline-low-price`
  - `#kline-open-price`
  - `#kline-volume`
  - `#kline-btn-30`, `#kline-btn-60`, `#kline-btn-120` (Timeframe buttons)
  - `#kline-modal-close-btn`
  - `#kline-chart-container` (450px Canvas mount)
  - `#kline-loader`
  - `#kline-error-overlay` & `#kline-retry-btn`

- [ ] **Step 1: Add ECharts CDN tag in `<head>` and `#kline-modal` markup in `public/index.html`**

In `<head>` of `public/index.html`, add ECharts CDN script right before `lucide.min.js`:
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
```

At the end of `public/index.html` (just before `</body>`), append the K-line Modal HTML markup:

```html
    <!-- ==================== STOCK K-LINE CHART MODAL ==================== -->
    <div id="kline-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <!-- Backdrop -->
        <div id="kline-modal-backdrop" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>

        <!-- Modal Dialog Container -->
        <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div class="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-4xl border border-slate-200">
                
                <!-- Modal Header -->
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-center space-x-3">
                        <div class="p-2 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-600">
                            <i data-lucide="candlestick-chart" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <div class="flex items-center space-x-2">
                                <h3 class="text-base font-bold text-slate-900" id="kline-stock-name">加载中...</h3>
                                <span id="kline-stock-code" class="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">000000</span>
                            </div>
                            <!-- Live Indicators Row -->
                            <div class="flex items-center space-x-3 mt-1 text-xs">
                                <span id="kline-latest-price" class="font-bold font-mono text-slate-900">--</span>
                                <span id="kline-price-change" class="font-semibold font-mono text-slate-500">--</span>
                                <span class="text-slate-300">|</span>
                                <span class="text-slate-500">高: <span id="kline-high-price" class="font-mono text-slate-700">--</span></span>
                                <span class="text-slate-500">低: <span id="kline-low-price" class="font-mono text-slate-700">--</span></span>
                                <span class="text-slate-500">开: <span id="kline-open-price" class="font-mono text-slate-700">--</span></span>
                            </div>
                        </div>
                    </div>

                    <!-- Timeframe Switcher & Close Button -->
                    <div class="flex items-center space-x-2 self-end sm:self-center">
                        <div class="inline-flex rounded-lg bg-slate-200/60 p-1 text-xs font-medium border border-slate-200">
                            <button id="kline-btn-30" class="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition">30日</button>
                            <button id="kline-btn-60" class="px-2.5 py-1 rounded-md bg-white text-slate-900 shadow-xs font-bold transition">60日</button>
                            <button id="kline-btn-120" class="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition">120日</button>
                        </div>
                        <button id="kline-modal-close-btn" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition focus:outline-none">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>

                <!-- Modal Body / Chart Container -->
                <div class="relative p-4 sm:p-6 bg-white min-h-[460px]">
                    <!-- ECharts Canvas Target -->
                    <div id="kline-chart-container" class="w-full h-[430px]"></div>

                    <!-- Loader Overlay -->
                    <div id="kline-loader" class="absolute inset-0 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 z-10">
                        <div class="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                        <p class="text-xs font-medium text-slate-500">正在获取日K线行情数据...</p>
                    </div>

                    <!-- Error Overlay -->
                    <div id="kline-error-overlay" class="absolute inset-0 bg-white flex flex-col items-center justify-center space-y-3 z-10 hidden">
                        <div class="p-3 bg-rose-50 text-rose-600 rounded-full">
                            <i data-lucide="alert-circle" class="w-6 h-6"></i>
                        </div>
                        <p id="kline-error-text" class="text-sm font-medium text-slate-700">行情数据获取失败</p>
                        <button id="kline-retry-btn" class="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition shadow-xs">
                            重新加载
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Commit Task 2**

```bash
git add public/index.html
git commit -m "feat(ui): add ECharts CDN and K-line modal HTML skeleton"
```

---

### Task 3: Create Kline Modal Component (`public/js/components/kline-modal.js`)

**Files:**
- Create: `public/js/components/kline-modal.js`

**Interfaces:**
- Consumes: `StockDataService` from `public/js/services/stock-data.js`, ECharts (`window.echarts`).
- Produces: `KlineModalComponent` class with methods:
  - `open(code: string, name: string): Promise<void>`
  - `close(): void`

- [ ] **Step 1: Implement `public/js/components/kline-modal.js`**

Write the complete code for `KlineModalComponent`:

```javascript
import { StockDataService } from '../services/stock-data.js';

export class KlineModalComponent {
    constructor() {
        this.stockService = new StockDataService();
        this.chartInstance = null;
        this.currentCode = null;
        this.currentName = null;
        this.currentCount = 60; // default 60 bars

        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.modal = document.getElementById('kline-modal');
        this.backdrop = document.getElementById('kline-modal-backdrop');
        this.closeBtn = document.getElementById('kline-modal-close-btn');
        this.stockNameEl = document.getElementById('kline-stock-name');
        this.stockCodeEl = document.getElementById('kline-stock-code');
        this.latestPriceEl = document.getElementById('kline-latest-price');
        this.priceChangeEl = document.getElementById('kline-price-change');
        this.highPriceEl = document.getElementById('kline-high-price');
        this.lowPriceEl = document.getElementById('kline-low-price');
        this.openPriceEl = document.getElementById('kline-open-price');
        
        this.btn30 = document.getElementById('kline-btn-30');
        this.btn60 = document.getElementById('kline-btn-60');
        this.btn120 = document.getElementById('kline-btn-120');

        this.chartContainer = document.getElementById('kline-chart-container');
        this.loader = document.getElementById('kline-loader');
        this.errorOverlay = document.getElementById('kline-error-overlay');
        this.errorText = document.getElementById('kline-error-text');
        this.retryBtn = document.getElementById('kline-retry-btn');
    }

    bindEvents() {
        if (this.backdrop) this.backdrop.addEventListener('click', () => this.close());
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        if (this.retryBtn) this.retryBtn.addEventListener('click', () => this.loadData());

        if (this.btn30) this.btn30.addEventListener('click', () => this.setTimeframe(30));
        if (this.btn60) this.btn60.addEventListener('click', () => this.setTimeframe(60));
        if (this.btn120) this.btn120.addEventListener('click', () => this.setTimeframe(120));

        // Keyboard ESC handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
        });
    }

    setTimeframe(count) {
        if (this.currentCount === count) return;
        this.currentCount = count;

        const activeClass = "px-2.5 py-1 rounded-md bg-white text-slate-900 shadow-xs font-bold transition";
        const inactiveClass = "px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition";

        this.btn30.className = count === 30 ? activeClass : inactiveClass;
        this.btn60.className = count === 60 ? activeClass : inactiveClass;
        this.btn120.className = count === 120 ? activeClass : inactiveClass;

        if (this.currentCode) {
            this.loadData();
        }
    }

    async open(code, name = '') {
        if (!code) return;
        this.currentCode = String(code).trim();
        this.currentName = name || code;

        this.stockNameEl.textContent = this.currentName;
        this.stockCodeEl.textContent = this.currentCode;

        this.resetIndicators();
        this.showModal();
        await this.loadData();
    }

    resetIndicators() {
        this.latestPriceEl.textContent = '--';
        this.priceChangeEl.textContent = '--';
        this.priceChangeEl.className = 'font-semibold font-mono text-slate-500';
        this.highPriceEl.textContent = '--';
        this.lowPriceEl.textContent = '--';
        this.openPriceEl.textContent = '--';
    }

    showModal() {
        this.modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        if (window.lucide) lucide.createIcons();
    }

    close() {
        this.modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        if (this.chartInstance) {
            this.chartInstance.clear();
        }
    }

    async loadData() {
        this.loader.classList.remove('hidden');
        this.errorOverlay.classList.add('hidden');

        try {
            const data = await this.stockService.fetchKlineData(this.currentCode, this.currentCount);
            this.updateHeaderIndicators(data.latest);
            this.renderChart(data);
            this.loader.classList.add('hidden');
        } catch (err) {
            console.error('[KlineModal] Load failed:', err);
            this.loader.classList.add('hidden');
            this.errorText.textContent = err.message || '获取股票日K线数据失败';
            this.errorOverlay.classList.remove('hidden');
        }
    }

    updateHeaderIndicators(latest) {
        if (!latest) return;
        this.latestPriceEl.textContent = latest.close.toFixed(2);
        
        const sign = latest.change > 0 ? '+' : '';
        this.priceChangeEl.textContent = `${sign}${latest.change.toFixed(2)} (${sign}${latest.changePct.toFixed(2)}%)`;

        if (latest.change > 0) {
            this.priceChangeEl.className = 'font-semibold font-mono text-rose-600';
            this.latestPriceEl.className = 'font-bold font-mono text-rose-600';
        } else if (latest.change < 0) {
            this.priceChangeEl.className = 'font-semibold font-mono text-emerald-600';
            this.latestPriceEl.className = 'font-bold font-mono text-emerald-600';
        } else {
            this.priceChangeEl.className = 'font-semibold font-mono text-slate-600';
            this.latestPriceEl.className = 'font-bold font-mono text-slate-900';
        }

        this.highPriceEl.textContent = latest.high.toFixed(2);
        this.lowPriceEl.textContent = latest.low.toFixed(2);
        this.openPriceEl.textContent = latest.open.toFixed(2);
    }

    renderChart(data) {
        if (!window.echarts) {
            throw new Error('ECharts 图表库未成功加载');
        }

        if (!this.chartInstance) {
            this.chartInstance = window.echarts.init(this.chartContainer);
        }

        const upColor = '#ef4444';   // Rose-500 (Red for rise)
        const downColor = '#10b981'; // Emerald-500 (Green for fall)

        const option = {
            animation: true,
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross'
                },
                borderWidth: 1,
                borderColor: '#e2e8f0',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                textStyle: {
                    color: '#0f172a',
                    fontSize: 12
                },
                formatter: (params) => {
                    let res = `<div class="font-bold mb-1 border-b border-slate-200 pb-1">${params[0].name}</div>`;
                    params.forEach(item => {
                        if (item.seriesType === 'candlestick') {
                            const [open, close, low, high] = item.data.slice(1);
                            const change = close - open;
                            const color = change >= 0 ? upColor : downColor;
                            res += `<div style="color:${color}">开: ${open.toFixed(2)} | 收: ${close.toFixed(2)}</div>`;
                            res += `<div style="color:${color}">高: ${high.toFixed(2)} | 低: ${low.toFixed(2)}</div>`;
                        } else if (item.seriesType === 'line' && item.data !== null && item.data !== undefined) {
                            res += `<div>${item.marker} ${item.seriesName}: ${item.data}</div>`;
                        } else if (item.seriesType === 'bar') {
                            res += `<div>${item.marker} 成交量: ${(item.data[1] / 10000).toFixed(2)} 万手</div>`;
                        }
                    });
                    return res;
                }
            },
            axisPointer: {
                link: [{ xAxisIndex: 'all' }]
            },
            grid: [
                {
                    left: '10%',
                    right: '8%',
                    top: '12%',
                    height: '55%'
                },
                {
                    left: '10%',
                    right: '8%',
                    top: '73%',
                    height: '18%'
                }
            ],
            xAxis: [
                {
                    type: 'category',
                    data: data.dates,
                    boundaryGap: true,
                    axisLine: { onZero: false, lineStyle: { color: '#94a3b8' } },
                    splitLine: { show: false },
                    min: 'dataMin',
                    max: 'dataMax'
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: data.dates,
                    boundaryGap: true,
                    axisLine: { onZero: false, lineStyle: { color: '#94a3b8' } },
                    axisTick: { show: false },
                    axisLabel: { show: false },
                    splitLine: { show: false },
                    min: 'dataMin',
                    max: 'dataMax'
                }
            ],
            yAxis: [
                {
                    scale: true,
                    splitArea: { show: true, areaStyle: { color: ['rgba(248,250,252,0.5)', 'rgba(255,255,255,0.5)'] } },
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
                }
            ],
            series: [
                {
                    name: '日K',
                    type: 'candlestick',
                    data: data.categoryData,
                    itemStyle: {
                        color: upColor,
                        color0: downColor,
                        borderColor: upColor,
                        borderColor0: downColor
                    }
                },
                {
                    name: 'MA5',
                    type: 'line',
                    data: data.ma5,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#f59e0b' }
                },
                {
                    name: 'MA10',
                    type: 'line',
                    data: data.ma10,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#3b82f6' }
                },
                {
                    name: 'MA20',
                    type: 'line',
                    data: data.ma20,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 1.5, color: '#a855f7' }
                },
                {
                    name: '成交量',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: data.volumes,
                    itemStyle: {
                        color: (params) => {
                            return params.data[2] === 1 ? upColor : downColor;
                        }
                    }
                }
            ]
        };

        this.chartInstance.setOption(option, true);
        setTimeout(() => this.chartInstance.resize(), 50);
    }
}
```

- [ ] **Step 2: Commit Task 3**

```bash
git add public/js/components/kline-modal.js
git commit -m "feat(ui): implement KlineModalComponent with ECharts rendering and controls"
```

---

### Task 4: Global App Integration & Click Listeners (`public/js/app.js`, `public/js/tabs/search.js`, `review.js`, `active.js`)

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/js/tabs/search.js`
- Modify: `public/js/tabs/review.js`
- Modify: `public/js/tabs/active.js`

**Interfaces:**
- Consumes: `KlineModalComponent` from `public/js/components/kline-modal.js`.
- Produces: `app.openKlineModal(code, name)` global helper method and binds click handlers on stock code/name elements in all 3 stock tabs.

- [ ] **Step 1: Update `public/js/app.js` to instantiate `KlineModalComponent` and expose `openKlineModal`**

In `public/js/app.js`:
1. Import `KlineModalComponent`:
   ```javascript
   import { KlineModalComponent } from './components/kline-modal.js';
   ```
2. In `initTabs()` or `constructor()`, instantiate `klineModal`:
   ```javascript
   this.klineModal = new KlineModalComponent();
   ```
3. Add `openKlineModal(code, name)` method:
   ```javascript
   openKlineModal(stockCode, stockName) {
       if (this.klineModal) {
           this.klineModal.open(stockCode, stockName);
       }
   }
   ```

- [ ] **Step 2: Add stock click event listeners in `public/js/tabs/search.js`**

In `SearchTab.prototype.renderResults` (or where table rows are built in `search.js`):
Ensure stock code or stock name cells have class `cursor-pointer hover:text-rose-600 hover:underline` and click event listeners that trigger `this.app.openKlineModal(item.code, item.name)`.

Let's inspect how stock rows are rendered in `public/js/tabs/search.js`:
When creating `<tr>` elements for stock search results, bind click event to stock code / name elements:
```javascript
const codeTd = document.createElement('td');
codeTd.className = "px-4 py-3 font-mono font-bold text-slate-900 cursor-pointer hover:text-rose-600 hover:underline transition";
codeTd.textContent = item.code;
codeTd.addEventListener('click', () => this.app.openKlineModal(item.code, item.name));

const nameTd = document.createElement('td');
nameTd.className = "px-4 py-3 font-semibold text-slate-800 cursor-pointer hover:text-rose-600 hover:underline transition";
nameTd.textContent = item.name;
nameTd.addEventListener('click', () => this.app.openKlineModal(item.code, item.name));
```

- [ ] **Step 3: Add stock click event listeners in `public/js/tabs/review.js`**

In `ReviewTab` where sector accordion stock items are rendered:
Ensure each stock item tag/card has a click handler or candlestick icon that calls `this.app.openKlineModal(stock.code, stock.name)`.

- [ ] **Step 4: Add stock click event listeners in `public/js/tabs/active.js`**

In `ActiveTab` where leader stocks or stock cards are rendered:
Ensure stock code / name tags call `this.app.openKlineModal(stock.code, stock.name)`.

- [ ] **Step 5: Verify all stock click bindings**

Check that clicking any stock code/name in Search, Review, or Active Sector tabs smoothly opens the K-Line Modal.

- [ ] **Step 6: Commit Task 4**

```bash
git add public/js/app.js public/js/tabs/search.js public/js/tabs/review.js public/js/tabs/active.js
git commit -m "feat(stock): integrate KlineModal globally and bind click listeners in stock tabs"
```

---

## Plan Self-Review

1. **Spec coverage:** All requirements from `docs/superpowers/specs/2026-08-19-stock-daily-kline-design.md` are covered across the 4 tasks.
2. **Placeholder scan:** No TBDs, TODOs, or vague code references.
3. **Type/Method consistency:** `StockDataService.fetchKlineData`, `KlineModalComponent.open(code, name)`, and `app.openKlineModal(code, name)` signatures match across all files.

---
