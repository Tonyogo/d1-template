import { api } from '../api.js';

export class UploadTab {
    constructor(app) {
        this.app = app;
        this.initDOM();
    }

    initDOM() {
        this.dateInput = document.getElementById('upload-date');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.selectedFileInfo = document.getElementById('selected-file-info');
        this.selectedFileName = document.getElementById('selected-file-name');
        this.progressContainer = document.getElementById('upload-progress-container');
        this.phaseDesc = document.getElementById('current-phase-desc');
        this.statusBox = document.getElementById('upload-status-box');

        this.statStocks = document.getElementById('upload-stat-stocks');
        this.statSectors = document.getElementById('upload-stat-sectors');
        this.statUpgrade = document.getElementById('upload-stat-upgrade');
        this.statBidding = document.getElementById('upload-stat-bidding');
        this.statBroken = document.getElementById('upload-stat-broken');
        this.rawMarkdownPre = document.getElementById('raw-markdown-pre');

        this.viewReviewBtn = document.getElementById('view-review-btn');
        this.continueUploadBtn = document.getElementById('continue-upload-btn');
        this.markdownToggleBtn = document.getElementById('markdown-toggle-btn');
        this.markdownCollapse = document.getElementById('markdown-collapse');
        this.markdownChevron = document.getElementById('markdown-chevron');

        // 批量控制台 DOM 节点
        this.batchConsoleContainer = document.getElementById('batch-console-container');
        this.batchClearBtn = document.getElementById('batch-clear-btn');
        this.batchStartBtn = document.getElementById('batch-start-btn');
        this.batchTbody = document.getElementById('batch-tbody');

        this.batchQueue = [];
        this.isProcessing = false;

        // 初始化默认日期 (当天)
        this.dateInput.value = this.getTodayDateString();

        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isProcessing) return;
                this.dropZone.classList.add('border-red-400', 'bg-red-50/20');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropZone.classList.remove('border-red-400', 'bg-red-50/20');
            });
        });

        this.dropZone.addEventListener('drop', (e) => {
            if (this.isProcessing) return;
            this.handleFiles(e.dataTransfer.files);
        });

        this.viewReviewBtn.addEventListener('click', () => {
            this.app.deepLinkDate(this.dateInput.value);
        });
        this.continueUploadBtn.addEventListener('click', () => this.resetForm());
        this.markdownToggleBtn.addEventListener('click', () => this.toggleMarkdown());

        this.batchClearBtn.addEventListener('click', () => this.clearBatchQueue());
        this.batchStartBtn.addEventListener('click', () => this.startBatchPipeline());
    }

    getTodayDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    toggleMarkdown() {
        this.markdownCollapse.classList.toggle('hidden');
        const chevron = document.getElementById('markdown-chevron');
        if (chevron) {
            chevron.classList.toggle('rotate-180');
        }
    }

    handleFiles(files) {
        if (files.length === 0) return;
        if (this.isProcessing) {
            alert('批量处理队列运行中，请耐心等待其结束后再上传新图片！');
            return;
        }

        // 如果当前批量队列不为空，则即使只选择/拖拽了 1 张图，也应该加入批量队列，而不是走单图上传
        if (files.length > 1 || this.batchQueue.length > 0) {
            this.selectedFileInfo.classList.add('hidden');
            this.progressContainer.classList.add('hidden');
            this.statusBox.classList.add('hidden');

            this.setupBatchQueue(files);
        } else {
            // 纯单图上传流程
            const file = files[0];
            this.selectedFileName.textContent = file.name;
            this.selectedFileInfo.classList.remove('hidden');
            this.batchConsoleContainer.classList.add('hidden');

            const extDate = this.extractDate(file.name);
            if (extDate && this.isValidDate(extDate)) {
                this.dateInput.value = extDate;
            }
            this.uploadFile(file, this.dateInput.value);
        }
    }

    setupBatchQueue(files) {
        const newTasks = Array.from(files).map((file, idx) => {
            const extDate = this.extractDate(file.name);
            // 如果提取不出日期，或者提取出来的日期不合法，则默认当天
            const defaultDate = (extDate && this.isValidDate(extDate)) ? extDate : this.getTodayDateString();

            return {
                id: `task-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
                file: file,
                date: defaultDate,
                status: 'pending',
                error: null,
                r2Url: null,
                result: null
            };
        });

        this.batchQueue = [...this.batchQueue, ...newTasks];
        this.batchConsoleContainer.classList.remove('hidden');
        this.renderBatchTable();
    }

    renderBatchTable() {
        this.batchTbody.innerHTML = '';
        this.batchQueue.forEach((task, idx) => {
            const tr = this.renderTaskRow(task, idx);
            this.batchTbody.appendChild(tr);
        });
        lucide.createIcons();
    }

    renderTaskRow(task, idx) {
        const tr = document.createElement('tr');
        tr.id = `row-${task.id}`;
        tr.className = "hover:bg-slate-50/50 transition duration-150";

        // 1. 序号
        const tdIndex = document.createElement('td');
        tdIndex.className = "px-4 py-3.5 text-xs text-slate-500 font-medium";
        tdIndex.textContent = idx + 1;
        tr.appendChild(tdIndex);

        // 2. 图片名称
        const tdName = document.createElement('td');
        tdName.className = "px-4 py-3.5 text-sm font-semibold text-slate-800 max-w-xs truncate";
        tdName.title = task.file.name;
        tdName.textContent = task.file.name;
        tr.appendChild(tdName);

        // 3. 日期 (双击可修改)
        const tdDate = document.createElement('td');
        tdDate.className = "px-4 py-3.5 text-sm font-medium text-slate-600";

        const dateText = document.createElement('span');
        dateText.className = "cursor-pointer border-b border-dashed border-slate-300 hover:text-red-500 transition px-1";
        dateText.textContent = task.date;
        dateText.title = "双击修改日期";

        // 双击修改逻辑
        dateText.addEventListener('dblclick', () => {
            if (this.isProcessing) return; // 处理中不允许修改日期

            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = "px-1.5 py-0.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-red-500";
            dateInput.value = task.date;

            const saveDate = () => {
                const newVal = dateInput.value;
                if (this.isValidDate(newVal)) {
                    task.date = newVal;
                    dateText.textContent = newVal;
                } else {
                    alert('请输入有效的日期！格式：YYYY-MM-DD');
                }
                if (dateInput.parentNode === tdDate) {
                    tdDate.replaceChild(dateText, dateInput);
                }
            };

            dateInput.addEventListener('blur', saveDate);
            dateInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveDate();
            });

            tdDate.replaceChild(dateInput, dateText);
            dateInput.focus();
        });

        tdDate.appendChild(dateText);
        tr.appendChild(tdDate);

        // 4. 文件大小
        const tdSize = document.createElement('td');
        tdSize.className = "px-4 py-3.5 text-xs text-slate-500";
        tdSize.textContent = this.formatFileSize(task.file.size);
        tr.appendChild(tdSize);

        // 5. 解析状态
        const tdStatus = document.createElement('td');
        tdStatus.className = "px-4 py-3.5 text-xs font-semibold";
        tdStatus.innerHTML = this.getStatusBadgeHTML(task);
        tr.appendChild(tdStatus);

        // 6. 操作 (移除单个任务)
        const tdAction = document.createElement('td');
        tdAction.className = "px-4 py-3.5 text-right text-xs";

        const deleteBtn = document.createElement('button');
        deleteBtn.className = "text-slate-400 hover:text-red-500 transition p-1";
        deleteBtn.title = "移除该任务";
        deleteBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
        deleteBtn.addEventListener('click', () => {
            if (this.isProcessing) return;
            this.batchQueue = this.batchQueue.filter(t => t.id !== task.id);
            if (this.batchQueue.length === 0) {
                this.batchConsoleContainer.classList.add('hidden');
            } else {
                this.renderBatchTable();
            }
        });

        tdAction.appendChild(deleteBtn);
        tr.appendChild(tdAction);

        return tr;
    }

    updateTaskUI(task) {
        const row = document.getElementById(`row-${task.id}`);
        if (!row) return;

        // 更新状态徽标单元格 (第 5 个单元格)
        const cells = row.getElementsByTagName('td');
        if (cells.length >= 5) {
            cells[4].innerHTML = this.getStatusBadgeHTML(task);
        }

        // 根据状态高亮行
        row.classList.remove('bg-blue-50/30', 'bg-red-50/30', 'bg-emerald-50/30', 'bg-slate-50/50');
        if (task.status === 'uploading' || task.status === 'processing') {
            row.classList.add('bg-blue-50/30');
        } else if (task.status === 'success') {
            row.classList.add('bg-emerald-50/30');
        } else if (task.status === 'failed') {
            row.classList.add('bg-red-50/30');
        } else {
            row.classList.add('hover:bg-slate-50/50');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getStatusBadgeHTML(task) {
        switch (task.status) {
            case 'pending':
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400"></span>待上传
                </span>`;
            case 'uploading':
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 animate-pulse">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-blue-500 animate-ping"></span>正在上传
                </span>`;
            case 'uploaded':
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>待OCR入库
                </span>`;
            case 'processing':
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 animate-pulse">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-500 animate-ping"></span>OCR处理中
                </span>`;
            case 'success':
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>处理成功
                </span>`;
            case 'failed':
                const errorTooltip = task.error ? `title="${task.error.replace(/"/g, '&quot;')}"` : '';
                return `<span ${errorTooltip} class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 cursor-help">
                    <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-600"></span>处理失败
                </span>`;
            default:
                return '';
        }
    }

    clearBatchQueue() {
        if (this.isProcessing) return;
        this.batchQueue = [];
        this.batchTbody.innerHTML = '';
        this.batchConsoleContainer.classList.add('hidden');
        this.fileInput.value = '';
    }

    toggleBatchControls(enabled) {
        this.dropZone.style.pointerEvents = enabled ? 'auto' : 'none';
        if (enabled) {
            this.dropZone.classList.remove('opacity-50');
            this.batchClearBtn.removeAttribute('disabled');
            this.batchClearBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            this.batchStartBtn.removeAttribute('disabled');
            this.batchStartBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            this.dropZone.classList.add('opacity-50');
            this.batchClearBtn.setAttribute('disabled', 'true');
            this.batchClearBtn.classList.add('opacity-50', 'cursor-not-allowed');
            this.batchStartBtn.setAttribute('disabled', 'true');
            this.batchStartBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    async limitConcurrency(tasks, limit, fn) {
        let index = 0;
        const runNext = async () => {
            if (index >= tasks.length) return;
            const currentIdx = index++;
            const task = tasks[currentIdx];
            await fn(task);
            await runNext();
        };

        const workers = [];
        for (let i = 0; i < Math.min(limit, tasks.length); i++) {
            workers.push(runNext());
        }
        await Promise.all(workers);
    }

    async startBatchPipeline() {
        if (this.isProcessing) return;

        const pendingTasks = this.batchQueue.filter(t => t.status === 'pending' || t.status === 'failed');
        if (pendingTasks.length === 0) {
            alert('队列中没有等待处理的任务！');
            return;
        }

        this.isProcessing = true;
        this.toggleBatchControls(false);

        try {
            // 阶段一：并行上传暂存（3并发限制，调用 batchUpload）
            const uploadWorker = async (task) => {
                task.status = 'uploading';
                task.error = null;
                this.updateTaskUI(task);

                const formData = new FormData();
                formData.append('image', task.file);
                formData.append('date', task.date);

                try {
                    const data = await api.batchUpload(formData);
                    if (data.error || !data.r2Url) {
                        throw new Error(data.message || data.error || '上传失败');
                    }
                    task.r2Url = data.r2Url;
                    task.status = 'uploaded';
                    this.updateTaskUI(task);
                } catch (err) {
                    console.error(err);
                    task.status = 'failed';
                    task.error = err.message || '上传失败';
                    this.updateTaskUI(task);
                }
            };

            // 限制 3 并发
            await this.limitConcurrency(pendingTasks, 3, uploadWorker);

            // 阶段二：串行 OCR 级联入库（严格1并发，调用 batchProcess）
            for (const task of pendingTasks) {
                if (task.status !== 'uploaded') {
                    // 跳过上传阶段就已经失败的任务
                    continue;
                }

                task.status = 'processing';
                this.updateTaskUI(task);

                try {
                    const payload = {
                        r2Url: task.r2Url,
                        date: task.date
                    };
                    const res = await api.batchProcess(payload);
                    if (res.error) {
                        throw new Error(res.message || res.error);
                    }

                    task.status = 'success';
                    task.result = res;
                    this.updateTaskUI(task);
                } catch (err) {
                    console.error(err);
                    task.status = 'failed';
                    task.error = err.message || 'OCR解析/存储失败';
                    this.updateTaskUI(task);
                }
            }

            // 联动重载每日复盘
            await this.app.reloadSummaries();

            const successCount = pendingTasks.filter(t => t.status === 'success').length;
            const failCount = pendingTasks.filter(t => t.status === 'failed').length;
            alert(`批量导入完成！\n成功：${successCount} 个\n失败：${failCount} 个`);

        } catch (globalErr) {
            console.error(globalErr);
            alert('批量处理队列遇到全局错误: ' + globalErr.message);
        } finally {
            this.isProcessing = false;
            this.toggleBatchControls(true);
        }
    }

    isValidDate(dateString) {
        // 必须符合 YYYY-MM-DD 格式
        const reg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateString || !reg.test(dateString)) return false;

        const parts = dateString.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        // 基础年份与月份校验
        if (year < 1000 || year > 3000 || month === 0 || month > 12) return false;

        const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        // 闰年二月处理
        if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
            monthLength[1] = 29;
        }

        return day > 0 && day <= monthLength[month - 1];
    }

    extractDate(filename) {
        const match1 = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match1) return `${match1[1]}-${match1[2]}-${match1[3]}`;
        const match2 = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
        if (match2) return `${match2[1]}-${match2[2]}-${match2[3]}`;
        const match3 = filename.match(/(\d{4})(\d{2})(\d{2})/);
        if (match3) return `${match3[1]}-${match3[2]}-${match3[3]}`;
        return null;
    }

    setUploadPhase(phase) {
        const phases = ['read', 'ocr', 'parse', 'save'];
        const desc = {
            'read': '正在读取并上传图片...',
            'ocr': 'Gemini 智能识别中 (可能需要约 10-15 秒)...',
            'parse': '正在解析并结构化复盘数据...',
            'save': '正在将复盘结果安全写入 D1 数据库...'
        };

        this.phaseDesc.textContent = desc[phase] || '处理中...';

        phases.forEach(p => {
            const el = document.getElementById('phase-' + p);
            if (!el) return;
            const iconWrap = el.querySelector('.phase-icon');

            if (p === phase) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 animate-pulse font-semibold shadow-sm";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-red-100 text-red-500";
            } else if (phases.indexOf(p) < phases.indexOf(phase)) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold shadow-sm";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-emerald-100 text-emerald-500";
                const icon = iconWrap.querySelector('i, svg');
                if (icon) icon.setAttribute('data-lucide', 'check');
            } else {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
            }
        });
        lucide.createIcons();
    }

    async uploadFile(file, dateStr) {
        if (!dateStr) {
            alert('请提供或选择有效的复盘日期（格式：YYYY-MM-DD）！');
            this.resetForm();
            return;
        }

        this.progressContainer.classList.remove('hidden');
        this.statusBox.classList.add('hidden');
        this.dropZone.style.pointerEvents = 'none';
        this.dropZone.classList.add('opacity-50');

        this.setUploadPhase('read');

        const ocrTimer = setTimeout(() => this.setUploadPhase('ocr'), 1200);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('date', dateStr);

        try {
            const data = await api.uploadImage(formData);
            if (data.error) {
                throw new Error(data.message || data.error);
            }

            clearTimeout(ocrTimer);

            this.setUploadPhase('parse');
            await new Promise(r => setTimeout(r, 600));

            this.setUploadPhase('save');
            await new Promise(r => setTimeout(r, 600));

            this.statStocks.innerHTML = `${data.stocksCount || 0} <span class="text-xs font-medium text-slate-500">只</span>`;
            this.statSectors.innerHTML = `${data.sectorsCount || 0} <span class="text-xs font-medium text-slate-500">个</span>`;
            this.statUpgrade.textContent = data.summary.upgrade_rate !== null ? `${data.summary.upgrade_rate}%` : '--%';
            this.statBidding.textContent = data.summary.bidding_increase_rate !== null ? `${data.summary.bidding_increase_rate}%` : '--%';
            this.statBroken.textContent = data.summary.limit_broken_rate !== null ? `${data.summary.limit_broken_rate}%` : '--%';

            this.rawMarkdownPre.textContent = data.rawMarkdown || '无原始 Markdown 识别内容';

            this.progressContainer.classList.add('hidden');
            this.statusBox.classList.remove('hidden');

            // 联动重载每日复盘
            await this.app.reloadSummaries();
            document.getElementById('date-select').value = dateStr;

        } catch (err) {
            clearTimeout(ocrTimer);
            console.error(err);
            alert('上传文件处理失败: ' + err.message);
            this.progressContainer.classList.add('hidden');
            this.resetForm();
        } finally {
            this.dropZone.style.pointerEvents = 'auto';
            this.dropZone.classList.remove('opacity-50');
        }
    }

    resetForm() {
        this.fileInput.value = '';
        this.selectedFileInfo.classList.add('hidden');
        this.statusBox.classList.add('hidden');
        this.progressContainer.classList.add('hidden');

        ['read', 'ocr', 'parse', 'save'].forEach(p => {
            const el = document.getElementById('phase-' + p);
            if (el) {
                el.className = "flex items-center space-x-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400";
                const iconWrap = el.querySelector('.phase-icon');
                if (iconWrap) iconWrap.className = "phase-icon p-1.5 rounded-lg bg-slate-100 text-slate-400";
            }
        });

        const selectIcon = (id) => document.querySelector(`#${id} i, #${id} svg`);

        const iconRead = selectIcon('phase-read');
        const iconOcr = selectIcon('phase-ocr');
        const iconParse = selectIcon('phase-parse');
        const iconSave = selectIcon('phase-save');

        if (iconRead) iconRead.setAttribute('data-lucide', 'file-text');
        if (iconOcr) iconOcr.setAttribute('data-lucide', 'cpu');
        if (iconParse) iconParse.setAttribute('data-lucide', 'binary');
        if (iconSave) iconSave.setAttribute('data-lucide', 'database');

        lucide.createIcons();
    }
}