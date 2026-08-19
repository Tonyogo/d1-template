import { api } from './api.js';
import { SearchTab } from './tabs/search.js';
import { ReviewTab } from './tabs/review.js';
import { ActiveTab } from './tabs/active.js';
import { UploadTab } from './tabs/upload.js';

class App {
    constructor() {
        this.currentTab = 'search';
        this.initDOM();
        this.initTabs();
        this.initGlobalEventListeners();
    }

    initDOM() {
        // 查找所有具有 data-tab 属性的导航按钮（包含顶部和底部）
        this.navButtons = document.querySelectorAll('button[data-tab]');
        this.contents = {
            search: document.getElementById('tab-content-search'),
            review: document.getElementById('tab-content-review'),
            active: document.getElementById('tab-content-active'),
            upload: document.getElementById('tab-content-upload')
        };

        this.navButtons.forEach(btn => {
            const tab = btn.getAttribute('data-tab');
            btn.addEventListener('click', () => this.switchTab(tab));
        });
    }

    initTabs() {
        this.searchTab = new SearchTab(this);
        this.reviewTab = new ReviewTab(this);
        this.activeTab = new ActiveTab(this);
        this.uploadTab = new UploadTab(this);

        this.reloadSummaries();
    }

    async reloadSummaries() {
        try {
            const summaries = await api.getDailySummaries();
            const select = document.getElementById('date-select');
            if (select) select.innerHTML = '';

            if (summaries.length === 0) {
                if (select) select.innerHTML = '<option value="">暂无数据</option>';
                const calendarSelectedText = document.getElementById('calendar-selected-text');
                if (calendarSelectedText) calendarSelectedText.textContent = '暂无数据';
                return;
            }

            const dates = summaries.map(s => s.date);
            this.reviewTab.setAvailableDates(dates);

            summaries.forEach((item, index) => {
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = item.date;
                    opt.textContent = item.date + (index === 0 ? ' (最新)' : '');
                    select.appendChild(opt);
                }
            });

            const latest = summaries[0].date;
            this.reviewTab.selectDate(latest);

        } catch (err) {
            console.error(err);
            alert('初始化获取复盘列表失败');
        }
    }

    switchTab(tab) {
        this.currentTab = tab;

        // 1. 隐藏所有 Tab 容器
        Object.keys(this.contents).forEach(t => {
            this.contents[t].classList.add('hidden');
        });
        this.contents[tab].classList.remove('hidden');

        // 2. 遍历并联动高亮桌面顶部和移动底部的对应 Tab 按钮
        this.navButtons.forEach(btn => {
            const btnTab = btn.getAttribute('data-tab');
            const isDesktop = btn.closest('nav').classList.contains('md:flex');

            if (btnTab === tab) {
                if (isDesktop) {
                    // 桌面端激活样式（现代 Segmented Control 白底微边框微投影）
                    btn.className = "px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-2 transition-all duration-150 bg-white text-slate-900 shadow-sm border border-slate-200/60";

                    const icon = btn.querySelector('i, svg');
                    if (icon) {
                        icon.setAttribute('class', 'w-3.5 h-3.5 text-rose-600');
                    }
                } else {
                    // 移动端激活样式
                    btn.className = "flex flex-col items-center space-y-0.5 text-rose-600 font-bold transition py-1 px-3 rounded-xl";
                }
            } else {
                if (isDesktop) {
                    // 桌面端非激活样式
                    btn.className = "px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-2 transition-all duration-150 text-slate-600 hover:text-slate-900";

                    const icon = btn.querySelector('i, svg');
                    if (icon) {
                        icon.setAttribute('class', 'w-3.5 h-3.5 text-slate-400');
                    }
                } else {
                    // 移动端非激活样式
                    btn.className = "flex flex-col items-center space-y-0.5 text-slate-500 hover:text-slate-900 transition py-1 px-3 rounded-xl";
                }
            }
        });

        if (tab === 'active' && this.activeTab.rawData.length === 0) {
            this.activeTab.loadActiveSectors("30");
        } else if (tab === 'upload') {
            this.uploadTab.resetForm();
        }

        lucide.createIcons();
    }

    getStatusBadgeStyle(status) {
        if (!status) return 'bg-slate-100 text-slate-600 border border-slate-200/80';
        const s = status.trim();
        if (s.includes('首板')) return 'badge-limit-first';
        if (s.includes('二')) return 'badge-limit-two';
        if (s.includes('三') || s.includes('四') || s.includes('五') || s.includes('六') || s.includes('七') || s.includes('高度板')) {
            return 'badge-limit-high';
        }
        if (s.includes('T') || s.includes('一字')) return 'badge-limit-flat';
        return 'bg-slate-100 text-slate-700 border border-slate-200/80';
    }

    deepLinkStock(stockCode, stockName) {
        this.switchTab('search');
        this.searchTab.input.value = stockCode || stockName;
        this.searchTab.activeSectors = [];
        this.searchTab.activeReasons = [];
        this.searchTab.renderSectorTags();
        this.searchTab.renderReasonTags();
        this.searchTab.performSearch();
    }

    deepLinkSector(sectorName) {
        this.switchTab('search');
        this.searchTab.input.value = '';
        this.searchTab.setMatchMode('exact');
        this.searchTab.activeSectors = [sectorName];
        this.searchTab.activeReasons = [];
        this.searchTab.renderSectorTags();
        this.searchTab.renderReasonTags();
        this.searchTab.performSearch();
    }

    deepLinkDate(date) {
        this.switchTab('review');
        this.reviewTab.selectDate(date);
    }

    initGlobalEventListeners() {
        // Global error boundary & unhandled rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    lucide.createIcons();
});
