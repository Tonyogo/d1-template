# 移动端响应式与卡片化重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成项目的前端移动端响应式适配。在手机端隐藏顶部导航并激活底部悬浮 Tab 栏（带毛玻璃拟物背景与双向联动机制），同时将个股表格纵向重构为卡片化响应式视图，并优化图片预览与批量上传控制台。

**Architecture:** 
1. **联动导航**：顶部与底部两套导航共享按钮 `data-tab="X"` 属性，通过 JS 拦截双端按钮的高亮切换实现无缝联动。
2. **Table-to-Card**：个股渲染行 `<tr>` 和 `<td>` 声明 `flex flex-col md:table-row` 响应式大类，手机端转化为精致微卡片，桌面端平铺成表格。

**Tech Stack:** Tailwind CSS, HTML5, Vanilla JS (ES Modules).

## Global Constraints
- 前端结构必须 100% 维持在 `public/` 目录下。
- 不引入多余的 JS 打包工具。

---

### Task 1: 升级 `index.html` 基础布局与双端响应式导航

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `index.html` 里的 `<header>` 和 `nav` DOM
- Produces: 含有 `data-tab` 的桌面端和全新 `fixed bottom-0` 移动端底部导航，以及 `body` 底部内边距避让

- [ ] **Step 1: 修改 `body` 增加移动端底部内边距**

将原：
```html
<body class="bg-slate-50 font-sans text-slate-800 antialiased min-h-screen flex flex-col">
```
修改为：
```html
<body class="bg-slate-50 font-sans text-slate-800 antialiased min-h-screen flex flex-col pb-20 md:pb-0">
```

- [ ] **Step 2: 重塑桌面顶部导航栏，改用 `data-tab` 管理**

将头部 `nav` 修改为仅在 `md:` 及以上可见，并移除所有按钮 `id`，改用 `data-tab`：
```html
                <!-- Tabs switcher -->
                <nav class="hidden md:flex space-x-1 bg-slate-100 p-1 rounded-xl" aria-label="Tabs">
                    <button data-tab="search" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm">
                        <i data-lucide="search" class="w-4 h-4 text-red-500"></i>
                        <span>个股查询</span>
                    </button>
                    <button data-tab="review" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        <span>每日复盘</span>
                    </button>
                    <button data-tab="active" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="award" class="w-4 h-4"></i>
                        <span>活跃板块</span>
                    </button>
                    <button data-tab="upload" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="cloud-upload" class="w-4 h-4"></i>
                        <span>上传数据</span>
                    </button>
                </nav>
```

- [ ] **Step 3: 新增移动端悬浮底部导航栏 DOM**

在 `index.html` 闭合标签 `</body>` 之前，插入全新悬浮栏：
```html
    <!-- ==================== MOBILE NAVIGATION BAR (NEW) ==================== -->
    <nav class="flex md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-4 justify-around items-center z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]" aria-label="Mobile Navigation">
        <button data-tab="search" class="flex flex-col items-center space-y-0.5 text-slate-600 hover:text-red-500 transition py-1 px-3 rounded-lg text-red-500 font-bold">
            <i data-lucide="search" class="w-5 h-5"></i>
            <span class="text-[10px] font-bold">个股</span>
        </button>
        <button data-tab="review" class="flex flex-col items-center space-y-0.5 text-slate-600 hover:text-red-500 transition py-1 px-3 rounded-lg">
            <i data-lucide="calendar" class="w-5 h-5"></i>
            <span class="text-[10px] font-bold">复盘</span>
        </button>
        <button data-tab="active" class="flex flex-col items-center space-y-0.5 text-slate-600 hover:text-red-500 transition py-1 px-3 rounded-lg">
            <i data-lucide="award" class="w-5 h-5"></i>
            <span class="text-[10px] font-bold">活跃</span>
        </button>
        <button data-tab="upload" class="flex flex-col items-center space-y-0.5 text-slate-600 hover:text-red-500 transition py-1 px-3 rounded-lg">
            <i data-lucide="cloud-upload" class="w-5 h-5"></i>
            <span class="text-[10px] font-bold">上传</span>
        </button>
    </nav>
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: restructure layout and add responsive bottom sticky navigation menu for mobile devices"
```

---

### Task 2: 编写双端联动导航脚本并同步激活状态

**Files:**
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: 带有 `data-tab` 属性的双端按钮
- Produces: `App.switchTab(tab)` 方法重构，高亮全部对应 tab 的按钮

- [ ] **Step 1: 重构 `App.js` 初始化与事件绑定流程**

重构 `public/js/app.js`（重写整个文件使其干净、规范）：
```javascript
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
                    // 桌面端激活样式
                    btn.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
                    btn.querySelector('i').className = "w-4 h-4 text-red-500";
                } else {
                    // 移动端激活样式
                    btn.className = "flex flex-col items-center space-y-0.5 text-red-500 font-bold transition py-1 px-3 rounded-lg";
                }
            } else {
                if (isDesktop) {
                    // 桌面端非激活样式
                    btn.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900";
                    btn.querySelector('i').className = "w-4 h-4 text-slate-400";
                } else {
                    // 移动端非激活样式
                    btn.className = "flex flex-col items-center space-y-0.5 text-slate-500 transition py-1 px-3 rounded-lg";
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
```

- [ ] **Step 2: Commit**

```bash
git add public/js/app.js
git commit -m "feat: implement dual-navigation synchronization state mechanism in App entrypoint"
```

