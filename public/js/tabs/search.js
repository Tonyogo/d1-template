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
            this.btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
            this.btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
        } else {
            this.btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
            this.btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
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
            span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 shadow-sm";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-red-500 hover:text-red-900 focus:outline-none"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
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
            span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm";
            span.innerHTML = `
                <span>${name}</span>
                <button class="ml-1.5 text-indigo-500 hover:text-indigo-900 focus:outline-none"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
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
                    const card = document.createElement('div');
                    card.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";

                    let historyRows = '';
                    stock.history.forEach(item => {
                        const statusStyle = this.app.getStatusBadgeStyle(item.status);
                        historyRows += `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="px-6 py-3 text-sm whitespace-nowrap text-slate-700 font-semibold font-mono hover:text-red-500 cursor-pointer" date-link="${item.date}">${item.date}</td>
                                <td class="px-6 py-3 text-sm whitespace-nowrap">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                        ${item.status || '涨停'}
                                    </span>
                                </td>
                                <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${item.time || '--:--'}</td>
                                <td class="px-6 py-3 text-sm whitespace-nowrap hover:text-red-500 cursor-pointer" sector-link="${item.sector_name || '其他概念'}">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        ${item.sector_name || '其他概念'}
                                    </span>
                                </td>
                                <td class="px-6 py-3 text-sm text-slate-600 max-w-sm truncate" title="${item.concept_reason || ''}">${item.concept_reason || '--'}</td>
                            </tr>
                        `;
                    });

                    const statusStyle = this.app.getStatusBadgeStyle(latest.status);
                    card.innerHTML = `
                        <button class="w-full px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/50 transition-colors text-left border-b border-slate-100 gap-4">
                            <div class="flex items-center space-x-3 truncate">
                                <div class="p-2 bg-red-50 text-red-500 rounded-lg shrink-0"><i data-lucide="trending-up" class="w-4 h-4"></i></div>
                                <div class="truncate">
                                    <span class="text-base font-extrabold text-slate-900">${stock.name}</span>
                                    <span class="text-xs text-slate-400 ml-2 font-mono font-medium">${stock.code}</span>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                                <div class="text-xs text-slate-500">
                                    最新：<span class="font-semibold text-slate-700 font-mono">${latest.date}</span>
                                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusStyle} ml-1">${latest.status || '涨停'}</span>
                                </div>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                    ${stock.history.length} 次记录
                                </span>
                                <div class="p-1 text-slate-400"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i></div>
                            </div>
                        </button>
                        <div class="stock-collapse hidden border-t border-slate-100 overflow-x-auto bg-slate-50/30">
                            <table class="min-w-full divide-y divide-slate-100">
                                <thead class="bg-slate-50/50">
                                    <tr>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">日期</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">板式/状态</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">涨停时间</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">所属概念板块</th>
                                        <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">${historyRows}</tbody>
                            </table>
                        </div>
                    `;

                    const btnToggle = card.querySelector('button');
                    const collapse = card.querySelector('.stock-collapse');
                    const icon = btnToggle.querySelector('.transition-transform');

                    btnToggle.addEventListener('click', () => {
                        collapse.classList.toggle('hidden');
                        if (icon) {
                            icon.classList.toggle('rotate-180');
                        }
                    });

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