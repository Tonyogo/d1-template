import { api } from '../api.js';

export class UploadTab {
    constructor(app) {
        this.app = app;
        this.isCancelRequested = false;
        this.selectedKeys = new Set();
        this.pendingImagesCache = [];
        this.initDOM();
        this.initProxyDOM();
        this.loadPendingQueue();
    }

    initDOM() {
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');

        // 暂存控制台 DOM 节点
        this.pendingConsoleContainer = document.getElementById('pending-console-container');
        this.pendingRefreshBtn = document.getElementById('pending-refresh-btn');
        this.pendingProcessAllBtn = document.getElementById('pending-process-all-btn');
        this.pendingTbody = document.getElementById('pending-tbody');
        this.concurrencySelect = document.getElementById('pending-concurrency-select');

        // 批量工具与 Hook 节点
        this.pendingQueueBadge = document.getElementById('pending-queue-badge');
        this.pendingBatchTodayBtn = document.getElementById('pending-batch-today-btn');
        this.pendingBatchDeleteBtn = document.getElementById('pending-batch-delete-btn');
        this.pendingBatchDeleteText = document.getElementById('pending-batch-delete-text');
        this.selectAllHeader = document.getElementById('pending-select-all-header');

        // 图片预览 Modal 节点
        this.previewModal = document.getElementById('preview-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalSubtitle = document.getElementById('modal-subtitle');
        this.modalCloseBtn = document.getElementById('modal-close-btn');
        this.modalImage = document.getElementById('modal-image');
        this.modalZoomOutBtn = document.getElementById('modal-zoom-out-btn');
        this.modalZoomResetBtn = document.getElementById('modal-zoom-reset-btn');
        this.modalZoomInBtn = document.getElementById('modal-zoom-in-btn');

        this.isProcessing = false;
        this.zoomLevel = 1.0;

        // 绑定点击上传
        this.dropZone.addEventListener('click', () => {
            if (this.isProcessing) return;
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (this.isProcessing) return;
            this.handleFiles(e.target.files);
        });

        // 拖拽高亮效果
        ['dragenter', 'dragover'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isProcessing) return;
                this.dropZone.classList.add('border-rose-500', 'bg-rose-50/30');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropZone.classList.remove('border-rose-500', 'bg-rose-50/30');
            });
        });

        this.dropZone.addEventListener('drop', (e) => {
            if (this.isProcessing) return;
            this.handleFiles(e.dataTransfer.files);
        });

        // 暂存队列监听器绑定
        this.pendingRefreshBtn.addEventListener('click', () => this.loadPendingQueue());
        this.pendingProcessAllBtn.addEventListener('click', () => this.processAllPending());

        // 批量操作监听器绑定
        if (this.pendingBatchTodayBtn) {
            this.pendingBatchTodayBtn.addEventListener('click', () => this.batchSetTodayDate());
        }
        if (this.pendingBatchDeleteBtn) {
            this.pendingBatchDeleteBtn.addEventListener('click', () => this.batchDeleteSelected());
        }
        if (this.selectAllHeader) {
            this.selectAllHeader.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                if (isChecked && this.pendingImagesCache) {
                    this.pendingImagesCache.forEach(img => this.selectedKeys.add(img.key));
                } else {
                    this.selectedKeys.clear();
                }
                const itemCheckboxes = this.pendingTbody.querySelectorAll('.pending-item-checkbox');
                itemCheckboxes.forEach(cb => {
                    cb.checked = isChecked;
                });
                this.updateBatchControlsUI();
            });
        }

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

        // 绑定全局 ESC 按键监听以快速关闭 Modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.previewModal.classList.contains('hidden')) {
                this.closePreviewModal();
            }
        });

        // 初始化并同步并发选择与 LocalStorage 持久化记忆
        if (this.concurrencySelect) {
            const cachedLimit = localStorage.getItem('pending_concurrency_limit');
            if (cachedLimit !== null) {
                this.concurrencySelect.value = cachedLimit;
            }
            this.concurrencySelect.addEventListener('change', (e) => {
                localStorage.setItem('pending_concurrency_limit', e.target.value);
            });
        }
    }

    initProxyDOM() {
        this.proxyToggle = document.getElementById('local-proxy-settings-toggle');
        this.proxyCollapse = document.getElementById('local-proxy-settings-content');
        this.proxyChevron = document.getElementById('local-proxy-settings-chevron');

        this.inpEnabled = document.getElementById('local-proxy-enable');
        this.inpType = document.getElementById('local-proxy-protocol');
        this.inpBase = document.getElementById('local-proxy-base');
        this.inpKey = document.getElementById('local-proxy-key');
        this.inpModel = document.getElementById('local-proxy-model');

        if (!this.proxyToggle) return;

        this.proxyToggle.addEventListener('click', () => {
            this.proxyCollapse.classList.toggle('hidden');
            this.proxyChevron.classList.toggle('rotate-180');
        });

        const fields = [
            { el: this.inpEnabled, key: 'proxy_enabled', prop: 'checked', type: 'bool' },
            { el: this.inpType, key: 'proxy_api_type', prop: 'value' },
            { el: this.inpBase, key: 'proxy_api_base', prop: 'value' },
            { el: this.inpKey, key: 'proxy_api_key', prop: 'value' },
            { el: this.inpModel, key: 'proxy_api_model', prop: 'value' }
        ];

        fields.forEach(({ el, key, prop, type }) => {
            if (!el) return;
            const saved = localStorage.getItem(key);
            if (saved !== null) {
                if (type === 'bool') {
                    el[prop] = saved === 'true';
                } else {
                    el[prop] = saved;
                }
            }

            el.addEventListener('change', () => {
                if (type === 'bool') {
                    localStorage.setItem(key, el[prop].toString());
                } else {
                    localStorage.setItem(key, el[prop].trim());
                }
            });
        });
    }

    resetForm() {
        if (!this.isProcessing) {
            this.fileInput.value = '';
            this.loadPendingQueue();
        }
    }

    getProxyConfig() {
        const enabled = localStorage.getItem('proxy_enabled') === 'true';
        if (!enabled) return null;

        return {
            type: localStorage.getItem('proxy_api_type') || 'gemini',
            base: localStorage.getItem('proxy_api_base') || '',
            key: localStorage.getItem('proxy_api_key') || '',
            model: localStorage.getItem('proxy_api_model') || ''
        };
    }

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    extractDateFromFilename(filename) {
        if (!filename) return null;
        const name = String(filename).trim();

        // 1. Match YYYY-MM-DD, YYYY_MM_DD, YYYY.MM.DD
        const fullDateMatch = name.match(/(20\d{2})[-_.年](\d{1,2})[-_.月](\d{1,2})日?/);
        if (fullDateMatch) {
            const year = fullDateMatch[1];
            const month = fullDateMatch[2].padStart(2, '0');
            const day = fullDateMatch[3].padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            if (this.isValidDate(dateStr)) return dateStr;
        }

        const compactMatch = name.match(/(20\d{2})(\d{2})(\d{2})/);
        if (compactMatch) {
            const dateStr = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
            if (this.isValidDate(dateStr)) return dateStr;
        }

        // 2. Match MM-DD, M.D (e.g. 08-19, 8.19, 8月19日) -> prepends current year
        const monthDayMatch = name.match(/(\d{1,2})[-_.月](\d{1,2})日?/);
        if (monthDayMatch) {
            const year = new Date().getFullYear();
            const month = monthDayMatch[1].padStart(2, '0');
            const day = monthDayMatch[2].padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            if (this.isValidDate(dateStr)) return dateStr;
        }

        return null;
    }

    updateBatchControlsUI() {
        const count = this.selectedKeys.size;
        if (this.pendingBatchDeleteBtn) {
            this.pendingBatchDeleteBtn.disabled = count === 0 || this.isProcessing;
            if (count > 0) {
                this.pendingBatchDeleteBtn.className = "px-3 py-1.5 border border-rose-300 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs cursor-pointer hover:bg-rose-100";
                if (this.pendingBatchDeleteText) this.pendingBatchDeleteText.textContent = `批量删除 (${count})`;
            } else {
                this.pendingBatchDeleteBtn.className = "px-3 py-1.5 border border-rose-200/80 bg-rose-50/50 text-rose-600 opacity-50 cursor-not-allowed rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs";
                if (this.pendingBatchDeleteText) this.pendingBatchDeleteText.textContent = '批量删除';
            }
        }
        if (this.selectAllHeader) {
            const totalRows = this.pendingImagesCache ? this.pendingImagesCache.length : 0;
            this.selectAllHeader.checked = totalRows > 0 && this.selectedKeys.size === totalRows;
            this.selectAllHeader.indeterminate = this.selectedKeys.size > 0 && this.selectedKeys.size < totalRows;
            this.selectAllHeader.disabled = this.isProcessing;
        }
    }

    async batchDeleteSelected() {
        const count = this.selectedKeys.size;
        if (count === 0) return;

        if (!confirm(`确定要批量删除选中的 ${count} 个暂存文件吗？`)) return;

        this.togglePendingControls(false);
        try {
            for (const key of Array.from(this.selectedKeys)) {
                await api.deletePendingImage(key);
                localStorage.removeItem(`pending_date_cache_${key}`);
            }
            this.selectedKeys.clear();
            await this.loadPendingQueue();
        } catch (err) {
            console.error('Batch delete failed:', err);
            alert('批量删除失败: ' + (err.message || err));
        } finally {
            this.togglePendingControls(true);
        }
    }

    batchSetTodayDate() {
        const today = this.getTodayDateString();
        const inputs = this.pendingTbody.querySelectorAll('.pending-date-input');
        inputs.forEach(input => {
            input.value = today;
            const row = input.closest('[data-key]');
            if (row) {
                const key = row.getAttribute('data-key');
                localStorage.setItem(`pending_date_cache_${key}`, today);
            }
        });
    }

    togglePendingControls(enabled) {
        this.dropZone.style.pointerEvents = enabled ? 'auto' : 'none';
        this.pendingRefreshBtn.disabled = !enabled;
        if (this.concurrencySelect) this.concurrencySelect.disabled = !enabled;
        if (this.pendingBatchTodayBtn) this.pendingBatchTodayBtn.disabled = !enabled;
        if (this.selectAllHeader) this.selectAllHeader.disabled = !enabled;

        if (enabled) {
            this.dropZone.classList.remove('opacity-50');
            this.pendingRefreshBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            if (this.concurrencySelect) this.concurrencySelect.classList.remove('opacity-50', 'cursor-not-allowed');

            // 恢复一键处理按钮的初始状态
            this.pendingProcessAllBtn.removeAttribute('disabled');
            this.pendingProcessAllBtn.className = "justify-center px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5";
            this.pendingProcessAllBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> <span>一键并发处理</span>`;
        } else {
            this.dropZone.classList.add('opacity-50');
            this.pendingRefreshBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        this.updateBatchControlsUI();
        lucide.createIcons();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    isValidDate(dateStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
        const [year, month, day] = dateStr.split('-').map(Number);
        if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
        const d = new Date(year, month - 1, day);
        return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    }

    getStatusBadgeHTML(img) {
        if (img.status === 'processing') {
            return `
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1 animate-pulse"></span>解析中
                </span>
            `;
        }
        if (img.status === 'failed') {
            return `
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                    <i data-lucide="alert-circle" class="w-3 h-3 mr-1"></i>失败
                </span>
            `;
        }
        return `
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1"></span>未解析
            </span>
        `;
    }

    async handleFiles(files) {
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
        if (validFiles.length === 0) {
            alert('请选择有效的长图格式文件（支持 .png, .jpg, .jpeg, .webp）');
            return;
        }

        this.isProcessing = true;
        this.togglePendingControls(false);

        const originalDropZoneHTML = this.dropZone.innerHTML;
        const total = validFiles.length;
        let uploadedCount = 0;

        this.updateDropZoneProgress(0, total);

        try {
            for (let i = 0; i < total; i++) {
                const file = validFiles[i];
                try {
                    const res = await api.stashPendingImage(file);
                    if (res.error) throw new Error(res.error);
                    uploadedCount++;
                    this.updateDropZoneProgress(uploadedCount, total);
                } catch (err) {
                    console.error(`Failed to upload ${file.name}:`, err);
                    alert(`文件 "${file.name}" 云端暂存失败: ${err.message || err}`);
                }
            }
        } finally {
            this.dropZone.innerHTML = originalDropZoneHTML;
            this.fileInput.value = '';
            this.isProcessing = false;
            this.togglePendingControls(true);

            await this.loadPendingQueue();
        }
    }

    updateDropZoneProgress(uploaded, total) {
        const msg = document.getElementById('stash-progress-msg');
        if (msg) {
            msg.textContent = `正在上传并云端暂存图片... (${uploaded}/${total})`;
        } else {
            this.dropZone.innerHTML = `
                <div class="flex flex-col items-center justify-center space-y-3">
                    <div class="w-8 h-8 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p class="text-xs font-bold text-slate-800" id="stash-progress-msg">正在上传并云端暂存图片... (${uploaded}/${total})</p>
                    <p class="text-[11px] text-slate-400">请勿关闭当前页面，上传成功后会自动刷新待处理列表</p>
                </div>
            `;
        }
    }

    async loadPendingQueue() {
        if (this.isProcessing) return;

        try {
            this.pendingTbody.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <div class="flex flex-col items-center justify-center space-y-2">
                        <div class="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                        <span class="text-xs font-semibold">正在加载暂存队列...</span>
                    </div>
                </div>
            `;
            lucide.createIcons();

            const pendingImages = await api.listPendingImages();

            if (pendingImages && pendingImages.error) {
                throw new Error(pendingImages.error);
            }

            this.pendingImagesCache = pendingImages || [];
            if (this.pendingQueueBadge) {
                this.pendingQueueBadge.textContent = `${this.pendingImagesCache.length} 项`;
            }

            // Clean up selectedKeys if keys no longer exist
            const validKeys = new Set(this.pendingImagesCache.map(img => img.key));
            for (const key of Array.from(this.selectedKeys)) {
                if (!validKeys.has(key)) {
                    this.selectedKeys.delete(key);
                }
            }

            this.pendingTbody.innerHTML = '';

            if (this.pendingImagesCache.length === 0) {
                this.pendingTbody.innerHTML = `
                    <div id="pending-empty-row" class="text-center py-16 text-slate-400">
                        <div class="flex flex-col items-center justify-center space-y-3">
                            <div class="p-3 bg-slate-50 rounded-2xl text-slate-300 border border-slate-200/50">
                                <i data-lucide="inbox" class="w-8 h-8"></i>
                            </div>
                            <div class="text-xs font-semibold text-slate-600">云端暂存队列为空</div>
                            <p class="text-[11px] text-slate-400 max-w-xs leading-relaxed mx-auto px-4">
                                您可以拖拽或选择多个复盘长图到上方区域进行“极速云暂存”，然后再到此处统一进行智能解析与入库。
                            </p>
                        </div>
                    </div>
                `;
                this.updateBatchControlsUI();
                lucide.createIcons();
                return;
            }

            this.pendingImagesCache.forEach((img) => {
                const tr = this.renderPendingRow(img);
                this.pendingTbody.appendChild(tr);
            });

            this.updateBatchControlsUI();
            lucide.createIcons();
        } catch (err) {
            console.error('Failed to load pending queue:', err);
            this.pendingTbody.innerHTML = `
                <div class="text-center py-8 text-rose-600 font-semibold text-xs bg-rose-50/50 rounded-xl border border-rose-100 m-4">
                    加载暂存队列失败: ${err.message || err}
                </div>
            `;
            lucide.createIcons();
        }
    }

    renderPendingRow(img) {
        const row = document.createElement('div');
        row.id = `pending-row-${img.key.replace(/[\/.]/g, '-')}`;
        row.setAttribute('data-key', img.key);
        row.className = "flex flex-col md:grid md:grid-cols-12 md:gap-3 md:items-center p-4 md:px-4 md:py-3.5 bg-white hover:bg-slate-50/60 transition duration-150 gap-3 border-b border-slate-100";

        const sizeStr = this.formatFileSize(img.size);
        const formattedTime = new Date(img.uploadedAt).toLocaleString('zh-CN');

        // 目标日志缓存：读取时优先使用 LocalStorage 的局部修改日期，其次智能提取文件名日期，再其次 suggestedDate，最后今日
        const cachedDate = localStorage.getItem(`pending_date_cache_${img.key}`);
        const extractedDate = this.extractDateFromFilename(img.originalName);
        const suggestedDateVal = cachedDate || extractedDate || img.suggestedDate || this.getTodayDateString();
        const statusBadge = this.getStatusBadgeHTML(img);
        const isChecked = this.selectedKeys.has(img.key);

        const escapedName = this.escapeHTML(img.originalName);

        row.innerHTML = `
            <!-- 1. Checkbox & Mobile header (PC: col-span-1) -->
            <div class="col-span-1 flex items-center space-x-3 shrink-0">
                <input type="checkbox" class="pending-item-checkbox w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer shrink-0" ${isChecked ? 'checked' : ''}>
                <!-- Mobile thumbnail -->
                <div class="md:hidden w-12 h-12 rounded-lg overflow-hidden border border-slate-200 cursor-zoom-in bg-slate-100 flex items-center justify-center transition hover:opacity-80 shrink-0">
                    <img src="/api/pending-image?key=${encodeURIComponent(img.key)}" class="w-full h-full object-cover">
                </div>
                <!-- Mobile title and status badge -->
                <div class="block md:hidden min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                        <div class="text-xs font-bold text-slate-800 truncate" title="${escapedName}">${escapedName}</div>
                        <div class="mobile-status-container flex items-center shrink-0">
                            ${statusBadge}
                        </div>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 flex items-center space-x-2 font-mono">
                        <span>大小: ${sizeStr}</span>
                        <span class="text-slate-300">|</span>
                        <span>${formattedTime}</span>
                    </div>
                </div>
            </div>

            <!-- 2. PC Thumbnail (PC: col-span-1) -->
            <div class="hidden md:flex col-span-1 items-center">
                <div class="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 cursor-zoom-in bg-slate-100 flex items-center justify-center transition hover:opacity-80 shrink-0">
                    <img src="/api/pending-image?key=${encodeURIComponent(img.key)}" class="w-full h-full object-cover">
                </div>
            </div>

            <!-- 3. PC Filename & Upload Time (PC: col-span-3) -->
            <div class="hidden md:block col-span-3 min-w-0">
                <div class="text-xs font-semibold text-slate-800 truncate" title="${escapedName}">${escapedName}</div>
                <div class="text-[10px] text-slate-400 mt-0.5 font-mono">上传时间: ${formattedTime}</div>
            </div>

            <!-- 4. Target Date Input (PC: col-span-3) -->
            <div class="col-span-3 min-w-0 w-full">
                <div class="space-y-1 md:space-y-0 w-full">
                    <div class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider">目标复盘日期</div>
                    <input type="date" value="${suggestedDateVal}" class="pending-date-input w-full min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-slate-50 text-slate-900">
                </div>
            </div>

            <!-- 5. PC Status Badge (PC: col-span-1) -->
            <div class="hidden md:flex col-span-1 items-center justify-center">
                ${statusBadge}
            </div>

            <!-- 6. PC File Size (PC: col-span-1) -->
            <div class="hidden md:block col-span-1 text-[11px] text-slate-500 font-mono">
                ${sizeStr}
            </div>

            <!-- 7. Actions (PC: col-span-2) -->
            <div class="col-span-2 min-w-0 w-full">
                <div class="flex items-center justify-end w-full">
                    <div class="flex items-center space-x-2 min-w-0 flex-1 md:flex-initial md:w-auto justify-end">
                        <button class="process-item-btn flex-1 md:flex-none justify-center px-3.5 h-8 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1 border border-transparent">
                            <i data-lucide="play" class="w-3 h-3"></i>
                            <span>解析入库</span>
                        </button>
                        <button class="delete-item-btn w-8 h-8 border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-rose-600 rounded-xl text-xs font-semibold transition flex items-center justify-center shrink-0">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const checkbox = row.querySelector('.pending-item-checkbox');
        const thumbs = row.querySelectorAll('.cursor-zoom-in');
        const dateInput = row.querySelector('.pending-date-input');
        const processBtn = row.querySelector('.process-item-btn');
        const deleteBtn = row.querySelector('.delete-item-btn');

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedKeys.add(img.key);
            } else {
                this.selectedKeys.delete(img.key);
            }
            this.updateBatchControlsUI();
        });

        thumbs.forEach(thumb => {
            thumb.addEventListener('click', () => {
                this.openPreviewModal(img.key, img.originalName);
            });
        });

        // 目标日志缓存：日期更改事件触发时，自动本地写入 localStorage
        dateInput.addEventListener('change', (e) => {
            const dateVal = e.target.value;
            if (this.isValidDate(dateVal)) {
                localStorage.setItem(`pending_date_cache_${img.key}`, dateVal);
            }
        });

        processBtn.addEventListener('click', async () => {
            const dateVal = dateInput.value;
            if (!this.isValidDate(dateVal)) {
                alert('请选择或输入有效的复盘日期！');
                return;
            }
            await this.processSinglePendingItem(img.key, dateVal, row, processBtn, deleteBtn);
        });

        deleteBtn.addEventListener('click', async () => {
            if (confirm(`确定要丢弃该暂存文件吗？\n文件名: ${img.originalName}`)) {
                await this.deleteSinglePendingItem(img.key, row, processBtn, deleteBtn);
            }
        });

        return row;
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
        processBtn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> <span>解析中</span>`;

        try {
            const proxyConfig = this.getProxyConfig();
            const res = await api.processPendingImage(key, date, proxyConfig);
            if (res.error) throw new Error(res.error);

            // 清除缓存与选中状态
            localStorage.removeItem(`pending_date_cache_${key}`);
            this.selectedKeys.delete(key);

            // 成功后移除行
            rowElement.remove();
            if (this.pendingTbody.children.length === 0) {
                await this.loadPendingQueue();
            } else {
                this.updateBatchControlsUI();
            }

            // 同步刷新每日复盘日期选择列表
            this.app.reloadSummaries();
        } catch (err) {
            console.error(`Failed to process ${key}:`, err);
            alert(`解析失败: ${err.message || err}`);
            processBtn.disabled = false;
            deleteBtn.disabled = false;
            if (picker) picker.disabled = false;
            processBtn.innerHTML = originalBtnHTML;
            lucide.createIcons();
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }

    async deleteSinglePendingItem(key, rowElement, processBtn, deleteBtn) {
        if (this.isProcessing) return;

        processBtn.disabled = true;
        deleteBtn.disabled = true;

        try {
            const res = await api.deletePendingImage(key);
            if (res.error) throw new Error(res.error);

            // 清除缓存与选中状态
            localStorage.removeItem(`pending_date_cache_${key}`);
            this.selectedKeys.delete(key);

            rowElement.remove();
            if (this.pendingTbody.children.length === 0) {
                await this.loadPendingQueue();
            } else {
                this.updateBatchControlsUI();
            }
        } catch (err) {
            console.error(`Failed to delete ${key}:`, err);
            alert(`删除失败: ${err.message || err}`);
            processBtn.disabled = false;
            deleteBtn.disabled = false;
        }
    }

    async processAllPending() {
        if (this.isProcessing) {
            // 当处于批处理状态时，再次点击一键按钮转为【取消中止】动作
            if (!this.isCancelRequested) {
                this.isCancelRequested = true;
                this.pendingProcessAllBtn.setAttribute('disabled', 'true');
                this.pendingProcessAllBtn.className = "justify-center px-4 py-1.5 bg-slate-400 text-white rounded-xl text-xs font-bold shadow-sm flex items-center space-x-1.5 cursor-not-allowed";
                this.pendingProcessAllBtn.innerHTML = `<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> <span>正在优雅停止...</span>`;
                console.log("User requested cancellation of batch processing.");
            }
            return;
        }

        const rows = Array.from(this.pendingTbody.querySelectorAll('[data-key]'));
        if (rows.length === 0) {
            alert('当前暂存队列为空！');
            return;
        }

        const itemsToProcess = [];
        for (const row of rows) {
            const key = row.getAttribute('data-key');
            const dateInput = row.querySelector('.pending-date-input');
            const dateVal = dateInput ? dateInput.value : '';
            if (!this.isValidDate(dateVal)) {
                alert(`队列中有文件未设置有效日期，请检查！`);
                return;
            }
            itemsToProcess.push({ key, date: dateVal, row });
        }

        const concurrency = parseInt(this.concurrencySelect ? this.concurrencySelect.value : '3', 10) || 3;
        if (!confirm(`确定要启动并发解析处理吗？\n共 ${itemsToProcess.length} 个任务，并发数: ${concurrency}`)) {
            return;
        }

        this.isProcessing = true;
        this.isCancelRequested = false;
        this.togglePendingControls(false);

        // 核心：自切换为 🛑 中止取消状态形态
        this.pendingProcessAllBtn.removeAttribute('disabled');
        this.pendingProcessAllBtn.className = "justify-center px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5";
        this.pendingProcessAllBtn.innerHTML = `<i data-lucide="square" class="w-3.5 h-3.5"></i> <span>🛑 停止处理</span>`;
        lucide.createIcons();

        const proxyConfig = this.getProxyConfig();

        let index = 0;
        const total = itemsToProcess.length;
        let successCount = 0;
        let failCount = 0;

        const worker = async () => {
            while (index < total) {
                // 判断是否中断退出循环
                if (this.isCancelRequested) {
                    break;
                }

                const currentIndex = index++;
                const item = itemsToProcess[currentIndex];
                const processBtn = item.row.querySelector('.process-item-btn');
                const deleteBtn = item.row.querySelector('.delete-item-btn');
                const picker = item.row.querySelector('.pending-date-input');

                if (processBtn) {
                    processBtn.disabled = true;
                    processBtn.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;
                }
                if (deleteBtn) deleteBtn.disabled = true;
                if (picker) picker.disabled = true;

                try {
                    const res = await api.processPendingImage(item.key, item.date, proxyConfig);
                    if (res.error) throw new Error(res.error);

                    // 清除缓存与选中状态
                    localStorage.removeItem(`pending_date_cache_${item.key}`);
                    this.selectedKeys.delete(item.key);

                    item.row.remove();
                    successCount++;
                } catch (err) {
                    console.error(`Error processing ${item.key}:`, err);
                    if (processBtn) {
                        processBtn.disabled = false;
                        processBtn.innerHTML = `<i data-lucide="play" class="w-3 h-3"></i> <span>重试</span>`;
                    }
                    if (deleteBtn) deleteBtn.disabled = false;
                    if (picker) picker.disabled = false;
                    failCount++;
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrency, total); i++) {
            workers.push(worker());
        }

        await Promise.all(workers);

        this.isProcessing = false;
        const stoppedEarly = this.isCancelRequested;
        this.isCancelRequested = false;

        this.togglePendingControls(true);
        lucide.createIcons();

        if (stoppedEarly) {
            alert(`并发处理已强行中止！\n已成功: ${successCount} 个\n已失败: ${failCount} 个`);
        } else {
            alert(`批量处理全部完成！\n成功: ${successCount} 个\n失败: ${failCount} 个`);
        }

        await this.loadPendingQueue();
        this.app.reloadSummaries();
    }

    openPreviewModal(key, title) {
        this.modalTitle.textContent = title || '图片预览';
        this.modalImage.src = `/api/pending-image?key=${encodeURIComponent(key)}`;
        this.zoomLevel = 1.0;
        this.updateZoomTransform();

        this.previewModal.classList.remove('hidden');
        setTimeout(() => {
            this.previewModal.classList.remove('opacity-0');
            const inner = this.previewModal.querySelector('.transform');
            if (inner) inner.classList.remove('scale-95');
        }, 10);
    }

    closePreviewModal() {
        this.previewModal.classList.add('opacity-0');
        const inner = this.previewModal.querySelector('.transform');
        if (inner) inner.classList.add('scale-95');
        setTimeout(() => {
            this.previewModal.classList.add('hidden');
            this.modalImage.src = '';
        }, 200);
    }

    zoomImage(delta) {
        this.zoomLevel = Math.max(0.4, Math.min(3.0, this.zoomLevel + delta));
        this.updateZoomTransform();
    }

    resetZoomImage() {
        this.zoomLevel = 1.0;
        this.updateZoomTransform();
    }

    updateZoomTransform() {
        this.modalImage.style.transform = `scale(${this.zoomLevel})`;
        this.modalZoomResetBtn.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
}
