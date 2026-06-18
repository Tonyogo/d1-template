import { api } from '../api.js';

export class UploadTab {
    constructor(app) {
        this.app = app;
        this.initDOM();
        this.loadPendingQueue();
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

        // 暂存控制台 DOM 节点
        this.pendingConsoleContainer = document.getElementById('pending-console-container');
        this.pendingRefreshBtn = document.getElementById('pending-refresh-btn');
        this.pendingProcessAllBtn = document.getElementById('pending-process-all-btn');
        this.pendingTbody = document.getElementById('pending-tbody');

        // 图片预览 Modal 节点
        this.previewModal = document.getElementById('preview-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalSubtitle = document.getElementById('modal-subtitle');
        this.modalCloseBtn = document.getElementById('modal-close-btn');
        this.modalImage = document.getElementById('modal-image');
        this.modalZoomOutBtn = document.getElementById('modal-zoom-out-btn');
        this.modalZoomResetBtn = document.getElementById('modal-zoom-reset-btn');
        this.modalZoomInBtn = document.getElementById('modal-zoom-in-btn');

        this.batchQueue = [];
        this.isProcessing = false;
        this.zoomLevel = 1.0;

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

        // 暂存队列监听器绑定
        this.pendingRefreshBtn.addEventListener('click', () => this.loadPendingQueue());
        this.pendingProcessAllBtn.addEventListener('click', () => this.processAllPending());

        // Modal 监听器绑定
        this.modalCloseBtn.addEventListener('click', () => this.closePreviewModal());
        this.modalZoomInBtn.addEventListener('click', () => this.zoomImage(0.2));
        this.modalZoomOutBtn.addEventListener('click', () => this.zoomImage(-0.2));
        this.modalZoomResetBtn.addEventListener('click', () => this.resetZoomImage());

        this.previewModal.addEventListener('click', (e) => {
            if (e.target === this.previewModal) {
                this.closePreviewModal();
            }
        });
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
                    if (data.error || !data.imageKey) {
                        throw new Error(data.message || data.error || '上传失败');
                    }
                    task.imageKey = data.imageKey;
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

        // 联动刷新暂存队列
        this.loadPendingQueue();
    }

    async loadPendingQueue() {
        if (this.isProcessing) return;

        try {
            this.pendingTbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-slate-400">
                        <div class="flex flex-col items-center justify-center space-y-2">
                            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500"></div>
                            <span class="text-xs">正在加载暂存队列...</span>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();

            const pendingImages = await api.listPendingImages();

            if (pendingImages.error) {
                throw new Error(pendingImages.error);
            }

            if (!pendingImages || pendingImages.length === 0) {
                this.pendingConsoleContainer.classList.add('hidden');
                return;
            }

            this.pendingConsoleContainer.classList.remove('hidden');
            this.pendingTbody.innerHTML = '';

            pendingImages.forEach((img) => {
                const tr = this.renderPendingRow(img);
                this.pendingTbody.appendChild(tr);
            });

            lucide.createIcons();
        } catch (err) {
            console.error('Failed to load pending queue:', err);
            this.pendingTbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-red-500 font-semibold text-xs">
                        加载暂存队列失败: ${err.message || err}
                    </td>
                </tr>
            `;
            lucide.createIcons();
        }
    }

    renderPendingRow(img) {
        const tr = document.createElement('tr');
        tr.id = `pending-row-${img.key.replace(/[\/.]/g, '-')}`;
        tr.setAttribute('data-key', img.key);
        tr.className = "hover:bg-slate-50/50 transition duration-150";

        // 1. 缩略图
        const tdThumb = document.createElement('td');
        tdThumb.className = "px-4 py-3";
        const thumbDiv = document.createElement('div');
        thumbDiv.className = "w-12 h-12 rounded overflow-hidden border border-slate-200 cursor-zoom-in bg-slate-100 flex items-center justify-center transition hover:opacity-80";

        const thumbImg = document.createElement('img');
        thumbImg.src = `/api/pending-image?key=${encodeURIComponent(img.key)}`;
        thumbImg.className = "w-full h-full object-cover";

        thumbDiv.addEventListener('click', () => {
            this.openPreviewModal(img.key, img.originalName);
        });

        thumbDiv.appendChild(thumbImg);
        tdThumb.appendChild(thumbDiv);
        tr.appendChild(tdThumb);

        // 2. 原始文件名 / 上传时间
        const tdInfo = document.createElement('td');
        tdInfo.className = "px-4 py-3";

        const nameDiv = document.createElement('div');
        nameDiv.className = "text-sm font-semibold text-slate-800 max-w-xs truncate";
        nameDiv.textContent = img.originalName;
        nameDiv.title = img.originalName;

        const dateDiv = document.createElement('div');
        dateDiv.className = "text-xxs text-slate-400 mt-0.5";
        const formattedTime = new Date(img.uploadedAt).toLocaleString('zh-CN');
        dateDiv.textContent = `上传时间: ${formattedTime}`;

        tdInfo.appendChild(nameDiv);
        tdInfo.appendChild(dateDiv);
        tr.appendChild(tdInfo);

        // 3. 目标日期日期选择器
        const tdPicker = document.createElement('td');
        tdPicker.className = "px-4 py-3";

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = "px-2 py-1 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50 text-slate-900";
        dateInput.value = img.suggestedDate || this.getTodayDateString();

        tdPicker.appendChild(dateInput);
        tr.appendChild(tdPicker);

        // 4. 文件大小
        const tdSize = document.createElement('td');
        tdSize.className = "px-4 py-3 text-xs text-slate-500";
        tdSize.textContent = this.formatFileSize(img.size);
        tr.appendChild(tdSize);

        // 5. 单项解析与删除操作按钮
        const tdAction = document.createElement('td');
        tdAction.className = "px-4 py-3 text-right space-x-2";

        const processBtn = document.createElement('button');
        processBtn.className = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 inline-flex items-center space-x-1";
        processBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> <span>解析入库</span>`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = "px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-red-500 rounded-lg text-xs font-semibold transition duration-150 inline-flex items-center";
        deleteBtn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>`;

        processBtn.addEventListener('click', async () => {
            const dateVal = dateInput.value;
            if (!this.isValidDate(dateVal)) {
                alert('请选择或输入有效的复盘日期！');
                return;
            }
            await this.processSinglePendingItem(img.key, dateVal, tr, processBtn, deleteBtn);
        });

        deleteBtn.addEventListener('click', async () => {
            if (confirm(`确定要丢弃该暂存文件吗？\n文件名: ${img.originalName}`)) {
                await this.deleteSinglePendingItem(img.key, tr, processBtn, deleteBtn);
            }
        });

        tdAction.appendChild(processBtn);
        tdAction.appendChild(deleteBtn);
        tr.appendChild(tdAction);

        return tr;
    }

    async processSinglePendingItem(key, date, rowElement, processBtn, deleteBtn) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.togglePendingControls(false);

        processBtn.disabled = true;
        deleteBtn.disabled = true;
        const picker = rowElement.querySelector('input[type="date"]');
        if (picker) picker.disabled = true;

        const originalBtnHTML = processBtn.innerHTML;
        processBtn.className = "px-3 py-1 bg-red-400 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1 cursor-not-allowed";
        processBtn.innerHTML = `<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> <span>解析中...</span>`;

        rowElement.classList.add('bg-blue-50/30');

        try {
            const data = await api.processPendingImage(key, date);
            if (data.error) {
                throw new Error(data.message || data.error);
            }

            rowElement.classList.remove('bg-blue-50/30');
            rowElement.classList.add('bg-emerald-50/30');
            processBtn.className = "px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1";
            processBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>解析成功</span>`;
            lucide.createIcons();

            this.statStocks.innerHTML = `${data.stocksCount || 0} <span class="text-xs font-medium text-slate-500">只</span>`;
            this.statSectors.innerHTML = `${data.sectorsCount || 0} <span class="text-xs font-medium text-slate-500">个</span>`;
            this.statUpgrade.textContent = data.summary.upgrade_rate !== null ? `${data.summary.upgrade_rate}%` : '--%';
            this.statBidding.textContent = data.summary.bidding_increase_rate !== null ? `${data.summary.bidding_increase_rate}%` : '--%';
            this.statBroken.textContent = data.summary.limit_broken_rate !== null ? `${data.summary.limit_broken_rate}%` : '--%';
            this.rawMarkdownPre.textContent = data.rawMarkdown || '无原始 Markdown 识别内容';

            this.statusBox.classList.remove('hidden');

            await this.app.reloadSummaries();
            document.getElementById('date-select').value = date;

            setTimeout(() => {
                rowElement.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                setTimeout(() => {
                    rowElement.remove();
                    if (this.pendingTbody.children.length === 0) {
                        this.pendingConsoleContainer.classList.add('hidden');
                    }
                }, 500);
            }, 1200);

        } catch (err) {
            console.error('Failed to process pending item:', err);
            alert(`处理失败: ${err.message || err}`);

            rowElement.classList.remove('bg-blue-50/30');
            rowElement.classList.add('bg-red-50/30');
            processBtn.disabled = false;
            deleteBtn.disabled = false;
            if (picker) picker.disabled = false;
            processBtn.className = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 inline-flex items-center space-x-1";
            processBtn.innerHTML = originalBtnHTML;
            lucide.createIcons();
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }

    async deleteSinglePendingItem(key, rowElement, processBtn, deleteBtn) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.togglePendingControls(false);

        processBtn.disabled = true;
        deleteBtn.disabled = true;
        const picker = rowElement.querySelector('input[type="date"]');
        if (picker) picker.disabled = true;

        deleteBtn.innerHTML = `<div class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-500"></div>`;
        rowElement.classList.add('bg-red-50/10');

        try {
            const data = await api.deletePendingImage(key);
            if (data.error) {
                throw new Error(data.message || data.error);
            }

            rowElement.classList.remove('bg-red-50/10');
            rowElement.classList.add('bg-slate-100', 'opacity-50');

            setTimeout(() => {
                rowElement.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                setTimeout(() => {
                    rowElement.remove();
                    if (this.pendingTbody.children.length === 0) {
                        this.pendingConsoleContainer.classList.add('hidden');
                    }
                }, 500);
            }, 500);

        } catch (err) {
            console.error('Failed to discard pending item:', err);
            alert(`删除失败: ${err.message || err}`);

            rowElement.classList.remove('bg-red-50/10');
            processBtn.disabled = false;
            deleteBtn.disabled = false;
            if (picker) picker.disabled = false;
            deleteBtn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>`;
            lucide.createIcons();
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }

    async processAllPending() {
        if (this.isProcessing) return;

        const rows = Array.from(this.pendingTbody.querySelectorAll('tr[id^="pending-row-"]'));
        if (rows.length === 0) {
            alert('当前队列中没有暂存任务！');
            return;
        }

        if (!confirm(`确定要开始一键顺序处理当前队列中的所有 ${rows.length} 张图片吗？\n将按顺序单线程进行 OCR 解析，请耐心等待。`)) {
            return;
        }

        this.isProcessing = true;
        this.togglePendingControls(false);

        let successCount = 0;
        let failCount = 0;

        try {
            for (const row of rows) {
                const picker = row.querySelector('input[type="date"]');
                const processBtn = row.querySelector('button.bg-red-500');
                const deleteBtn = row.querySelector('button.text-slate-500');

                if (!processBtn || !deleteBtn || !picker) continue;
                if (processBtn.disabled) continue;

                const key = row.getAttribute('data-key');
                const date = picker.value;

                if (!this.isValidDate(date)) {
                    row.classList.add('bg-red-50/30');
                    failCount++;
                    continue;
                }

                processBtn.disabled = true;
                deleteBtn.disabled = true;
                picker.disabled = true;

                const originalBtnHTML = processBtn.innerHTML;
                processBtn.className = "px-3 py-1 bg-red-400 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1 cursor-not-allowed";
                processBtn.innerHTML = `<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> <span>解析中...</span>`;
                row.className = "bg-blue-50/30 transition duration-150";

                try {
                    const data = await api.processPendingImage(key, date);
                    if (data.error) {
                        throw new Error(data.message || data.error);
                    }

                    row.className = "bg-emerald-50/30 transition duration-150";
                    processBtn.className = "px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1";
                    processBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>解析成功</span>`;
                    lucide.createIcons();

                    this.statStocks.innerHTML = `${data.stocksCount || 0} <span class="text-xs font-medium text-slate-500">只</span>`;
                    this.statSectors.innerHTML = `${data.sectorsCount || 0} <span class="text-xs font-medium text-slate-500">个</span>`;
                    this.statUpgrade.textContent = data.summary.upgrade_rate !== null ? `${data.summary.upgrade_rate}%` : '--%';
                    this.statBidding.textContent = data.summary.bidding_increase_rate !== null ? `${data.summary.bidding_increase_rate}%` : '--%';
                    this.statBroken.textContent = data.summary.limit_broken_rate !== null ? `${data.summary.limit_broken_rate}%` : '--%';
                    this.rawMarkdownPre.textContent = data.rawMarkdown || '无原始 Markdown 识别内容';
                    this.statusBox.classList.remove('hidden');

                    successCount++;

                    setTimeout(() => {
                        row.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                        setTimeout(() => {
                            row.remove();
                            if (this.pendingTbody.children.length === 0) {
                                this.pendingConsoleContainer.classList.add('hidden');
                            }
                        }, 500);
                    }, 1200);

                } catch (err) {
                    console.error('Failed processing item in loop:', err);
                    row.className = "bg-red-50/30 transition duration-150";
                    processBtn.disabled = false;
                    deleteBtn.disabled = false;
                    picker.disabled = false;
                    processBtn.className = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 inline-flex items-center space-x-1";
                    processBtn.innerHTML = originalBtnHTML;
                    lucide.createIcons();
                    failCount++;
                }

                await new Promise(resolve => setTimeout(resolve, 800));
            }

            await this.app.reloadSummaries();
            alert(`一键顺序处理完成！\n成功：${successCount} 个\n失败：${failCount} 个`);
        } catch (err) {
            console.error('Error during one-key processing loop:', err);
            alert(`批量顺序处理出现异常: ${err.message || err}`);
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }

