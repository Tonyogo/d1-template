import { api } from '../api.js';

export class ReviewTab {
    constructor(app) {
        this.app = app;
        this.initDOM();
    }

    initDOM() {
        this.select = document.getElementById('date-select');
        this.statCount = document.getElementById('stat-count');
        this.statUpgrade = document.getElementById('stat-upgrade');
        this.statBroken = document.getElementById('stat-broken');
        this.statBidding = document.getElementById('stat-bidding');
        this.imageCard = document.getElementById('review-image-card');
        this.imageToggleBtn = document.getElementById('image-toggle-btn');
        this.imageCollapse = document.getElementById('image-collapse');
        this.imageChevron = document.getElementById('image-chevron');
        this.imageToggleStatus = document.getElementById('image-toggle-status');
        this.reviewImg = document.getElementById('review-image');
        this.loader = document.getElementById('review-loader');
        this.accordionContainer = document.getElementById('sectors-accordion');

        this.select.addEventListener('change', (e) => this.loadDailyDetails(e.target.value));
        this.imageToggleBtn.addEventListener('click', () => this.toggleImage());
    }

    toggleImage() {
        const isHidden = this.imageCollapse.classList.contains('hidden');
        this.imageCollapse.classList.toggle('hidden');
        this.imageToggleStatus.textContent = isHidden ? '收起' : '展开';

        const chevron = document.getElementById('image-chevron');
        if (chevron) {
            chevron.classList.toggle('rotate-180', isHidden);
        }
    }

    async loadDailyDetails(date) {
        if (!date) return;

        this.loader.classList.remove('hidden');
        this.accordionContainer.innerHTML = '';

        try {
            this.reviewImg.src = '/api/image?date=' + date;
            this.reviewImg.onload = () => this.imageCard.classList.remove('hidden');
            this.reviewImg.onerror = () => {
                this.imageCard.classList.add('hidden');
                this.imageCollapse.classList.add('hidden');
                const chevron = document.getElementById('image-chevron');
                if (chevron) chevron.classList.remove('rotate-180');
                this.imageToggleStatus.textContent = '展开';
                lucide.createIcons();
            };

            const data = await api.getDailyDetails(date);

            const summary = data.summary;
            this.statCount.innerHTML = `${summary.stock_count || '--'} <span class="text-xs font-medium text-slate-400">只</span>`;
            this.statUpgrade.textContent = summary.upgrade_rate !== null ? `${summary.upgrade_rate}%` : '--%';
            this.statBroken.textContent = summary.limit_broken_rate !== null ? `${summary.limit_broken_rate}%` : '--%';
            this.statBidding.textContent = summary.bidding_increase_rate !== null ? `${summary.bidding_increase_rate}%` : '--%';

            this.renderSectorsAccordion(data.sectors);
        } catch (err) {
            console.error(err);
            this.accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-500">无法加载此日期的详细复盘数据</div>';
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    renderSectorsAccordion(sectors) {
        this.accordionContainer.innerHTML = '';
        if (!sectors || sectors.length === 0) {
            this.accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-400">当日暂未捕获板块分类</div>';
            return;
        }

        sectors.forEach(sector => {
            if (sector.stocks.length === 0) return;

            const item = document.createElement('div');
            item.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";

            let stockRows = '';
            sector.stocks.forEach(stock => {
                const statusStyle = this.app.getStatusBadgeStyle(stock.status);
                stockRows += `
                    <tr class="hover:bg-slate-50/50 transition-colors">
                        <td class="px-6 py-3 text-sm whitespace-nowrap">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                ${stock.status || '涨停'}
                            </span>
                        </td>
                        <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.code}</td>
                        <td class="px-6 py-3 text-sm font-bold text-slate-900 whitespace-nowrap hover:text-red-500 cursor-pointer" stock-link="${stock.name}">${stock.name}</td>
                        <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">${stock.time || '--:--'}</td>
                        <td class="px-6 py-3 text-sm text-slate-600">${stock.concept_reason || '--'}</td>
                    </tr>
                `;
            });

            item.innerHTML = `
                <button class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 font-bold">
                    <div class="flex items-center space-x-3 truncate">
                        <div class="p-1.5 bg-red-50 text-red-500 rounded-lg"><i data-lucide="hash" class="w-4 h-4"></i></div>
                        <div class="truncate">
                            <span class="text-base font-extrabold text-slate-900">${sector.name}</span>
                            ${sector.description ? `<span class="text-xs text-slate-400 ml-3 font-medium truncate hidden sm:inline-block">${sector.description}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-4 shrink-0">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">${sector.stocks.length} 只个股</span>
                        <div class="p-1 text-slate-400"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i></div>
                    </div>
                </button>
                <div class="sector-collapse hidden border-t border-slate-100 overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-100">
                        <thead class="bg-slate-50/50">
                            <tr>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">板式</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">代码</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">名称</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">时间</th>
                                <th scope="col" class="px-6 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">${stockRows}</tbody>
                    </table>
                </div>
            `;

            const btnToggle = item.querySelector('button');
            const collapse = item.querySelector('.sector-collapse');
            const icon = btnToggle.querySelector('.transition-transform');

            btnToggle.addEventListener('click', () => {
                collapse.classList.toggle('hidden');
                if (icon) {
                    icon.classList.toggle('rotate-180');
                }
            });

            item.querySelectorAll('[stock-link]').forEach(el => {
                el.addEventListener('click', () => {
                    this.app.deepLinkStock(el.getAttribute('stock-link'));
                });
            });

            this.accordionContainer.appendChild(item);
        });
        lucide.createIcons();
    }
}