export const api = {
    getDailySummaries: () => fetch('/api/daily-summaries').then(r => r.json()),
    getDailyDetails: (date) => fetch(`/api/daily-details/${encodeURIComponent(date)}`).then(r => r.json()),
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
        return fetch('/api/search?' + queryParams.toString()).then(r => r.json());
    },
    getActiveSectors: (days) => fetch(`/api/active-sectors?days=${days}`).then(r => r.json()),
    uploadImage: (formData) => fetch('/api/upload', { method: 'POST', body: formData }).then(r => r.json()),
    batchUpload: (formData) => fetch('/api/batch/upload', { method: 'POST', body: formData }).then(r => r.json()),
    batchProcess: (payload) => fetch('/api/batch/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()),
    listPendingImages: () => fetch('/api/pending-images').then(r => r.json()),
    processPendingImage: (key, date) => fetch('/api/batch/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, date }) }).then(r => r.json()),
    commitParsedMarkdown: (key, date, rawMarkdown) => fetch('/api/batch/commit-parsed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, date, rawMarkdown }) }).then(r => r.json()),
    deletePendingImage: (key) => fetch('/api/pending-image', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).then(r => r.json())
};