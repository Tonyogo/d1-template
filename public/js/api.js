export const api = {
    // 统一处理响应校验，对所有 !response.ok 的错误抛出附带状态码的统一详细错误
    async fetchJson(url, options = {}) {
        const res = await fetch(url, options);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.message || errData.error || `HTTP 错误 (状态码: ${res.status})`;
            throw new Error(errMsg);
        }
        return await res.json();
    },

    getDailySummaries: () => api.fetchJson('/api/daily-summaries'),
    getDailyDetails: (date) => api.fetchJson(`/api/daily-details/${encodeURIComponent(date)}`),
    searchStocks: (params) => {
        const queryParams = new URLSearchParams();
        if (params.q) queryParams.append('q', params.q);
        if (params.sectors) {
            params.sectors.forEach(s => queryParams.append('sectors', s));
        }
        if (params.concept_reasons) {
            params.concept_reasons.forEach(r => queryParams.append('concept_reasons', r));
        }
        queryParams.append('sector_match_mode', params.sector_match_mode || 'exact');
        return api.fetchJson('/api/search?' + queryParams.toString());
    },
    getActiveSectors: (days) => api.fetchJson(`/api/active-sectors?days=${days}`),
    stashPendingImage: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.fetchJson('/api/batch/upload', { method: 'POST', body: formData });
    },
    batchUpload: (formData) => api.fetchJson('/api/batch/upload', { method: 'POST', body: formData }),
    batchProcess: (payload) => api.fetchJson('/api/batch/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    listPendingImages: () => api.fetchJson('/api/pending-images'),
    processPendingImage: (key, date) => api.fetchJson('/api/batch/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, date }) }),
    commitParsedMarkdown: (key, date, rawMarkdown) => api.fetchJson('/api/batch/commit-parsed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, date, rawMarkdown }) }),
    deletePendingImage: (key) => api.fetchJson('/api/pending-image', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }),
    getMarkdown: (date) => api.fetchJson(`/api/markdown?date=${encodeURIComponent(date)}`),
    commitMarkdownUpdate: (payload) => api.fetchJson('/api/markdown/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
};