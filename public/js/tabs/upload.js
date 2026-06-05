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

        // 初始化默认日期 (当天)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        this.dateInput.value = `${year}-${month}-${day}`;

        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(name => {
            this.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
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
            this.handleFiles(e.dataTransfer.files);
        });

        this.viewReviewBtn.addEventListener('click', () => {
            this.app.deepLinkDate(this.dateInput.value);
        });
        this.continueUploadBtn.addEventListener('click', () => this.resetForm());
        this.markdownToggleBtn.addEventListener('click', () => this.toggleMarkdown());
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
        const file = files[0];

        this.selectedFileName.textContent = file.name;
        this.selectedFileInfo.classList.remove('hidden');

        // 正则提取文件名里的日期
        const extDate = this.extractDate(file.name);
        // 仅当提取出了日期，并且是一个真实有效的自然日时才进行赋值覆盖，避免浏览器静默置空
        if (extDate && this.isValidDate(extDate)) {
            this.dateInput.value = extDate;
        }

        this.uploadFile(file, this.dateInput.value);
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