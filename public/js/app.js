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
    }

    initDOM() {
        this.buttons = {
            search: document.getElementById('tab-btn-search'),
            review: document.getElementById('tab-btn-review'),
            active: document.getElementById('tab-btn-active'),
            upload: document.getElementById('tab-btn-upload')
        };

        this.contents = {
            search: document.getElementById('tab-content-search'),
            review: document.getElementById('tab-content-review'),
            active: document.getElementById('tab-content-active'),
            upload: document.getElementById('tab-content-upload')
        };

        Object.keys(this.buttons).forEach(tab => {
            this.buttons[tab].addEventListener('click', () => this.switchTab(tab));
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
            select.innerHTML = '';

            if (summaries.length === 0) {
                select.innerHTML = '<option value="">暂无数据</option>';
                return;
            }

            summaries.forEach((item, index) => {
                const opt = document.createElement('option');
                opt.value = item.date;
                opt.textContent = item.date + (index === 0 ? ' (最新)' : '');
                select.appendChild(opt);
            });

            // 自动加载最新日期数据
            const latest = summaries[0].date;
            select.value = latest;
            this.reviewTab.loadDailyDetails(latest);

        } catch (err) {
            console.error(err);
            alert('初始化获取复盘列表失败');
        }
    }

    switchTab(tab) {
        this.currentTab = tab;

        // 重置样式
        Object.keys(this.buttons).forEach(t => {
            this.buttons[t].className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900";
            this.contents[t].classList.add('hidden');
        });

        // 激活样式
        this.buttons[tab].className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
        this.contents[tab].classList.remove('hidden');

        if (tab === 'active' && this.activeTab.rawData.length === 0) {
            this.activeTab.loadActiveSectors("30");
        } else if (tab === 'upload') {
            this.uploadTab.resetForm();
        }

        lucide.createIcons();
    }

    getStatusBadgeStyle(status) {
        if (!status) return 'bg-slate-100 text-slate-600';
        const s = status.trim();
        if (s.includes('首板')) return 'bg-blue-50 text-blue-700 border border-blue-100';
        if (s.includes('二')) return 'bg-rose-50 text-rose-700 border border-rose-100';
        if (s.includes('三') || s.includes('四') || s.includes('五') || s.includes('六') || s.includes('七') || s.includes('高度板')) {
            return 'bg-red-100 text-red-800 border border-red-200 font-bold';
        }
        if (s.includes('T') || s.includes('一字')) return 'bg-amber-50 text-amber-700 border border-amber-100';
        return 'bg-slate-50 text-slate-600 border border-slate-100';
    }

    // 跨 Tab 跳转深度链接函数
    deepLinkStock(stockName) {
        this.switchTab('search');
        this.searchTab.input.value = stockName;
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

    deepLinkDate(dateStr) {
        this.switchTab('review');
        document.getElementById('date-select').value = dateStr;
        this.reviewTab.loadDailyDetails(dateStr);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    lucide.createIcons();
});