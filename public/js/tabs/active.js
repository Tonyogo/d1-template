import { api } from '../api.js';

export class ActiveTab {
    constructor(app) {
        this.app = app;
        this.rawData = [];
        this.initDOM();
    }

    initDOM() {
        this.select = document.getElementById('active-scope-select');
        this.input = document.getElementById('active-search-input');
        this.loader = document.getElementById('active-loader');
        this.grid = document.getElementById('active-sectors-grid');

        this.select.addEventListener('change', (e) => this.loadActiveSectors(e.target.value));
        this.input.addEventListener('input', (e) => this.filterSectors(e.target.value));
    }

    async loadActiveSectors(scopeDays) {
        this.loader.classList.remove('hidden');
        this.grid.innerHTML = '';
        this.input.value = '';

        try {
            const data = await api.getActiveSectors(scopeDays);
            this.rawData = data;
            this.renderActiveSectors(data);
        } catch (err) {
            console.error(err);
            this.grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-500">计算板块活跃热度失败</div>';
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    filterSectors(text) {
        const val = text.trim().toLowerCase();
        if (!val) {
            this.renderActiveSectors(this.rawData);
            return;
        }
        const filtered = this.rawData.filter(sec =>
            sec.name.toLowerCase().includes(val) ||
            (sec.description && sec.description.toLowerCase().includes(val))
        );
        this.renderActiveSectors(filtered);
    }

    renderActiveSectors(sectors) {
        this.grid.innerHTML = '';
        if (!sectors || sectors.length === 0) {
            this.grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400">没有找到符合筛选条件的活跃板块</div>';
            return;
        }

        sectors.forEach(sector => {
            const card = document.createElement('div');
            card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-205 flex flex-col justify-between";

            let leadersMarkup = '';
            if (sector.leaders && sector.leaders.length > 0) {
                leadersMarkup = `
                    <div class="mt-4 pt-4 border-t border-slate-100">
                        <span class="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">领涨龙头股</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${sector.leaders.map(ld => `
                                <button class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900 border border-red-100 transition-colors font-sans" stock-leader-link="${ld.name}">
                                    <span class="w-1 h-1 bg-red-500 rounded-full mr-1.5 shrink-0"></span>
                                    <span>${ld.name}</span>
                                    <span class="text-slate-400 font-mono ml-1 font-medium">(${ld.count}次)</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                leadersMarkup = `
                    <div class="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
                        分析周期内暂无主线龙头个股
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="space-y-3 flex-grow">
                    <div class="flex items-start justify-between gap-2">
                        <button class="text-lg font-black text-slate-900 hover:text-red-500 transition-colors text-left font-sans truncate font-bold" sector-link="${sector.name}">
                            ${sector.name}
                        </button>
                        <button class="inline-flex items-center px-2 py-0.5 rounded text-xxs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0" date-link="${sector.latest_date}">
                            活跃：${sector.latest_date.substring(5)}
                        </button>
                    </div>
                    <div class="flex items-center space-x-4 text-xs font-bold">
                        <div class="text-blue-600 flex items-center space-x-1">
                            <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                            <span>上榜 ${sector.appearances} 天</span>
                        </div>
                        <div class="text-indigo-600 flex items-center space-x-1">
                            <i data-lucide="box" class="w-3.5 h-3.5"></i>
                            <span>累计 ${sector.total_stocks_count} 只涨停</span>
                        </div>
                    </div>
                    <p class="text-xs text-slate-500 leading-relaxed font-normal line-clamp-3" title="${sector.description || ''}">
                        ${sector.description || '当前周期暂未捕获详细概念催化驱动。'}
                    </p>
                </div>
                ${leadersMarkup}
            `;

            card.querySelectorAll('[stock-leader-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkStock(el.getAttribute('stock-leader-link'));
                });
            });

            card.querySelectorAll('[sector-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkSector(el.getAttribute('sector-link'));
                });
            });

            card.querySelectorAll('[date-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkDate(el.getAttribute('date-link'));
                });
            });

            this.grid.appendChild(card);
        });
        lucide.createIcons();
    }
}