    togglePendingControls(enabled) {
        this.dropZone.style.pointerEvents = enabled ? 'auto' : 'none';
        if (enabled) {
            this.dropZone.classList.remove('opacity-50');
            this.pendingRefreshBtn.removeAttribute('disabled');
            this.pendingRefreshBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            this.pendingProcessAllBtn.removeAttribute('disabled');
            this.pendingProcessAllBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            this.dropZone.classList.add('opacity-50');
            this.pendingRefreshBtn.setAttribute('disabled', 'true');
            this.pendingRefreshBtn.classList.add('opacity-50', 'cursor-not-allowed');
            this.pendingProcessAllBtn.setAttribute('disabled', 'true');
            this.pendingProcessAllBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    openPreviewModal(key, title) {
        this.modalTitle.textContent = title;
        this.modalSubtitle.textContent = `暂存 Key: ${key}`;
        this.modalImage.src = `/api/pending-image?key=${encodeURIComponent(key)}`;

        this.resetZoomImage();

        this.previewModal.classList.remove('hidden');
        setTimeout(() => {
            this.previewModal.classList.remove('opacity-0');
            const card = this.previewModal.querySelector('.relative.max-w-4xl');
            if (card) card.classList.remove('scale-95');
        }, 50);
        lucide.createIcons();
    }

    closePreviewModal() {
        this.previewModal.classList.add('opacity-0');
        const card = this.previewModal.querySelector('.relative.max-w-4xl');
        if (card) card.classList.add('scale-95');

        setTimeout(() => {
            this.previewModal.classList.add('hidden');
            this.modalImage.src = '';
        }, 300);
    }

    zoomImage(delta) {
        this.zoomLevel = Math.max(0.4, Math.min(3.0, this.zoomLevel + delta));
        this.applyZoom();
    }

    resetZoomImage() {
        this.zoomLevel = 1.0;
        this.applyZoom();
    }

    applyZoom() {
        this.modalImage.style.transform = `scale(${this.zoomLevel})`;
        this.modalZoomResetBtn.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
}