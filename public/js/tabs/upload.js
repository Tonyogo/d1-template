import { api } from '../api.js';

export class UploadTab {
    constructor(app) {
        this.app = app;
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

        if (!this.proxyToggle) return; // 如果未引入 HTML

        this.proxyToggle.addEventListener('click', () => {
            this.proxyCollapse.classList.toggle('hidden');
            this.proxyChevron.classList.toggle('rotate-180');
        });

        const fields = [
            { el: this.inpEnabled, key: 'proxy_enabled', prop: 'checked', type: 'bool' },
            { el: this.inpType, key: 'proxy_api_type', prop: 'value' },
            { el: this.inpBase, key: 'proxy_api_base', prop: 'value' },
            { el: this.inpKey, key: 'proxy_api_key', prop: 'value' },
            { el: this.inpModel, key: 'proxy_model', prop: 'value' }
        ];

        fields.forEach(f => {
            const cached = localStorage.getItem(f.key);
            if (cached !== null) {
                f.el[f.prop] = f.type === 'bool' ? (cached === 'true') : cached;
            }
            f.el.addEventListener('change', () => {
                const val = f.type === 'bool' ? f.el.checked : f.el.value;
                localStorage.setItem(f.key, String(val));
            });
        });
    }

    async ocrWithLocalProxy(fileKey, mimeType) {
        if (!this.inpEnabled) return null;

        const enabled = this.inpEnabled.checked;
        const apiType = this.inpType.value;
        let apiBase = this.inpBase.value.trim();
        const apiKey = this.inpKey.value.trim();
        const model = this.inpModel.value.trim();

        if (!enabled || !apiBase || !model) return null;

        // Remove trailing slash if present
        if (apiBase.endsWith('/')) {
            apiBase = apiBase.slice(0, -1);
        }

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1200);
            await fetch(`${apiBase}/v1/models` || `${apiBase}`, { method: 'GET', signal: controller.signal }).catch(() => {});
            clearTimeout(timer);
        } catch (err) {
            console.warn("本地中转不可达，自动降级为线上官方：", err);
            return null;
        }

        const imgRes = await fetch(`/api/pending-image?key=${encodeURIComponent(fileKey)}`);
        if (!imgRes.ok) throw new Error("获取暂存图片流失败");
        const blob = await imgRes.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64String = btoa(binary);

        const prompt = "请对输入图片执行以下任务：1. 提取图片中所有可见文字 2. 保持原始阅读顺序 3. 按内容结构转换为 Markdown 4. 只输出最终 Markdown 格式";
        const systemPrompt = "你是一个专业的 OCR 与文档结构重建引擎。\n你的任务是将图片中的文字内容，严格、完整地转换为 Markdown 文档。";

        if (apiType === 'gemini') {
            const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { inlineData: { data: base64String, mimeType: mimeType || "image/png" } },
                            { text: prompt }
                        ]
                    }],
                    systemInstruction: { parts: [{ text: systemPrompt }] }
                })
            });
            if (!res.ok) throw new Error(`本地 Gemini 中转请求失败: ${res.status}`);
            const json = await res.json();
            return json.candidates[0].content.parts[0].text;
        } else {
            const url = `${apiBase}/v1/chat/completions`;
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: `data:${mimeType || 'image/png'};base64,${base64String}` } }
                        ]
                    }]
                })
            });
            if (!res.ok) throw new Error(`本地 OpenAI 兼容中转请求失败: ${res.status}`);
            const json = await res.json();
            return json.choices[0].message.content;
        }
    }

    getTodayDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async handleFiles(files) {
        if (!files || files.length === 0) return;
        if (this.isProcessing) return;

        this.isProcessing = true;
        this.togglePendingControls(false);

        const total = files.length;
        let uploadedCount = 0;

        const originalDropZoneHTML = this.dropZone.innerHTML;
        this.updateDropZoneProgress(uploadedCount, total);

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await api.batchUpload(formData);
                    if (res.error) {
                        throw new Error(res.message || res.error);
                    }
                    uploadedCount++;
                    this.updateDropZoneProgress(uploadedCount, total);
                } catch (err) {
                    console.error(`Failed to upload ${file.name}:`, err);
                    alert(`文件 "${file.name}" 云端暂存失败: ${err.message || err}`);
                }
            }
        } finally {
            // 还原拖拽区域 UI
            this.dropZone.innerHTML = originalDropZoneHTML;
            this.fileInput.value = '';
            this.isProcessing = false;
            this.togglePendingControls(true);

            // 重新刷新待处理暂存队列
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
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
                    <p class="text-sm font-bold text-slate-700" id="stash-progress-msg">正在上传并云端暂存图片... (${uploaded}/${total})</p>
                    <p class="text-xxs text-slate-400">请勿关闭当前页面，上传成功后会自动刷新待处理列表</p>
                </div>
            `;
        }
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

            this.pendingTbody.innerHTML = '';

            if (!pendingImages || pendingImages.length === 0) {
                this.pendingTbody.innerHTML = `
                    <tr id="pending-empty-row">
                        <td colspan="5" class="text-center py-16 text-slate-400">
                            <div class="flex flex-col items-center justify-center space-y-3">
                                <div class="p-3 bg-slate-50 rounded-full text-slate-300 border border-slate-100">
                                    <i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i>
                                </div>
                                <div class="text-sm font-semibold text-slate-600">云端暂存队列为空</div>
                                <p class="text-xs text-slate-400 max-w-xs leading-relaxed">
                                    您可以拖拽或选择多个复盘长图到上方区域进行“极速云暂存”，然后再到此处统一进行智能解析与 D1 入库。
                                </p>
                            </div>
                        </td>
                    </tr>
                `;
                lucide.createIcons();
                return;
            }

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
            let data;
            const ext = key.split('.').pop().toLowerCase();
            const mimeMap = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'png': 'image/png' };
            const mimeType = mimeMap[ext] || 'image/png';

            const localMarkdown = await this.ocrWithLocalProxy(key, mimeType);

            if (localMarkdown) {
                console.log("Using decentralized local proxy OCR result.");
                data = await api.commitParsedMarkdown(key, date, localMarkdown);
            } else {
                console.log("Fallback to cloud worker proxy OCR.");
                data = await api.processPendingImage(key, date);
            }

            if (data.error) {
                throw new Error(data.message || data.error);
            }

            rowElement.classList.remove('bg-blue-50/30');
            rowElement.classList.add('bg-emerald-50/30');
            processBtn.className = "px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1";
            processBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>解析成功</span>`;
            lucide.createIcons();

            await this.app.reloadSummaries();
            const selectEl = document.getElementById('date-select');
            if (selectEl) {
                selectEl.value = date;
            }

            setTimeout(() => {
                rowElement.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                setTimeout(() => {
                    rowElement.remove();
                    this.checkAndRenderEmptyRow();
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
                    this.checkAndRenderEmptyRow();
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

        const concurrencyLimit = this.concurrencySelect ? parseInt(this.concurrencySelect.value, 10) : 3;

        if (!confirm(`确定要开始一键并行处理当前队列中的所有 ${rows.length} 张图片吗？\n将开启 ${concurrencyLimit} 路线程同时并发导入。`)) {
            return;
        }

        this.isProcessing = true;
        this.togglePendingControls(false);

        let successCount = 0;
        let failCount = 0;

        const tasks = rows.map(row => {
            const picker = row.querySelector('input[type="date"]');
            const processBtn = row.querySelector('button.bg-red-500');
            const deleteBtn = row.querySelector('button.text-slate-500');
            const key = row.getAttribute('data-key');
            return { row, picker, processBtn, deleteBtn, key, processed: false };
        }).filter(t => t.processBtn && t.deleteBtn && t.picker && !t.processBtn.disabled);

        const processWorker = async (t) => {
            const date = t.picker.value;
            if (!this.isValidDate(date)) {
                t.row.className = "bg-red-50/30 transition duration-150";
                failCount++;
                return;
            }

            t.processBtn.disabled = true;
            t.deleteBtn.disabled = true;
            t.picker.disabled = true;

            const originalBtnHTML = t.processBtn.innerHTML;
            t.processBtn.className = "px-3 py-1 bg-red-400 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1 cursor-not-allowed";
            t.processBtn.innerHTML = `<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> <span>解析中...</span>`;
            t.row.className = "bg-blue-50/30 transition duration-150";

            try {
                let data;
                const ext = t.key.split('.').pop().toLowerCase();
                const mimeMap = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'png': 'image/png' };
                const mimeType = mimeMap[ext] || 'image/png';

                const localMarkdown = await this.ocrWithLocalProxy(t.key, mimeType);

                if (localMarkdown) {
                    console.log("Using decentralized local proxy OCR result.");
                    data = await api.commitParsedMarkdown(t.key, date, localMarkdown);
                } else {
                    console.log("Fallback to cloud worker proxy OCR.");
                    data = await api.processPendingImage(t.key, date);
                }

                if (data.error) {
                    throw new Error(data.message || data.error);
                }

                t.row.className = "bg-emerald-50/30 transition duration-150";
                t.processBtn.className = "px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1";
                t.processBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> <span>解析成功</span>`;
                lucide.createIcons();

                successCount++;

                setTimeout(() => {
                    t.row.classList.add('transition-opacity', 'duration-500', 'opacity-0');
                    setTimeout(() => {
                        t.row.remove();
                        this.checkAndRenderEmptyRow();
                    }, 500);
                }, 1200);

            } catch (err) {
                console.error('Failed processing item in loop:', err);
                t.row.className = "bg-red-50/30 transition duration-150";
                t.processBtn.disabled = false;
                t.deleteBtn.disabled = false;
                t.picker.disabled = false;
                t.processBtn.className = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition duration-150 inline-flex items-center space-x-1";
                t.processBtn.innerHTML = originalBtnHTML;
                lucide.createIcons();
                failCount++;
            }
        };

        try {
            // 通过 limitConcurrency 并发池一键并行解析，摆脱死循环人工等待延迟
            await this.limitConcurrency(tasks, concurrencyLimit, processWorker);

            await this.app.reloadSummaries();
            alert(`一键并行处理完成！\n成功：${successCount} 个\n失败：${failCount} 个`);
        } catch (err) {
            console.error('Error during one-key processing loop:', err);
            alert(`批量顺序处理出现异常: ${err.message || err}`);
        } finally {
            this.isProcessing = false;
            this.togglePendingControls(true);
        }
    }

    checkAndRenderEmptyRow() {
        if (this.pendingTbody.querySelectorAll('tr[id^="pending-row-"]').length === 0) {
            this.pendingTbody.innerHTML = `
                <tr id="pending-empty-row">
                    <td colspan="5" class="text-center py-16 text-slate-400">
                        <div class="flex flex-col items-center justify-center space-y-3">
                            <div class="p-3 bg-slate-50 rounded-full text-slate-300 border border-slate-100">
                                <i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i>
                            </div>
                            <div class="text-sm font-semibold text-slate-600">云端暂存队列为空</div>
                            <p class="text-xs text-slate-400 max-w-xs leading-relaxed">
                                您您可以拖拽或选择多个复盘长图到上方区域进行“极速云暂存”，然后再到此处统一进行智能解析与 D1 入库。
                            </p>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();
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

    isValidDate(dateString) {
        const reg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateString || !reg.test(dateString)) return false;

        const parts = dateString.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (year < 1000 || year > 3000 || month === 0 || month > 12) return false;

        const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
            monthLength[1] = 29;
        }

        return day > 0 && day <= monthLength[month - 1];
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

    resetForm() {
        this.fileInput.value = '';
        this.loadPendingQueue();
    }
}
