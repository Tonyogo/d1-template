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
            this.grid.innerHTML = '<div class="col-span-full financial-card rounded-2xl p-10 text-center text-xs text-slate-500 font-medium">计算板块活跃热度失败</div>';
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
            this.grid.innerHTML = '<div class="col-span-full financial-card rounded-2xl p-12 text-center text-xs text-slate-400 font-medium">没有找到符合筛选条件的活跃板块</div>';
            return;
        }

        sectors.forEach(sector => {
            const card = document.createElement('div');
            card.className = "financial-card rounded-2xl p-5 flex flex-col justify-between transition-all duration-200";

            let leadersMarkup = '';
            if (sector.leaders && sector.leaders.length > 0) {
                leadersMarkup = `
                    <div class="mt-4 pt-3.5 border-t border-slate-100">
                        <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">领涨龙头股</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${sector.leaders.map(ld => `
                                <button class="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-900 border border-rose-100/80 transition-all active:scale-95" stock-kline-link="${ld.code}" stock-kline-name="${ld.name}">
                                    <span class="w-1.5 h-1.5 bg-rose-600 rounded-full mr-1.5 shrink-0"></span>
                                    <span>${ld.name}</span>
                                    <span class="text-rose-400 font-mono ml-1 font-medium">(${ld.count}次)</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                leadersMarkup = `
                    <div class="mt-4 pt-3.5 border-t border-slate-100 text-xs text-slate-400 italic">
                        分析周期内暂无主线龙头个股
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="space-y-2.5 flex-grow">
                    <div class="flex items-start justify-between gap-2">
                        <button class="text-sm font-bold text-slate-900 hover:text-rose-600 transition-colors text-left truncate" sector-link="${sector.name}">
                            ${sector.name}
                        </button>
                        <button class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0" date-link="${sector.latest_date}">
                            活跃: ${sector.latest_date.substring(5)}
                        </button>
                    </div>
                    <div class="flex items-center space-x-3 text-xs font-semibold">
                        <div class="text-blue-600 flex items-center space-x-1 font-mono">
                            <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                            <span>上榜 ${sector.appearances} 天</span>
                        </div>
                        <div class="text-indigo-600 flex items-center space-x-1 font-mono">
                            <i data-lucide="layers" class="w-3.5 h-3.5"></i>
                            <span>累计 ${sector.total_stocks_count} 只涨停</span>
                        </div>
                    </div>
                    <p class="text-xs text-slate-500 leading-relaxed line-clamp-3" title="${sector.description || ''}">
                        ${sector.description || '当前周期暂未捕获详细概念催化驱动。'}
                    </p>
                </div>
                ${leadersMarkup}
            `;

            card.querySelectorAll('[stock-leader-link]').forEach(el => {
                el.addEventListener('click', () => {
                    const code = el.getAttribute('stock-leader-link');
                    const name = el.getAttribute('stock-leader-name');
                    this.app.deepLinkStock(code, name);
                });
            });

            card.querySelectorAll('[stock-kline-link]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = el.getAttribute('stock-kline-link');
                    const name = el.getAttribute('stock-kline-name');
                    this.app.openKlineModal(code, name);
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