---

### Task 3: 复盘与搜索视图卡片化适配

**Files:**
- Modify: `public/js/tabs/review.js`
- Modify: `public/js/tabs/search.js`

**Interfaces:**
- Consumes: 股票原始列表数据，`statusStyle`
- Produces: 自适应的双端个股视图（在移动端展示精美微卡片）

- [ ] **Step 1: 修改复盘面板股票行渲染结构 (`public/js/tabs/review.js`)**

1. 将 `renderSectorsAccordion` 函数中 `<thead>` 隐藏（小屏下）：
```javascript
                            <thead class="hidden md:table-header-group bg-slate-50/50">
```
2. 重构个股列表的 `stockRows` 生成逻辑（约第 89-104 行）：
```javascript
            let stockRows = '';
            sector.stocks.forEach(stock => {
                const statusStyle = this.app.getStatusBadgeStyle(stock.status);
                stockRows += `
                    <tr class="flex flex-col md:table-row p-4 md:p-3 mb-3 md:mb-0 border border-slate-200 md:border-0 rounded-xl md:rounded-none bg-white md:bg-transparent shadow-sm md:shadow-none hover:bg-slate-50/50 transition-colors">
                        <td class="flex md:table-cell justify-between items-center px-0 md:px-6 py-1.5 md:py-3 border-b md:border-b-0 border-slate-100 pb-2 md:pb-3 text-sm">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                ${stock.status || '涨停'}
                            </span>
                            <span class="md:hidden text-xs text-slate-400 font-mono flex items-center gap-1">
                                <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                <span>${stock.time || '--:--'}</span>
                            </span>
                        </td>
                        <td class="block md:table-cell px-0 md:px-6 py-1 md:py-3 text-sm whitespace-nowrap">
                            <div class="flex items-center justify-between md:block">
                                <span class="font-extrabold text-slate-900 text-base md:text-sm hover:text-red-500 cursor-pointer" stock-link="${stock.name}">
                                    ${stock.name}
                                </span>
                                <span class="text-xs text-slate-400 font-mono md:ml-1 md:block">${stock.code}</span>
                            </div>
                        </td>
                        <td class="hidden md:table-cell px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">
                            ${stock.time || '--:--'}
                        </td>
                        <td class="block md:table-cell px-0 md:px-6 py-1.5 md:py-3 text-sm text-slate-600 bg-slate-50 md:bg-transparent p-2.5 md:p-0 rounded-lg">
                            <div class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">涨停动因 & 概念</div>
                            <div class="leading-relaxed text-xs md:text-sm">${stock.concept_reason || '--'}</div>
                        </td>
                    </tr>
                `;
            });
```

- [ ] **Step 2: 修改个股历史检索结果行渲染结构 (`public/js/tabs/search.js`)**

1. 将 `performSearch` 里的 `<thead>` 隐藏（小屏下）：
```javascript
                                    <thead class="hidden md:table-header-group bg-slate-50/50">
```
2. 重构个股历史记录的 `historyRows` 生成逻辑（约第 219-232 行）：
```javascript
                            historyRows += `
                                <tr class="flex flex-col md:table-row p-4 md:p-3 mb-3 md:mb-0 border border-slate-200 md:border-0 rounded-xl md:rounded-none bg-white md:bg-transparent shadow-sm md:shadow-none hover:bg-slate-50/50 transition-colors">
                                    <td class="flex md:table-cell justify-between items-center px-0 md:px-6 py-1.5 md:py-3 border-b md:border-b-0 border-slate-100 pb-2 md:pb-3 text-sm">
                                        <span class="text-slate-700 font-semibold font-mono hover:text-red-500 cursor-pointer text-sm" date-link="${item.date}">${item.date}</span>
                                        <span class="md:hidden text-xs text-slate-400 font-mono flex items-center gap-1">
                                            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                            <span>${item.time || '--:--'}</span>
                                        </span>
                                    </td>
                                    <td class="block md:table-cell px-0 md:px-6 py-1 md:py-3 text-sm whitespace-nowrap">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusStyle}">
                                            ${item.status || '涨停'}
                                        </span>
                                    </td>
                                    <td class="hidden md:table-cell px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">
                                        ${item.time || '--:--'}
                                    </td>
                                    <td class="block md:table-cell px-0 md:px-6 py-1.5 md:py-3 text-sm whitespace-nowrap" sector-link="${item.sector_name || '其他概念'}">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            ${item.sector_name || '其他概念'}
                                        </span>
                                    </td>
                                    <td class="block md:table-cell px-0 md:px-6 py-1.5 md:py-3 text-sm text-slate-600 bg-slate-50 md:bg-transparent p-2.5 md:p-0 rounded-lg">
                                        <div class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">涨停动因 & 概念</div>
                                        <div class="leading-relaxed text-xs md:text-sm">${item.concept_reason || '--'}</div>
                                    </td>
                                </tr>
                            `;
```

- [ ] **Step 3: Commit**

```bash
git add public/js/tabs/review.js public/js/tabs/search.js
git commit -m "feat: reconstruct stock rows and histories as app-like card layout on mobile devices"
```

---

### Task 4: 编译校验与发布

- [ ] **Step 1: 运行 `npm run check` 检查整体环境编译状态**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。
- [ ] **Step 2: 将最后的变更合并，进行最终提交**

```bash
git commit --allow-empty -m "chore: complete mobile responsive and list card adaptation"
```
