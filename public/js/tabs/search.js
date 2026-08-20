import { api } from '../api.js';

export class SearchTab {
    constructor(app) {
        this.app = app;
        this.activeSectors = [];
        this.activeReasons = [];
        this.sectorMatchMode = 'exact';

        this.initDOM();
    }

    initDOM() {
        this.input = document.getElementById('search-input');
        this.btnSearch = document.getElementById('search-btn');
        this.sectorInput = document.getElementById('sector-filter-input');
        this.sectorAddBtn = document.getElementById('sector-add-btn');
        this.reasonInput = document.getElementById('reason-filter-input');
        this.reasonAddBtn = document.getElementById('reason-add-btn');
        this.btnExact = document.getElementById('btn-mode-exact');
        this.btnFuzzy = document.getElementById('btn-mode-fuzzy');
        this.loader = document.getElementById('search-loader');
        this.emptyState = document.getElementById('search-empty-state');
        this.resultsContainer = document.getElementById('search-results-container');
        this.resultsBody = document.getElementById('search-results-body');
        this.resultTitle = document.getElementById('search-result-title');
        this.resultCount = document.getElementById('search-result-count');
        this.sectorTagsContainer = document.getElementById('sector-tags-container');
        this.reasonTagsContainer = document.getElementById('reason-tags-container');

        this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.performSearch(); });
        this.btnSearch.addEventListener('click', () => this.performSearch());

        this.sectorInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addSectorTag(); });
        this.sectorAddBtn.addEventListener('click', () => this.addSectorTag());

        this.reasonInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addReasonTag(); });
        this.reasonAddBtn.addEventListener('click', () => this.addReasonTag());

        this.btnExact.addEventListener('click', () => this.setMatchMode('exact'));
        this.btnFuzzy.addEventListener('click', () => this.setMatchMode('fuzzy'));
    }

    setMatchMode(mode) {
        if (this.sectorMatchMode === mode) return;
        this.sectorMatchMode = mode;
        if (mode === 'exact') {
            this.btnExact.className = "px-2 py-0.5 text-[11px] font-bold rounded-md transition bg-white text-slate-800 shadow-xs";
            this.btnFuzzy.className = "px-2 py-0.5 text-[11px] font-medium rounded-md transition text-slate-500 hover:text-slate-800";
        } else {
            this.btnFuzzy.className = "px-2 py-0.5 text-[11px] font-bold rounded-md transition bg-white text-slate-800 shadow-xs";
            this.btnExact.className = "px-2 py-0.5 text-[11px] font-medium rounded-md transition text-slate-500 hover:text-slate-800";
        }
        if (this.activeSectors.length > 0) this.performSearch();
    }

    addSectorTag() {
        const value = this.sectorInput.value.trim();
        if (!value) return;
        if (!this.activeSectors.includes(value)) {
            this.activeSectors.push(value);
            this.renderSectorTags();
            this.performSearch();
        }
        this.sectorInput.value = '';
    }

    removeSectorTag(val) {
        this.activeSectors = this.activeSectors.filter(s => s !== val);
        this.renderSectorTags();
        this.performSearch();
    }

    renderSectorTags() {
        this.sectorTagsContainer.innerHTML = '';
        this.activeSectors.forEach(name => {
            const span = document.createElement('span');
            span.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-xs";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-rose-500 hover:text-rose-900 focus:outline-none"><i data-lucide="x" class="w-3 h-3"></i></button>
            `;
            span.querySelector('button').addEventListener('click', () => this.removeSectorTag(name));
            this.sectorTagsContainer.appendChild(span);
        });
        lucide.createIcons();
    }

    addReasonTag() {
        const value = this.reasonInput.value.trim();
        if (!value) return;
        if (!this.activeReasons.includes(value)) {
            this.activeReasons.push(value);
            this.renderReasonTags();
            this.performSearch();
        }
        this.reasonInput.value = '';
    }

    removeReasonTag(val) {
        this.activeReasons = this.activeReasons.filter(r => r !== val);
        this.renderReasonTags();
        this.performSearch();
    }

    renderReasonTags() {
        this.reasonTagsContainer.innerHTML = '';
        this.activeReasons.forEach(name => {
            const span = document.createElement('span');
            span.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-xs";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-indigo-500 hover:text-indigo-900 focus:outline-none"><i data-lucide="x" class="w-3 h-3"></i></button>
            `;
            span.querySelector('button').addEventListener('click', () => this.removeReasonTag(name));
            this.reasonTagsContainer.appendChild(span);
        });
        lucide.createIcons();
    }

    async performSearch() {
        const q = this.input.value.trim();
        if (!q && this.activeSectors.length === 0 && this.activeReasons.length === 0) {
            this.loader.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            this.resultsContainer.classList.add('hidden');
            return;
        }

        this.loader.classList.remove('hidden');
        this.emptyState.classList.add('hidden');
        this.resultsContainer.classList.add('hidden');
        this.resultsBody.innerHTML = '';

        try {
            const data = await api.searchStocks({
                q,
                sectors: this.activeSectors,
                concept_reasons: this.activeReasons,
                sector_match_mode: this.sectorMatchMode
            });

            if (data.length === 0) {
                this.emptyState.classList.remove('hidden');
                this.resultCount.textContent = '找到 0 条历史纪录';
            } else {
                let displayTitle = q ? `“${q}”` : '';
                if (this.activeSectors.length > 0) {
                    displayTitle += (displayTitle ? ' + ' : '') + `板块 [${this.activeSectors.join(' & ')}]`;
                }
                if (this.activeReasons.length > 0) {
                    displayTitle += (displayTitle ? ' + ' : '') + `动因 [${this.activeReasons.join(' & ')}]`;
                }
                displayTitle += ' 的历史涨停记录';

                const grouped = {};
                data.forEach(item => {
                    if (!grouped[item.code]) {
                        grouped[item.code] = { code: item.code, name: item.name, history: [] };
                    }
                    grouped[item.code].history.push(item);
                });

                const stockList = Object.values(grouped);
                stockList.forEach(s => s.history.sort((a, b) => b.date.localeCompare(a.date)));
                stockList.sort((a, b) => b.history[0].date.localeCompare(a.history[0].date));

                this.resultTitle.textContent = displayTitle;
                this.resultCount.textContent = `找到 ${stockList.length} 家个股（共 ${data.length} 条历史纪录）`;

                stockList.forEach(stock => {
                    const latest = stock.history[0];
                    const shouldExpand = (stockList.length === 1) || (q && /^\d{6}$/.test(q) && stock.code === q);
                    const card = document.createElement('div');
                    card.className = "financial-card rounded-2xl overflow-hidden transition-all duration-200";

                    let historyRows = '';
                    stock.history.forEach(item => {
                        const statusStyle = this.app.getStatusBadgeStyle(item.status);
                        historyRows += `
                            <tr class="flex flex-col md:table-row p-4 md:p-0 mb-3 md:mb-0 border border-slate-200 md:border-0 rounded-2xl md:rounded-none bg-white md:bg-transparent shadow-xs md:shadow-none hover:bg-slate-50/60 transition-colors">
                                <td class="flex md:table-cell justify-between items-center px-0 md:px-5 py-1.5 md:py-3 border-b md:border-b-0 border-slate-100 pb-2 md:pb-3 text-xs">
                                    <span class="text-slate-900 font-semibold font-mono hover:text-rose-600 cursor-pointer text-xs" date-link="${item.date}">${item.date}</span>
                                    <span class="md:hidden text-xs text-slate-400 font-mono flex items-center gap-1">
                                        <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                        <span>${item.time || '--:--'}</span>
                                    </span>
                                </td>
                                <td class="px-0 md:px-5 py-1.5 md:py-3 text-xs whitespace-nowrap flex items-center space-x-2 md:table-cell">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle}">
                                        ${item.status || '涨停'}
                                    </span>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold badge-sector-pill cursor-pointer md:hidden" sector-link="${item.sector_name || '其他概念'}">
                                        ${item.sector_name || '其他概念'}
                                    </span>
                                </td>
                                <td class="hidden md:table-cell px-5 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">${item.time || '--:--'}</td>
                                <td class="hidden md:table-cell px-5 py-3 text-xs whitespace-nowrap hover:text-rose-600 cursor-pointer" sector-link="${item.sector_name || '其他概念'}">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold badge-sector-pill">
                                        ${item.sector_name || '其他概念'}
                                    </span>
                                </td>
                                <td class="block md:table-cell px-0 md:px-5 py-1.5 md:py-3 text-xs text-slate-600 bg-slate-50/80 md:bg-transparent p-3 md:p-0 rounded-xl md:max-w-sm md:truncate" title="${item.concept_reason || ''}">
                                    <div class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">涨停动因 & 概念</div>
                                    <div class="leading-relaxed text-xs">${item.concept_reason || '--'}</div>
                                </td>
                            </tr>
                        `;
                    });

                    const statusStyle = this.app.getStatusBadgeStyle(latest.status);
                    card.innerHTML = `
                    <div class="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/50 transition text-left">
                        <div class="flex items-center space-x-3 cursor-pointer flex-grow" stock-kline-trigger code="${stock.code}" name="${stock.name}">
                            <div class="p-2 sm:p-2.5 bg-rose-50 rounded-xl text-rose-600 border border-rose-100/60 shrink-0">
                                <i data-lucide="trending-up" class="w-4 h-4"></i>
                            </div>
                            <div class="truncate">
                                <h3 class="text-sm font-bold text-slate-900 flex items-baseline space-x-2">
                                    <span class="hover:text-rose-600 hover:underline transition">${stock.name}</span>
                                    <span class="text-xs text-slate-400 font-mono font-medium hover:text-rose-600 transition">${stock.code}</span>
                                </h3>
                                <p class="text-[11px] text-slate-400 font-mono mt-0.5">历史涨停 ${stock.history.length} 次 | 最近一次: ${latest.date}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 shrink-0">
                            <button type="button" class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200/80 active:bg-rose-100 transition" stock-kline-trigger code="${stock.code}" name="${stock.name}">
                                <i data-lucide="line-chart" class="w-3.5 h-3.5 mr-1"></i>日K
                            </button>
                            <span class="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle}">
                                ${latest.status || '涨停'}
                            </span>
                            <button class="p-1.5 text-slate-400 hover:text-slate-600 transition rounded-lg hover:bg-slate-100" toggle-collapse-btn>
                                <i data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200 ${shouldExpand ? 'rotate-180' : ''}"></i>
                            </button>
                        </div>
                    </div>
                    <div class="stock-collapse ${shouldExpand ? '' : 'hidden'} border-t border-slate-100 overflow-x-auto bg-slate-50/30 p-2 md:p-0">
                            <table class="min-w-full divide-y divide-slate-100">
                                <thead class="bg-slate-50/80 hidden md:table-header-group">
                                    <tr>
                                        <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">日期</th>
                                        <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">板式/状态</th>
                                        <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">涨停时间</th>
                                        <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">所属概念板块</th>
                                        <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white md:bg-transparent">${historyRows}</tbody>
                            </table>
                        </div>
                    `;

                    card.querySelectorAll('[stock-kline-trigger]').forEach(trigger => {
                        trigger.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.openKlineModal(stock.code, stock.name);
                        });
                    });

                    const btnToggle = card.querySelector('[toggle-collapse-btn]');
                    const collapse = card.querySelector('.stock-collapse');
                    const icon = btnToggle ? btnToggle.querySelector('.transition-transform') : null;

                    if (btnToggle) {
                        btnToggle.addEventListener('click', (e) => {
                            e.stopPropagation();
                            collapse.classList.toggle('hidden');
                            if (icon) {
                                icon.classList.toggle('rotate-180');
                            }
                        });
                    }

                    // 给跨 Tab 的跳转项绑定点击监听
                    card.querySelectorAll('[date-link]').forEach(el => {
                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.deepLinkDate(el.getAttribute('date-link'));
                        });
                    });

                    card.querySelectorAll('[sector-link]').forEach(el => {
                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.app.deepLinkSector(el.getAttribute('sector-link'));
                        });
                    });

                    this.resultsBody.appendChild(card);
                });

                this.resultsContainer.classList.remove('hidden');
                lucide.createIcons();
            }
        } catch (err) {
            console.error(err);
            alert('个股查询失败');
            this.emptyState.classList.remove('hidden');
        } finally {
            this.loader.classList.add('hidden');
        }
    }
}
