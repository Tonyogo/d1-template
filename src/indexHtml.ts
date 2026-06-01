export const indexHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A股涨停复盘看板</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Lucide Icons CDN -->
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        /* Modern scrollbar styling */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: #f1f5f9;
        }
        ::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
    </style>
</head>
<body class="bg-slate-50 font-sans text-slate-800 antialiased min-h-screen flex flex-col">

    <!-- Header Navigation -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <!-- Brand logo and name -->
                <div class="flex items-center space-x-3">
                    <div class="p-2 bg-red-500 rounded-lg text-white">
                        <i data-lucide="trending-up" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h1 class="text-lg font-bold text-slate-900 tracking-tight">A股涨停复盘数据看板</h1>
                        <p class="text-xs text-slate-500">智能量化每日行情与个股查询系统</p>
                    </div>
                </div>

                <!-- Tabs switcher -->
                <nav class="flex space-x-1 bg-slate-100 p-1 rounded-xl" aria-label="Tabs">
                    <button id="tab-btn-search" onclick="switchTab('search')" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm">
                        <i data-lucide="search" class="w-4 h-4 text-red-500"></i>
                        <span>个股查询</span>
                    </button>
                    <button id="tab-btn-review" onclick="switchTab('review')" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        <span>每日复盘</span>
                    </button>
                    <button id="tab-btn-active" onclick="switchTab('active')" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="award" class="w-4 h-4"></i>
                        <span>活跃板块</span>
                    </button>
                    <button id="tab-btn-upload" onclick="switchTab('upload')" class="px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900">
                        <i data-lucide="cloud-upload" class="w-4 h-4"></i>
                        <span>上传数据</span>
                    </button>
                </nav>
            </div>
        </div>
    </header>

    <!-- Main Content Container -->
    <main class="flex-grow max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <!-- ==================== TAB 1: STOCK SEARCH ==================== -->
        <section id="tab-content-search" class="space-y-6">
            <!-- Search Container -->
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full space-y-4">
                <h2 class="text-lg font-bold text-slate-900">个股历史涨停查询</h2>
                <p class="text-xs text-slate-500">输入个股名称（如：大唐电信）或六位数股票代码（如：600198）即可快速查询其全部历史涨停复盘记录。</p>

                <div class="relative rounded-xl shadow-sm flex">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i data-lucide="search" class="h-5 w-5 text-slate-400"></i>
                    </div>
                    <input type="text" id="search-input" onkeydown="handleSearchKey(event)" placeholder="输入股票名称、代码查询..." class="block w-full pl-10 pr-24 py-3 sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                    <button onclick="performSearch()" class="absolute right-1.5 top-1.5 px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold shadow-sm transition duration-150 flex items-center space-x-1.5">
                        <span>查询</span>
                    </button>
                </div>

                <!-- Sector Filtering & Concept Reasons (Double Side-by-Side Filtering System) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                    <!-- Column 1: Sector Filtering -->
                    <div class="space-y-2 flex flex-col">
                        <label for="sector-filter-input" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">板块/概念 过滤 (AND 逻辑求交集)</label>
                        <div class="relative rounded-xl shadow-sm flex">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="hash" class="h-4 w-4 text-slate-400"></i>
                            </div>
                            <input type="text" id="sector-filter-input" onkeydown="handleSectorKey(event)" placeholder="输入板块名称（如：机器人），按回车..." class="block w-full pl-9 pr-16 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                            <button onclick="addSectorTag()" class="absolute right-1 top-1 bottom-1 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xxs font-semibold shadow-sm transition duration-150 flex items-center justify-center">
                                <span>添加</span>
                            </button>
                        </div>

                        <!-- Modern Toggle Switch for exact vs fuzzy match mode -->
                        <div class="flex items-center space-x-2 mt-1 text-xs">
                            <span class="font-bold text-slate-400 text-xxs uppercase tracking-wider">匹配模式:</span>
                            <div class="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200" role="radiogroup">
                                <button onclick="setMatchMode('exact')" id="btn-mode-exact" class="px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm">
                                    精确
                                </button>
                                <button onclick="setMatchMode('fuzzy')" id="btn-mode-fuzzy" class="px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800">
                                    模糊 (LIKE)
                                </button>
                            </div>
                        </div>

                        <!-- Container for tags/chips -->
                        <div id="sector-tags-container" class="flex flex-wrap gap-1.5 mt-1"></div>
                    </div>

                    <!-- Column 2: Concept Reason Filtering (Fuzzy Substring Search) -->
                    <div class="space-y-2 flex flex-col">
                        <label for="reason-filter-input" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">概念/原因 过滤 (支持多个，AND 模糊求交集)</label>
                        <div class="relative rounded-xl shadow-sm flex">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="tag" class="h-4 w-4 text-slate-400"></i>
                            </div>
                            <input type="text" id="reason-filter-input" onkeydown="handleReasonKey(event)" placeholder="输入涨停动因（如：并购、低空），按回车..." class="block w-full pl-9 pr-16 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                            <button onclick="addReasonTag()" class="absolute right-1 top-1 bottom-1 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xxs font-semibold shadow-sm transition duration-150 flex items-center justify-center">
                                <span>添加</span>
                            </button>
                        </div>
                        <div class="text-xxs text-slate-400 mt-1 italic">
                            *本项仅支持模糊匹配 (如：输入‘并购’匹配‘重大资产重组’、‘并购重组’等)
                        </div>

                        <!-- Container for tags/chips -->
                        <div id="reason-tags-container" class="flex flex-wrap gap-1.5 mt-1"></div>
                    </div>
                </div>
            </div>

            <!-- Search Results Display -->
            <div class="w-full">
                <!-- Search Loader -->
                <div id="search-loader" class="hidden flex justify-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>

                <!-- Empty State -->
                <div id="search-empty-state" class="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
                    <div class="inline-flex p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
                        <i data-lucide="pie-chart" class="w-10 h-10"></i>
                    </div>
                    <h3 class="text-base font-semibold text-slate-900">暂无查询数据</h3>
                    <p class="text-xs text-slate-400 mt-1">请输入有效的股票名、代码，或者添加概念板块、涨停动因过滤来查询历史数据。</p>
                </div>

                <!-- Results Grouped Card (Redesigned as Collapsible Accordion Stack) -->
                <div id="search-results-container" class="hidden space-y-4">
                    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 id="search-result-title" class="text-sm font-bold text-slate-900">查询结果</h3>
                            <p id="search-result-count" class="text-xs text-slate-400 mt-0.5">找到 -- 条历史纪录</p>
                        </div>
                    </div>

                    <!-- Accordion rows are populated dynamically here -->
                    <div id="search-results-body" class="space-y-4">
                        <!-- Populated dynamically -->
                    </div>
                </div>
            </div>
        </section>

        <!-- ==================== TAB 2: DAILY REVIEW ==================== -->
        <section id="tab-content-review" class="hidden space-y-6">
            <!-- Filter Controls -->
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center space-x-3">
                    <div class="p-2.5 bg-slate-100 rounded-xl text-slate-600">
                        <i data-lucide="filter" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <label for="date-select" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">选择复盘日期</label>
                        <select id="date-select" onchange="onDateChanged(this.value)" class="mt-1 block w-48 pl-3 pr-10 py-1.5 text-base border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg bg-slate-50 font-medium text-slate-900">
                            <!-- Populated dynamically -->
                            <option value="">加载中...</option>
                        </select>
                    </div>
                </div>

                <div id="selected-date-info" class="text-right hidden md:block">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-500"></span>
                        数据状态：已同步
                    </span>
                </div>
            </div>

            <!-- Summary Stats Cards Grid -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <!-- Card 1: Limit Up Stock Count -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-blue-50 rounded-xl text-blue-600">
                        <i data-lucide="box" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">涨停家数</p>
                        <h3 id="stat-count" class="text-2xl font-bold text-slate-900 mt-1">-- <span class="text-sm font-medium text-slate-500">只</span></h3>
                    </div>
                </div>

                <!-- Card 2: Limit Up Upgrade Rate -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-emerald-50 rounded-xl text-emerald-600">
                        <i data-lucide="chevrons-up" class="w-6 h-6"></i>
                    </div>
                    <div class="w-full">
                        <p class="text-xs font-medium text-slate-400">晋级率</p>
                        <h3 id="stat-upgrade" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>

                <!-- Card 3: Limit Broken Rate -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-rose-50 rounded-xl text-rose-600">
                        <i data-lucide="zap-off" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">炸板率</p>
                        <h3 id="stat-broken" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>

                <!-- Card 4: Bidding Increase Rate -->
                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div class="p-4 bg-purple-50 rounded-xl text-purple-600">
                        <i data-lucide="activity" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-slate-400">竞价涨幅</p>
                        <h3 id="stat-bidding" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
                    </div>
                </div>
            </div>

            <!-- Loader -->
            <div id="review-loader" class="hidden flex justify-center py-20">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
            </div>

            <!-- Document-style Accordion container -->
            <div id="sectors-accordion" class="w-full space-y-4">
                <!-- Dynamically populated sector accordion rows -->
            </div>
        </section>

        <!-- ==================== TAB 3: ACTIVE SECTORS ==================== -->
        <section id="tab-content-active" class="hidden space-y-6">
            <!-- Filter & Live search Controls -->
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex flex-wrap items-center gap-4">
                    <!-- Scope select -->
                    <div class="flex items-center space-x-2">
                        <div class="p-2 bg-slate-100 rounded-xl text-slate-600">
                            <i data-lucide="clock" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <label for="active-scope-select" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">分析时间跨度</label>
                            <select id="active-scope-select" onchange="onActiveScopeChanged(this.value)" class="mt-1 block w-44 pl-3 pr-10 py-1.5 text-base border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-lg bg-slate-50 font-medium text-slate-900">
                                <option value="7">近 7 个交易日</option>
                                <option value="30" selected>近 30 个交易日</option>
                                <option value="all">全历史数据</option>
                            </select>
                        </div>
                    </div>

                    <!-- Client-side filter input -->
                    <div class="relative rounded-xl shadow-sm w-64 mt-4 md:mt-0 pt-1">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i data-lucide="filter" class="h-4 w-4 text-slate-400"></i>
                        </div>
                        <input type="text" id="active-search-input" oninput="onActiveSearchInput(this.value)" placeholder="筛选概念板块名称..." class="block w-full pl-9 pr-4 py-2 sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50">
                    </div>
                </div>

                <div class="text-right hidden md:block">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>
                        已计算热度龙头股
                    </span>
                </div>
            </div>

            <!-- Active Loader -->
            <div id="active-loader" class="hidden flex justify-center py-20">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
            </div>

            <!-- Grids of Active Sector Stats Cards -->
            <div id="active-sectors-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <!-- Dynamically populated stats cards -->
            </div>
        </section>

        <!-- ==================== TAB 4: UPLOAD DATA ==================== -->
        <section id="tab-content-upload" class="hidden space-y-6">
            <!-- Upload Controls Card -->
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900">上传复盘图片</h2>
                        <p class="text-xs text-slate-500 mt-1">支持拖入或点击选择 A股涨停复盘的长图（.png, .jpg, .jpeg, .webp），智能识别并自动入库。</p>
                    </div>
                    <!-- Date Picker -->
                    <div class="flex items-center space-x-2 shrink-0">
                        <label for="upload-date" class="text-xs font-semibold text-slate-500 uppercase tracking-wider">复盘日期</label>
                        <input type="date" id="upload-date" class="block pl-3 pr-3 py-1.5 text-sm border border-slate-300 focus:outline-none focus:ring-red-500 focus:border-red-500 rounded-lg bg-slate-50 font-medium text-slate-900">
                    </div>
                </div>

                <!-- Drag & Drop Zone -->
                <div id="drop-zone" class="border-2 border-dashed border-slate-300 hover:border-red-400 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-8 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center min-h-[220px]">
                    <input type="file" id="file-input" class="hidden" accept=".png,.jpg,.jpeg,.webp">
                    <div class="p-4 bg-white rounded-full text-slate-400 shadow-sm mb-4 border border-slate-100">
                        <i data-lucide="cloud-upload" class="w-10 h-10 text-red-500"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-700">将复盘长图拖拽至此，或 <span class="text-red-500 hover:text-red-600">点击上传</span></p>
                    <p class="text-xxs text-slate-400 mt-2">支持常见图片格式：PNG, JPG, JPEG, WEBP</p>
                    <div id="selected-file-info" class="hidden mt-4 px-3 py-1.5 bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-center space-x-2 text-xs font-semibold">
                        <i data-lucide="file-image" class="w-4 h-4"></i>
                        <span id="selected-file-name">filename.png</span>
                    </div>
                </div>
            </div>

            <!-- Upload Progress Dashboard (Granular Phased loader) -->
            <div id="upload-progress-container" class="hidden bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div class="flex items-center space-x-4">
                    <div id="upload-loader" class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 shrink-0"></div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-900">正在处理上传数据</h3>
                        <p id="current-phase-desc" class="text-xs text-slate-400 mt-0.5">请勿关闭页面，系统正在按步骤处理中...</p>
                    </div>
                </div>

                <!-- Phase indicators -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                    <div id="phase-read" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100">
                            <i data-lucide="file-text" class="w-4 h-4"></i>
                        </div>
                        <span class="text-xs font-bold">1. 读取图片</span>
                    </div>
                    <div id="phase-ocr" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100">
                            <i data-lucide="cpu" class="w-4 h-4"></i>
                        </div>
                        <span class="text-xs font-bold">2. Gemini 识别</span>
                    </div>
                    <div id="phase-parse" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100">
                            <i data-lucide="binary" class="w-4 h-4"></i>
                        </div>
                        <span class="text-xs font-bold">3. 解析数据</span>
                    </div>
                    <div id="phase-save" class="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400">
                        <div class="phase-icon p-1.5 rounded-lg bg-slate-100">
                            <i data-lucide="database" class="w-4 h-4"></i>
                        </div>
                        <span class="text-xs font-bold">4. 数据入库</span>
                    </div>
                </div>
            </div>

            <!-- Upload Success/Status Box -->
            <div id="upload-status-box" class="hidden space-y-6">
                <!-- Success Notification Alert -->
                <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start space-x-4">
                    <div class="p-2.5 bg-emerald-500 rounded-xl text-white shadow-sm shrink-0">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </div>
                    <div class="flex-grow">
                        <h3 class="text-base font-black text-emerald-900 font-bold">解析并上传数据成功！</h3>
                        <p class="text-xs text-emerald-700 mt-1">复盘数据已完整写入 D1 数据库。该日期的复盘记录现在已即时可查。</p>
                        <div class="mt-3 flex space-x-3">
                            <button onclick="switchTab('review')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
                                立即查看复盘
                            </button>
                            <button onclick="resetUploadForm()" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold shadow-sm transition">
                                继续上传
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Statistics Summary Cards Grid -->
                <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-blue-50 rounded-xl text-blue-600 shrink-0">
                            <i data-lucide="box" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">个股总数</p>
                            <h3 id="upload-stat-stocks" class="text-xl font-bold text-slate-900 mt-1">-- <span class="text-xs font-medium text-slate-500">只</span></h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                            <i data-lucide="hash" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">板块概念</p>
                            <h3 id="upload-stat-sectors" class="text-xl font-bold text-slate-900 mt-1">-- <span class="text-xs font-medium text-slate-500">个</span></h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                            <i data-lucide="chevrons-up" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">晋级率</p>
                            <h3 id="upload-stat-upgrade" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-purple-50 rounded-xl text-purple-600 shrink-0">
                            <i data-lucide="activity" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">竞价涨幅</p>
                            <h3 id="upload-stat-bidding" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4 col-span-2 lg:col-span-1">
                        <div class="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0">
                            <i data-lucide="zap-off" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-slate-400">炸板率</p>
                            <h3 id="upload-stat-broken" class="text-xl font-bold text-slate-900 mt-1">--%</h3>
                        </div>
                    </div>
                </div>

                <!-- Collapsible Raw OCR Output Markdown -->
                <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <button onclick="toggleMarkdownCollapse()" class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 font-bold">
                        <div class="flex items-center space-x-3">
                            <div class="p-1.5 bg-slate-100 text-slate-600 rounded-lg">
                                <i data-lucide="file-text" class="w-4 h-4"></i>
                            </div>
                            <span class="text-sm font-extrabold text-slate-900">查看 Gemini OCR 原始 Markdown 识别内容</span>
                        </div>
                        <div class="p-1 text-slate-400">
                            <i id="markdown-chevron" data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i>
                        </div>
                    </button>
                    <div id="markdown-collapse" class="hidden p-6 bg-slate-950 font-mono text-slate-200 text-xs overflow-x-auto max-h-[500px]">
                        <pre id="raw-markdown-pre" class="whitespace-pre-wrap leading-relaxed"></pre>
                    </div>
                </div>
            </div>
        </section>

    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-slate-200 py-6 mt-12">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p class="text-xs text-slate-400">A-Share Market Review App • Powered by FastAPI & SQLite</p>
        </div>
    </footer>

    <!-- Vanilla Javascript Logic -->
    <script>
        // Store current active tab
        let currentTab = 'search'; // Default to search
        let summariesCache = [];
        let activeSectors = []; // Tracking active sector filters
        let activeReasons = []; // Tracking active concept reason filters
        let sectorMatchMode = 'exact'; // Exact by default
        let activeSectorsRawData = []; // Cached active sectors list

        // On document load
        document.addEventListener('DOMContentLoaded', () => {
            // Initialize Lucide Icons
            lucide.createIcons();
            // Fetch initial summaries list
            fetchSummaries();
            // Initialize upload page date and listeners
            initUploadListeners();
        });

        // Tab Switching Mechanism
        function switchTab(tab) {
            currentTab = tab;

            const btnReview = document.getElementById('tab-btn-review');
            const btnSearch = document.getElementById('tab-btn-search');
            const btnActive = document.getElementById('tab-btn-active');
            const btnUpload = document.getElementById('tab-btn-upload');

            const contentReview = document.getElementById('tab-content-review');
            const contentSearch = document.getElementById('tab-content-search');
            const contentActive = document.getElementById('tab-content-active');
            const contentUpload = document.getElementById('tab-content-upload');

            // Reset navigation active classes
            [btnReview, btnSearch, btnActive, btnUpload].forEach(btn => {
                if (btn) btn.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out text-slate-600 hover:text-slate-900";
            });
            [contentReview, contentSearch, contentActive, contentUpload].forEach(sec => {
                if (sec) sec.classList.add('hidden');
            });

            if (tab === 'review') {
                btnReview.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
                contentReview.classList.remove('hidden');
            } else if (tab === 'search') {
                btnSearch.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
                contentSearch.classList.remove('hidden');
            } else if (tab === 'active') {
                btnActive.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
                contentActive.classList.remove('hidden');
                // Trigger Active Sectors list load on initial tab enter
                if (activeSectorsRawData.length === 0) {
                    loadActiveSectors("30");
                }
            } else if (tab === 'upload') {
                btnUpload.className = "px-4 py-2 text-sm font-semibold rounded-lg flex items-center space-x-2 transition duration-150 ease-in-out bg-white text-slate-900 shadow-sm";
                contentUpload.classList.remove('hidden');
                resetUploadForm();
            }
            lucide.createIcons();
        }

        // Toggle Accordion Collapse/Expand
        function toggleAccordion(sectorId) {
            const container = document.getElementById(\`sector-collapse-\${sectorId}\`);
            const icon = document.getElementById(\`sector-chevron-\${sectorId}\`);

            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                icon.setAttribute('data-lucide', 'chevron-up');
            } else {
                container.classList.add('hidden');
                icon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons();
        }

        // Toggle Stock Accordion Collapse/Expand
        function toggleStockAccordion(code) {
            const container = document.getElementById(\`stock-collapse-\${code}\`);
            const icon = document.getElementById(\`stock-chevron-\${code}\`);
            if (!container || !icon) return;

            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                icon.setAttribute('data-lucide', 'chevron-up');
            } else {
                container.classList.add('hidden');
                icon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons();
        }

        // Toggle Sector Search Matching Mode
        function setMatchMode(mode) {
            if (sectorMatchMode === mode) return;
            sectorMatchMode = mode;

            const btnExact = document.getElementById('btn-mode-exact');
            const btnFuzzy = document.getElementById('btn-mode-fuzzy');

            if (mode === 'exact') {
                btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
                btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
            } else {
                btnFuzzy.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 bg-white text-slate-855 shadow-sm";
                btnExact.className = "px-2 py-0.5 text-xxs font-bold rounded-md transition duration-150 text-slate-500 hover:text-slate-800";
            }

            // Re-execute search if sector tags are active
            if (activeSectors.length > 0) {
                performSearch();
            }
        }

        // Handle enter key in sector input
        function handleSectorKey(event) {
            if (event.key === 'Enter') {
                addSectorTag();
            }
        }

        // Add sector tag to activeSectors
        function addSectorTag() {
            const input = document.getElementById('sector-filter-input');
            const sectorName = input.value.trim();
            if (!sectorName) return;

            if (!activeSectors.includes(sectorName)) {
                activeSectors.push(sectorName);
                renderSectorTags();
                performSearch(); // Automatically re-run query on tag additions
            }
            input.value = '';
        }

        // Remove sector tag from activeSectors
        function removeSectorTag(sectorName) {
            activeSectors = activeSectors.filter(sec => sec !== sectorName);
            renderSectorTags();
            performSearch(); // Automatically re-run query on tag removal
        }

        // Render tags container
        function renderSectorTags() {
            const container = document.getElementById('sector-tags-container');
            container.innerHTML = '';

            activeSectors.forEach(sectorName => {
                const span = document.createElement('span');
                span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 shadow-sm";
                span.innerHTML = \`
                    <span>\${sectorName}</span>
                    <button onclick="removeSectorTag('\${sectorName.replace(/'/g, "\\\\'")}')" class="ml-1.5 text-red-500 hover:text-red-900 focus:outline-none">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                \`;
                container.appendChild(span);
            });
            lucide.createIcons();
        }

        // Handle enter key in reason input
        function handleReasonKey(event) {
            if (event.key === 'Enter') {
                addReasonTag();
            }
        }

        // Add reason tag to activeReasons
        function addReasonTag() {
            const input = document.getElementById('reason-filter-input');
            const reasonName = input.value.trim();
            if (!reasonName) return;

            if (!activeReasons.includes(reasonName)) {
                activeReasons.push(reasonName);
                renderReasonTags();
                performSearch(); // Automatically re-run query on tag additions
            }
            input.value = '';
        }

        // Remove reason tag from activeReasons
        function removeReasonTag(reasonName) {
            activeReasons = activeReasons.filter(res => res !== reasonName);
            renderReasonTags();
            performSearch(); // Automatically re-run query on tag removal
        }

        // Render reasons tags container
        function renderReasonTags() {
            const container = document.getElementById('reason-tags-container');
            container.innerHTML = '';

            activeReasons.forEach(reasonName => {
                const span = document.createElement('span');
                span.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm";
                span.innerHTML = \`
                    <span>\${reasonName}</span>
                    <button onclick="removeReasonTag('\${reasonName.replace(/'/g, "\\\\'")}')" class="ml-1.5 text-indigo-500 hover:text-indigo-900 focus:outline-none">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                \`;
                container.appendChild(span);
            });
            lucide.createIcons();
        }

        // Deep Link Click Handlers for Interactive Cards Cross-linking
        function deepLinkStock(stockName) {
            switchTab('search');
            document.getElementById('search-input').value = stockName;
            // Clear any active sector tags or reason tags to perform clean lookup
            activeSectors = [];
            activeReasons = [];
            renderSectorTags();
            renderReasonTags();
            performSearch();
        }

        function deepLinkSector(sectorName) {
            switchTab('search');
            document.getElementById('search-input').value = '';
            setMatchMode('exact');
            activeSectors = [sectorName];
            activeReasons = [];
            renderSectorTags();
            renderReasonTags();
            performSearch();
        }

        function deepLinkDate(dateStr) {
            switchTab('review');
            document.getElementById('date-select').value = dateStr;
            loadDailyDetails(dateStr);
        }

        // 1. Fetch available daily summaries dates
        async function fetchSummaries() {
            try {
                const response = await fetch('/api/daily-summaries');
                if (!response.ok) throw new Error('API server returned error code');
                const data = await response.json();

                summariesCache = data;
                populateDateSelect(data);

                if (data.length > 0) {
                    // Load details of the latest date automatically
                    const latestDate = data[0].date;
                    document.getElementById('date-select').value = latestDate;
                    loadDailyDetails(latestDate);
                }
            } catch (err) {
                console.error('Error fetching summaries:', err);
                alert('获取每日复盘汇总列表失败，请检查后端运行状态。');
            }
        }

        // Populate Date Select Options
        function populateDateSelect(data) {
            const select = document.getElementById('date-select');
            select.innerHTML = '';

            if (data.length === 0) {
                select.innerHTML = '<option value="">暂无数据</option>';
                return;
            }

            data.forEach((item, index) => {
                const option = document.createElement('option');
                option.value = item.date;
                option.textContent = item.date + (index === 0 ? ' (最新)' : '');
                select.appendChild(option);
            });
        }

        // 2. Load daily details (Sectors & Stocks) for picked date
        async function loadDailyDetails(date) {
            if (!date) return;

            const loader = document.getElementById('review-loader');
            const accordionContainer = document.getElementById('sectors-accordion');

            loader.classList.remove('hidden');
            accordionContainer.innerHTML = '';

            try {
                const response = await fetch(\`/api/daily-details/\${date}\`);
                if (!response.ok) throw new Error('API returned error');
                const data = await response.json();

                // Update summary cards
                const summary = data.summary;
                document.getElementById('stat-count').innerHTML = \`\${summary.stock_count || '--'} <span class="text-xs font-medium text-slate-400">只</span>\`;
                document.getElementById('stat-upgrade').textContent = summary.upgrade_rate !== null ? \`\${summary.upgrade_rate}%\` : '--%';
                document.getElementById('stat-broken').textContent = summary.limit_broken_rate !== null ? \`\${summary.limit_broken_rate}%\` : '--%';
                document.getElementById('stat-bidding').textContent = summary.bidding_increase_rate !== null ? \`\${summary.bidding_increase_rate}%\` : '--%';

                // Render Sector Accordion List (matching 2026-01-12.md documentation style)
                renderSectorsAccordion(data.sectors);
            } catch (err) {
                console.error('Error fetching details:', err);
                accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-500">无法加载此日期的详细复盘数据</div>';
            } finally {
                loader.classList.add('hidden');
            }
        }

        // On select input change
        function onDateChanged(date) {
            loadDailyDetails(date);
        }

        // Custom Helper to color-code the Status columns
        function getStatusBadgeStyle(status) {
            if (!status) return 'bg-slate-100 text-slate-600';
            const s = status.trim();
            if (s.includes('首板')) {
                return 'bg-blue-50 text-blue-700 border border-blue-100';
            } else if (s.includes('二')) {
                return 'bg-rose-50 text-rose-700 border border-rose-100';
            } else if (s.includes('三') || s.includes('四') || s.includes('五') || s.includes('六') || s.includes('七') || s.includes('高度板')) {
                return 'bg-red-100 text-red-800 border border-red-200 font-bold';
            } else if (s.includes('T') || s.includes('一字')) {
                return 'bg-amber-50 text-amber-700 border border-amber-100';
            }
            return 'bg-slate-50 text-slate-600 border border-slate-100';
        }

        // Render Sectors Accordion (Document-style, collapsible matching 2026-01-12.md)
        function renderSectorsAccordion(sectors) {
            const accordionContainer = document.getElementById('sectors-accordion');
            accordionContainer.innerHTML = '';

            if (!sectors || sectors.length === 0) {
                accordionContainer.innerHTML = '<div class="text-center py-10 text-slate-400">当日暂未捕获板块分类</div>';
                return;
            }

            sectors.forEach((sector, index) => {
                // Ignore sectors with zero stocks to keep grid tidy
                if (sector.stocks.length === 0) return;

                const accordionItem = document.createElement('div');
                accordionItem.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";

                // Generate table rows for stocks inside this sector
                let stockRows = '';
                sector.stocks.forEach(stock => {
                    const statusStyle = getStatusBadgeStyle(stock.status);

                    stockRows += \`
                        <tr class="hover:bg-slate-50/50 transition-colors">
                            <td class="px-6 py-3 text-sm whitespace-nowrap">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold \${statusStyle}">
                                    \${stock.status || '涨停'}
                                </span>
                            </td>
                            <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">\${stock.code}</td>
                            <td class="px-6 py-3 text-sm font-bold text-slate-900 whitespace-nowrap hover:text-red-500 cursor-pointer" onclick="deepLinkStock('\${stock.name}')">\${stock.name}</td>
                            <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">\${stock.time || '--:--'}</td>
                            <td class="px-6 py-3 text-sm text-slate-600">\${stock.concept_reason || '--'}</td>
                        </tr>
                    \`;
                });

                const isHidden = "hidden"; // Collapsed by default, user clicks to fold/unfold

                accordionItem.innerHTML = \`
                    <!-- Accordion Header -->
                    <button onclick="toggleAccordion(\${sector.id})" class="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 font-bold">
                        <div class="flex items-center space-x-3 truncate">
                            <div class="p-1.5 bg-red-50 text-red-500 rounded-lg">
                                <i data-lucide="hash" class="w-4 h-4"></i>
                            </div>
                            <div class="truncate">
                                <span class="text-base font-extrabold text-slate-900">\${sector.name}</span>
                                \${sector.description ? \`<span class="text-xs text-slate-400 ml-3 font-medium truncate hidden sm:inline-block">\${sector.description}</span>\` : ''}
                            </div>
                        </div>
                        <div class="flex items-center space-x-4 shrink-0">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">
                                \${sector.stocks.length} 只个股
                            </span>
                            <div class="p-1 text-slate-400">
                                <i id="sector-chevron-\${sector.id}" data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i>
                            </div>
                        </div>
                    </button>

                    <!-- Accordion Collapsible Table -->
                    <div id="sector-collapse-\${sector.id}" class="\${isHidden} border-t border-slate-100 overflow-x-auto">
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
                            <tbody class="divide-y divide-slate-100 bg-white">
                                \${stockRows}
                            </tbody>
                        </table>
                    </div>
                \`;
                accordionContainer.appendChild(accordionItem);
            });
            lucide.createIcons();
        }

        // 3. Search functionality
        function handleSearchKey(event) {
            if (event.key === 'Enter') {
                performSearch();
            }
        }

        async function performSearch() {
            const query = document.getElementById('search-input').value.trim();

            // Allow querying when there is either text, active sectors, or active concept reason tags
            if (!query && activeSectors.length === 0 && activeReasons.length === 0) {
                // Clear state and return
                document.getElementById('search-loader').classList.add('hidden');
                document.getElementById('search-empty-state').classList.remove('hidden');
                document.getElementById('search-results-container').classList.add('hidden');
                document.getElementById('search-results-body').innerHTML = '';
                return;
            }

            const loader = document.getElementById('search-loader');
            const emptyState = document.getElementById('search-empty-state');
            const resultsContainer = document.getElementById('search-results-container');
            const resultsBody = document.getElementById('search-results-body');

            loader.classList.remove('hidden');
            emptyState.classList.add('hidden');
            resultsContainer.classList.add('hidden');
            resultsBody.innerHTML = '';

            try {
                // Build dynamic URL query parameters
                let url = \`/api/search?\`;
                const params = [];
                if (query) params.push(\`q=\${encodeURIComponent(query)}\`);
                if (activeSectors.length > 0) {
                    activeSectors.forEach(sec => {
                        params.push(\`sectors=\${encodeURIComponent(sec)}\`);
                    });
                }
                if (activeReasons.length > 0) {
                    activeReasons.forEach(res => {
                        params.push(\`concept_reasons=\${encodeURIComponent(res)}\`);
                    });
                }
                params.push(\`sector_match_mode=\${sectorMatchMode}\`);
                url += params.join('&');

                const response = await fetch(url);
                if (!response.ok) throw new Error('Search request failed');
                const data = await response.json();

                if (data.length === 0) {
                    emptyState.classList.remove('hidden');
                    document.getElementById('search-result-count').textContent = '找到 0 条历史纪录';
                } else {
                    // Formulate dynamic results header string representing exact filters used
                    let displayTitle = query ? \`“\${query}”\` : '';
                    if (activeSectors.length > 0) {
                        displayTitle += (displayTitle ? ' + ' : '') + \`板块 [\${activeSectors.join(' & ')}]\`;
                    }
                    if (activeReasons.length > 0) {
                        displayTitle += (displayTitle ? ' + ' : '') + \`动因 [\${activeReasons.join(' & ')}]\`;
                    }
                    displayTitle += ' 的历史涨停记录';

                    // 1. Group occurrences by stock code
                    const grouped = {};
                    data.forEach(item => {
                        if (!grouped[item.code]) {
                            grouped[item.code] = {
                                code: item.code,
                                name: item.name,
                                history: []
                            };
                        }
                        grouped[item.code].history.push(item);
                    });
                    const stockList = Object.values(grouped);

                    // 2. Sort stock histories by date descending (latest limit-up first)
                    stockList.forEach(stock => {
                        stock.history.sort((a, b) => b.date.localeCompare(a.date));
                    });

                    // 3. Sort stocks descending by their latest occurrence date (most relevant stocks first)
                    stockList.sort((a, b) => b.history[0].date.localeCompare(a.history[0].date));

                    document.getElementById('search-result-title').textContent = displayTitle;
                    document.getElementById('search-result-count').textContent = \`找到 \${stockList.length} 家个股（共 \${data.length} 条历史纪录）\`;

                    // 4. Generate & append the accordion card markup
                    stockList.forEach(stock => {
                        const latestOccurrence = stock.history[0];
                        const stockBlock = document.createElement('div');
                        stockBlock.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-150";

                        // Generate history table rows
                        let historyRows = '';
                        stock.history.forEach(item => {
                            const statusStyle = getStatusBadgeStyle(item.status);
                            historyRows += \`
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="px-6 py-3 text-sm whitespace-nowrap text-slate-700 font-semibold font-mono hover:text-red-500 cursor-pointer" onclick="deepLinkDate('\${item.date}')">\${item.date}</td>
                                    <td class="px-6 py-3 text-sm whitespace-nowrap">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold \${statusStyle}">
                                            \${item.status || '涨停'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">\${item.time || '--:--'}</td>
                                    <td class="px-6 py-3 text-sm whitespace-nowrap hover:text-red-500 cursor-pointer" onclick="deepLinkSector('\${item.sector_name || '其他概念'}')">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            \${item.sector_name || '其他概念'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-3 text-sm text-slate-600 max-w-sm truncate" title="\${item.concept_reason || ''}">\${item.concept_reason || '--'}</td>
                                </tr>
                            \`;
                        });

                        const statusStyle = getStatusBadgeStyle(latestOccurrence.status);

                        stockBlock.innerHTML = \`
                            <!-- Accordion Header Button -->
                            <button onclick="toggleStockAccordion('\${stock.code}')" class="w-full px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/50 transition-colors text-left border-b border-slate-100 gap-4">
                                <div class="flex items-center space-x-3 truncate">
                                    <div class="p-2 bg-red-50 text-red-500 rounded-lg shrink-0">
                                        <i data-lucide="trending-up" class="w-4 h-4"></i>
                                    </div>
                                    <div class="truncate">
                                        <span class="text-base font-extrabold text-slate-900">\${stock.name}</span>
                                        <span class="text-xs text-slate-400 ml-2 font-mono font-medium">\${stock.code}</span>
                                    </div>
                                </div>
                                <div class="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                                    <div class="text-xs text-slate-500">
                                        最新：<span class="font-semibold text-slate-700 font-mono">\${latestOccurrence.date}</span>
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold \${statusStyle} ml-1">
                                            \${latestOccurrence.status || '涨停'}
                                        </span>
                                    </div>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                        \${stock.history.length} 次记录
                                    </span>
                                    <div class="p-1 text-slate-400">
                                        <i id="stock-chevron-\${stock.code}" data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-150"></i>
                                    </div>
                                </div>
                            </button>

                            <!-- Collapsible Sub-table of Historical Occurrences -->
                            <div id="stock-collapse-\${stock.code}" class="hidden border-t border-slate-100 overflow-x-auto bg-slate-50/30">
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
                                    <tbody class="divide-y divide-slate-100 bg-white">
                                        \${historyRows}
                                    </tbody>
                                </table>
                            </div>
                        \`;
                        resultsBody.appendChild(stockBlock);
                    });

                    resultsContainer.classList.remove('hidden');
                    lucide.createIcons();
                }
            } catch (err) {
                console.error('Error performing search:', err);
                alert('查询出错，请重试或检查后台服务。');
                emptyState.classList.remove('hidden');
            } finally {
                loader.classList.add('hidden');
            }
        }

        // ==================== TAB 3: ACTIVE SECTORS ====================

        // Trigger loading active sectors from API
        async function loadActiveSectors(scopeDays) {
            const loader = document.getElementById('active-loader');
            const grid = document.getElementById('active-sectors-grid');

            loader.classList.remove('hidden');
            grid.innerHTML = '';
            activeSectorsRawData = [];

            try {
                const response = await fetch(\`/api/active-sectors?days=\${scopeDays}\`);
                if (!response.ok) throw new Error('API server failed');
                const data = await response.json();

                activeSectorsRawData = data;
                renderActiveSectors(data);
            } catch (err) {
                console.error('Error loading active sectors:', err);
                grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-500">计算板块活跃热度失败</div>';
            } finally {
                loader.classList.add('hidden');
            }
        }

        // On active scope dropdown change
        function onActiveScopeChanged(scope) {
            // Reset active search input on reload
            document.getElementById('active-search-input').value = '';
            loadActiveSectors(scope);
        }

        // Client-side text filter on sectors cards
        function onActiveSearchInput(text) {
            const trimmed = text.trim().toLowerCase();
            if (!trimmed) {
                renderActiveSectors(activeSectorsRawData);
                return;
            }
            const filtered = activeSectorsRawData.filter(sec =>
                sec.name.toLowerCase().includes(trimmed) ||
                (sec.description && sec.description.toLowerCase().includes(trimmed))
            );
            renderActiveSectors(filtered);
        }

        // Render Active Sectors Grid Cards
        function renderActiveSectors(sectors) {
            const grid = document.getElementById('active-sectors-grid');
            grid.innerHTML = '';

            if (!sectors || sectors.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400">没有找到符合筛选条件的活跃板块</div>';
                return;
            }

            sectors.forEach(sector => {
                const card = document.createElement('div');
                card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-205 flex flex-col justify-between";

                // Generate dragon head leaders badges
                let leadersMarkup = '';
                if (sector.leaders && sector.leaders.length > 0) {
                    leadersMarkup = \`
                        <div class="mt-4 pt-4 border-t border-slate-100">
                            <span class="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">领涨龙头股 (Dragon Head Leaders)</span>
                            <div class="flex flex-wrap gap-1.5">
                                \${sector.leaders.map(ld => \`
                                    <button onclick="deepLinkStock('\${ld.name}')" class="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900 border border-red-100 transition-colors font-sans">
                                        <span class="w-1 h-1 bg-red-500 rounded-full mr-1.5 shrink-0"></span>
                                        <span>\${ld.name}</span>
                                        <span class="text-slate-400 font-mono ml-1 font-medium">(\${ld.count}次)</span>
                                    </button>
                                \`).join('')}
                            </div>
                        </div>
                    \`;
                } else {
                    leadersMarkup = \`
                        <div class="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
                            分析周期内暂无主线龙头个股
                        </div>
                    \`;
                }

                card.innerHTML = \`
                    <div class="space-y-3 flex-grow">
                        <!-- Top header -->
                        <div class="flex items-start justify-between gap-2">
                            <button onclick="deepLinkSector('\${sector.name}')" class="text-lg font-black text-slate-900 hover:text-red-500 transition-colors text-left font-sans truncate font-bold">
                                \${sector.name}
                            </button>
                            <button onclick="deepLinkDate('\${sector.latest_date}')" class="inline-flex items-center px-2 py-0.5 rounded text-xxs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0">
                                活跃：\${sector.latest_date.substring(5)}
                            </button>
                        </div>

                        <!-- Spark Gauges / Stats line -->
                        <div class="flex items-center space-x-4 text-xs font-bold">
                            <div class="text-blue-600 flex items-center space-x-1">
                                <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                                <span>上榜 \${sector.appearances} 天</span>
                            </div>
                            <div class="text-indigo-600 flex items-center space-x-1">
                                <i data-lucide="box" class="w-3.5 h-3.5"></i>
                                <span>累计 \${sector.total_stocks_count} 只涨停</span>
                            </div>
                        </div>

                        <!-- Catalyst description -->
                        <p class="text-xs text-slate-500 leading-relaxed font-normal line-clamp-3" title="\${sector.description || ''}">
                            \${sector.description || '当前周期暂未捕获详细概念催化驱动。'}
                        </p>
                    </div>

                    \${leadersMarkup}
                \`;
                grid.appendChild(card);
            });
            lucide.createIcons();
        }

        // ==================== UPLOAD TAB LOGIC ====================

        // Initialize upload listeners and default date
        function initUploadListeners() {
            const uploadDateInput = document.getElementById('upload-date');
            if (uploadDateInput) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                uploadDateInput.value = year + '-' + month + '-' + day;
            }

            const dropZone = document.getElementById('drop-zone');
            const fileInput = document.getElementById('file-input');
            const selectedFileSection = document.getElementById('selected-file-info');
            const selectedFileName = document.getElementById('selected-file-name');

            if (!dropZone || !fileInput) return;

            // Click drop zone to select file
            dropZone.addEventListener('click', () => {
                fileInput.click();
            });

            // Handle file input change
            fileInput.addEventListener('change', (e) => {
                handleUploadedFiles(e.target.files);
            });

            // Drag and drop events
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.add('border-red-400', 'bg-red-50/20');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.remove('border-red-400', 'bg-red-50/20');
                }, false);
            });

            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                handleUploadedFiles(files);
            }, false);
        }

        // Handle uploaded file validation and date auto-extraction
        function handleUploadedFiles(files) {
            if (files.length === 0) return;
            const file = files[0];

            const selectedFileSection = document.getElementById('selected-file-info');
            const selectedFileName = document.getElementById('selected-file-name');

            if (selectedFileName && selectedFileSection) {
                selectedFileName.textContent = file.name;
                selectedFileSection.classList.remove('hidden');
            }

            // Extract date from filename if present
            const extractedDate = extractDateFromFilename(file.name);
            if (extractedDate) {
                const uploadDateInput = document.getElementById('upload-date');
                if (uploadDateInput) {
                    uploadDateInput.value = extractedDate;
                }
            }

            // Start upload file pipeline
            const dateVal = document.getElementById('upload-date').value;
            uploadFile(file, dateVal);
        }

        // Try extracting YYYY-MM-DD, YYYYMMDD, or YYYY_MM_DD from string
        function extractDateFromFilename(filename) {
            const match1 = filename.match(/(\\d{4})-(\\d{2})-(\\d{2})/);
            if (match1) return match1[1] + '-' + match1[2] + '-' + match1[3];
            const match2 = filename.match(/(\\d{4})_(\\d{2})_(\\d{2})/);
            if (match2) return match2[1] + '-' + match2[2] + '-' + match2[3];
            const match3 = filename.match(/(\\d{4})(\\d{2})(\\d{2})/);
            if (match3) return match3[1] + '-' + match3[2] + '-' + match3[3];
            return null;
        }

        // Update active UI indicator phase for granular process visualization
        function setUploadPhase(phase) {
            const phases = ['read', 'ocr', 'parse', 'save'];
            const phaseNames = {
                'read': '正在读取并上传图片...',
                'ocr': 'Gemini 智能识别中 (可能需要约 10-15 秒)...',
                'parse': '正在解析并结构化复盘数据...',
                'save': '正在将复盘结果安全写入 D1 数据库...'
            };

            const descEl = document.getElementById('current-phase-desc');
            if (descEl) {
                descEl.textContent = phaseNames[phase] || '处理中...';
            }

            phases.forEach(p => {
                const el = document.getElementById('phase-' + p);
                if (!el) return;
                const iconContainer = el.querySelector('.phase-icon');

                if (p === phase) {
                    // Active Phase State
                    el.className = "flex items-center space-x-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 animate-pulse font-semibold shadow-sm";
                    if (iconContainer) iconContainer.className = "phase-icon p-1.5 rounded-lg bg-red-100 text-red-500";
                } else if (phases.indexOf(p) < phases.indexOf(phase)) {
                    // Completed Phase State
                    el.className = "flex items-center space-x-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold shadow-sm";
                    if (iconContainer) iconContainer.className = "phase-icon p-1.5 rounded-lg bg-emerald-100 text-emerald-500";
                    const icon = iconContainer.querySelector('i');
                    if (icon) {
                        icon.setAttribute('data-lucide', 'check');
                    }
                } else {
                    // Pending Phase State
                    el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                    if (iconContainer) iconContainer.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
                }
            });
            lucide.createIcons();
        }

        // Main function to upload image and trigger backend pipeline
        async function uploadFile(file, dateStr) {
            if (!file || !dateStr) {
                alert('请提供有效的图片文件和复盘日期！');
                return;
            }

            const progressContainer = document.getElementById('upload-progress-container');
            const statusBox = document.getElementById('upload-status-box');
            const dropZone = document.getElementById('drop-zone');

            // Set UI state to Loading
            progressContainer.classList.remove('hidden');
            statusBox.classList.add('hidden');
            dropZone.style.pointerEvents = 'none';
            dropZone.classList.add('opacity-50');

            // Phase 1: Uploading/Reading
            setUploadPhase('read');

            // Periodically transition to Gemini OCR phase if API is taking some time
            const ocrTimeout = setTimeout(() => {
                setUploadPhase('ocr');
            }, 1200);

            const formData = new FormData();
            formData.append('image', file);
            formData.append('date', dateStr);

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                clearTimeout(ocrTimeout);

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error || '服务器处理出错');
                }

                // Phase 3: Parsing
                setUploadPhase('parse');
                await new Promise(resolve => setTimeout(resolve, 800));

                // Phase 4: Saving
                setUploadPhase('save');
                await new Promise(resolve => setTimeout(resolve, 600));

                const data = await response.json();

                // Hydrate stats boxes
                document.getElementById('upload-stat-stocks').innerHTML = (data.summary.stock_count || 0) + ' <span class="text-xs font-medium text-slate-500">只</span>';
                document.getElementById('upload-stat-sectors').innerHTML = (data.summary.sector_count || 0) + ' <span class="text-xs font-medium text-slate-500">个</span>';
                document.getElementById('upload-stat-upgrade').textContent = data.summary.upgrade_rate !== null ? data.summary.upgrade_rate + '%' : '--%';
                document.getElementById('upload-stat-bidding').textContent = data.summary.bidding_increase_rate !== null ? data.summary.bidding_increase_rate + '%' : '--%';
                document.getElementById('upload-stat-broken').textContent = data.summary.limit_broken_rate !== null ? data.summary.limit_broken_rate + '%' : '--%';

                // Raw markdown preview area
                document.getElementById('raw-markdown-pre').textContent = data.raw_markdown || '无原始 Markdown 识别内容';

                // Display success
                progressContainer.classList.add('hidden');
                statusBox.classList.remove('hidden');

                // Refresh daily review dropdown options in Tab 2 instantly
                await fetchSummaries();

                // Select the uploaded date in Tab 2 select menu automatically
                const dateSelect = document.getElementById('date-select');
                if (dateSelect) {
                    dateSelect.value = dateStr;
                }

            } catch (err) {
                clearTimeout(ocrTimeout);
                console.error('OCR pipeline failed:', err);
                alert('处理上传文件失败：' + err.message);
                progressContainer.classList.add('hidden');
                resetUploadForm();
            } finally {
                dropZone.style.pointerEvents = 'auto';
                dropZone.classList.remove('opacity-50');
            }
        }

        // Reset file upload form to initial clean state
        function resetUploadForm() {
            const fileInput = document.getElementById('file-input');
            if (fileInput) fileInput.value = '';

            const fileInfo = document.getElementById('selected-file-info');
            if (fileInfo) fileInfo.classList.add('hidden');

            const statusBox = document.getElementById('upload-status-box');
            if (statusBox) statusBox.classList.add('hidden');

            const progressContainer = document.getElementById('upload-progress-container');
            if (progressContainer) progressContainer.classList.add('hidden');

            // Reset step icons and text classes
            ['read', 'ocr', 'parse', 'save'].forEach(p => {
                const el = document.getElementById('phase-' + p);
                if (el) {
                    el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                    const iconContainer = el.querySelector('.phase-icon');
                    if (iconContainer) iconContainer.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
                }
            });

            // Reset phase icons
            const readIcon = document.querySelector('#phase-read i');
            if (readIcon) readIcon.setAttribute('data-lucide', 'file-text');
            const ocrIcon = document.querySelector('#phase-ocr i');
            if (ocrIcon) ocrIcon.setAttribute('data-lucide', 'cpu');
            const parseIcon = document.querySelector('#phase-parse i');
            if (parseIcon) parseIcon.setAttribute('data-lucide', 'binary');
            const saveIcon = document.querySelector('#phase-save i');
            if (saveIcon) saveIcon.setAttribute('data-lucide', 'database');

            lucide.createIcons();
        }

        // Toggle visibility of the Raw markdown box
        function toggleMarkdownCollapse() {
            const mdContainer = document.getElementById('markdown-collapse');
            const icon = document.getElementById('markdown-chevron');
            if (!mdContainer || !icon) return;

            if (mdContainer.classList.contains('hidden')) {
                mdContainer.classList.remove('hidden');
                icon.setAttribute('data-lucide', 'chevron-up');
            } else {
                mdContainer.classList.add('hidden');
                icon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons();
        }
    </script>
</body>
</html>
`;
