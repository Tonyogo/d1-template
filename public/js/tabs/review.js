import { api } from '../api.js';

export class ReviewTab {
    constructor(app) {
        this.app = app;
        this.currentLoadedDate = null;
        this.initDOM();
        this.initEditModalDOM();
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

        // 纠错按钮
        this.editBtn = document.getElementById('review-edit-btn');

        this.select.addEventListener('change', (e) => this.loadDailyDetails(e.target.value));
        this.imageToggleBtn.addEventListener('click', () => this.toggleImage());
        this.editBtn.addEventListener('click', () => this.openEditModal());
    }

    initEditModalDOM() {
        this.editModal = document.getElementById('edit-modal');
        this.editModalDate = document.getElementById('edit-modal-date');
        this.editModalClose = document.getElementById('edit-modal-close');
        this.editMarkdownTextarea = document.getElementById('edit-markdown-textarea');
        this.editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
        this.editModalSaveBtn = document.getElementById('edit-modal-save-btn');

        this.editModalClose.addEventListener('click', () => this.closeEditModal());
        this.editModalCancelBtn.addEventListener('click', () => this.closeEditModal());
        this.editModalSaveBtn.addEventListener('click', () => this.saveMarkdownCorrection());

        this.editModal.addEventListener('click', (e) => {
            if (e.target === this.editModal) {
                this.closeEditModal();
            }
        });

        // 绑定全局 ESC 按键监听以快速关闭 Markdown 纠错 Modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.editModal.classList.contains('hidden')) {
                this.closeEditModal();
            }
        });
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
        if (!date) {
            this.currentLoadedDate = null;
            this.editBtn.classList.add('hidden');
            return;
        }

        this.currentLoadedDate = date;
        this.loader.classList.remove('hidden');
        this.accordionContainer.innerHTML = '';
        this.editBtn.classList.add('hidden');

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
            this.statCount.innerHTML = `${summary.stock_count || '--'} <span class="text-[11px] font-sans font-medium text-slate-400">只</span>`;
            this.statUpgrade.textContent = summary.upgrade_rate !== null ? `${summary.upgrade_rate}%` : '--%';
            this.statBroken.textContent = summary.limit_broken_rate !== null ? `${summary.limit_broken_rate}%` : '--%';
            this.statBidding.textContent = summary.bidding_increase_rate !== null ? `${summary.bidding_increase_rate}%` : '--%';

            this.renderSectorsAccordion(data.sectors);

            // 数据成功加载后，展现“修正数据”按钮
            this.editBtn.classList.remove('hidden');
        } catch (err) {
            console.error(err);
            this.accordionContainer.innerHTML = '<div class="financial-card rounded-2xl p-10 text-center text-xs text-slate-500 font-medium">无法加载此日期的详细复盘数据</div>';
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    renderSectorsAccordion(sectors) {
        this.accordionContainer.innerHTML = '';
        if (!sectors || sectors.length === 0) {
            this.accordionContainer.innerHTML = '<div class="financial-card rounded-2xl p-10 text-center text-xs text-slate-400 font-medium">当日暂未捕获板块分类</div>';
            return;
        }

        sectors.forEach(sector => {
            if (sector.stocks.length === 0) return;

            const item = document.createElement('div');
            item.className = "financial-card rounded-2xl overflow-hidden transition-all duration-200";

            let stockRows = '';
            sector.stocks.forEach(stock => {
                const statusStyle = this.app.getStatusBadgeStyle(stock.status);
                stockRows += `
                    <tr class="flex flex-col md:table-row hover:bg-slate-50/60 transition-colors border-b border-slate-100 last:border-b-0 md:border-b-0 p-4 md:p-0">
                        <td class="pb-2 md:pb-0 md:px-5 md:py-3 text-xs whitespace-nowrap flex justify-between items-center md:table-cell">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle}">
                                ${stock.status || '涨停'}
                            </span>
                            <span class="text-xs text-slate-400 font-mono md:hidden flex items-center gap-1">
                                <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                <span>${stock.time || '--:--'}</span>
                            </span>
                        </td>
                        <td class="hidden md:table-cell px-5 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">${stock.code}</td>
                        <td class="py-1 md:px-5 md:py-3 text-xs text-slate-900 whitespace-nowrap hover:text-rose-600 cursor-pointer flex items-baseline space-x-2 md:table-cell font-semibold" stock-link="${stock.code}" stock-name="${stock.name}">
                            <span class="text-sm md:text-xs font-bold text-slate-900 hover:text-rose-600 transition-colors">${stock.name}</span>
                            <span class="text-[11px] text-slate-400 font-mono font-medium md:hidden">${stock.code}</span>
                        </td>
                        <td class="hidden md:table-cell px-5 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">${stock.time || '--:--'}</td>
                        <td class="pt-2 md:pt-0 md:px-5 md:py-3 text-xs text-slate-600 bg-slate-50/80 rounded-xl p-3 md:p-0 md:bg-transparent md:table-cell">
                            <div class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">动因 & 概念</div>
                            <div class="leading-relaxed">${stock.concept_reason || '--'}</div>
                        </td>
                    </tr>
                `;
            });

            item.innerHTML = `
                <button class="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-slate-50/50 transition-colors text-left border-b border-slate-100">
                    <div class="flex items-center space-x-3 truncate">
                        <div class="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100/60"><i data-lucide="hash" class="w-4 h-4"></i></div>
                        <div class="truncate">
                            <span class="text-sm font-bold text-slate-900">${sector.name}</span>
                            ${sector.description ? `<span class="text-xs text-slate-400 ml-2.5 font-medium truncate hidden sm:inline-block">${sector.description}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 shrink-0">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">${sector.stocks.length} 只个股</span>
                        <div class="p-1 text-slate-400"><i data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200"></i></div>
                    </div>
                </button>
                <div class="sector-collapse hidden border-t border-slate-100 overflow-x-auto bg-slate-50/20">
                    <table class="min-w-full divide-y divide-slate-100">
                        <thead class="bg-slate-50/80 hidden md:table-header-group">
                            <tr>
                                <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">板式</th>
                                <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">代码</th>
                                <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">名称</th>
                                <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">时间</th>
                                <th scope="col" class="px-5 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">概念/原因</th>
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
                    const code = el.getAttribute('stock-link');
                    const name = el.getAttribute('stock-name');
                    this.app.deepLinkStock(code, name);
                });
            });

            this.accordionContainer.appendChild(item);
        });
        lucide.createIcons();
    }

    async openEditModal() {
        if (!this.currentLoadedDate) return;

        this.editModalDate.textContent = `正在读取 ${this.currentLoadedDate} 的 R2 原始 Markdown 备份...`;
        this.editMarkdownTextarea.value = '';
        this.editMarkdownTextarea.disabled = true;
        this.editModalSaveBtn.disabled = true;
        this.editModalSaveBtn.classList.add('opacity-50');

        this.editModal.classList.remove('hidden');
        lucide.createIcons();

        try {
            const data = await api.getMarkdown(this.currentLoadedDate);
            if (data.error || !data.markdown) {
                throw new Error(data.message || data.error || '获取 Markdown 文件失败');
            }
            this.editMarkdownTextarea.value = data.markdown;
            this.editModalDate.textContent = `正在修改 ${this.currentLoadedDate} 的复盘 Markdown 备份`;
            this.editMarkdownTextarea.disabled = false;
            this.editModalSaveBtn.disabled = false;
            this.editModalSaveBtn.classList.remove('opacity-50');
        } catch (err) {
            console.error(err);
            alert(`获取失败: ${err.message || err}`);
            this.closeEditModal();
        }
    }

    closeEditModal() {
        this.editModal.classList.add('hidden');
    }

    async saveMarkdownCorrection() {
        if (!this.currentLoadedDate || this.editMarkdownTextarea.disabled) return;

        const text = this.editMarkdownTextarea.value.trim();
        if (!text) {
            alert('Markdown 文本不能为空！');
            return;
        }

        const originalBtnHTML = this.editModalSaveBtn.innerHTML;
        this.editModalSaveBtn.disabled = true;
        this.editModalSaveBtn.classList.add('opacity-50');
        this.editMarkdownTextarea.disabled = true;
        this.editModalSaveBtn.innerHTML = `<div class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div> <span>重新解析入库中...</span>`;

        try {
            const payload = {
                date: this.currentLoadedDate,
                rawMarkdown: text
            };

            const data = await api.commitMarkdownUpdate(payload);
            if (data.error) {
                throw new Error(data.message || data.error);
            }

            alert('纠错修改成功！数据已重新级联入库。');
            this.closeEditModal();

            // 联动重载刷新当前每日复盘页面
            await this.loadDailyDetails(this.currentLoadedDate);
        } catch (err) {
            console.error('Failed to save correction:', err);
            alert(`修改入库失败: ${err.message || err}`);
        } finally {
            this.editModalSaveBtn.disabled = false;
            this.editModalSaveBtn.classList.remove('opacity-50');
            this.editMarkdownTextarea.disabled = false;
            this.editModalSaveBtn.innerHTML = originalBtnHTML;
            lucide.createIcons();
        }
    }
}
