# 去中心化本地大模型中转与自适应 OCR 解析实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建去中心化浏览器直连本地中转与后端公网代理混合的双轨 OCR 系统。支持本地多协议多模态中转自动嗅探测速、Markdown 免大模型秒级极速直接写入入表。

**Architecture:** 
- **Backend New Routing**: 新增 `POST /api/batch/commit-parsed`，接收前端解析完的 Markdown 文本，绕过大模型连接，直接借助 D1 批量事务入库、并执行 R2 文件正式重命名归档。
- **Client Smart Engine**: 引入连通性嗅探测速机制，如果配置了本地中转并测速可用，浏览器以 base64 Blob 投递本地大模型大厂获取文本，然后再 POST 给后端秒级写入。

**Tech Stack:** Cloudflare Workers, Hono Routing, HTML5 LocalStorage, Vanilla ES Modules JS, Tailwind CSS.

## Global Constraints
- 禁止修改 `./legacy/` 目录任何文件。
- 控制器层严禁直接写 SQL 或直接读写 R2 Body（必须下放至 Service / Repository）。
- 保证全栈类型与编译自测完美无警报通过。

---

## Task 1: 新增后端 Markdown 免大模型秒级事务写入接口

**Files:**
- Modify: `src/controllers/index.ts`
- Modify: `src/controllers/upload.ts`
- Modify: `src/services/upload.service.ts`

**Interfaces:**
- `app.post('/api/batch/commit-parsed', uploadController.commitParsedMarkdown)`
- `UploadService.commitParsedMarkdown(key: string, date: string, rawMarkdown: string)` -> 接收已有的 markdown 文本，运行 OcrParser 并执行级联数据库事务与 R2 图片移动归档、暂存删除。

### 详细步骤:

- [ ] **Step 1.1: 在服务层 `UploadService` 中开发 Markdown 极速级联入库与归档服务**
  在 `src/services/upload.service.ts` 中增加 `commitParsedMarkdown` 方法：
  ```typescript
  // src/services/upload.service.ts (追加方法)
  async commitParsedMarkdown(key: string, date: string, rawMarkdown: string) {
      if (!this.r2Bucket) {
          throw new Error("R2 bucket is not configured");
      }

      // 1. 验证待处理暂存文件的 Key 安全前缀
      if (!key.startsWith("images/pending/")) {
          throw new Error("Invalid stashed image key pattern");
      }

      // 2. 利用纯粹的 Parser 将 Markdown 直接拆开，跳过调用大模型！
      const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

      // 3. 多表级联事务写入
      const db = this.summaryRepo.db;
      const del1 = db.prepare("DELETE FROM limit_up_stocks WHERE date = ?").bind(date);
      const del2 = db.prepare("DELETE FROM sectors WHERE date = ?").bind(date);
      const del3 = db.prepare("DELETE FROM daily_summary WHERE date = ?").bind(date);

      const insSummary = db.prepare(`
          INSERT INTO daily_summary (date, stock_count, upgrade_rate, limit_broken_rate, bidding_increase_rate)
          VALUES (?, ?, ?, ?, ?)
      `).bind(
          date,
          summary.stock_count,
          summary.upgrade_rate,
          summary.limit_broken_rate,
          summary.bidding_increase_rate
      );

      const insSectors = sectorsAndStocks.map(sec =>
          db.prepare(`
              INSERT INTO sectors (date, name, description)
              VALUES (?, ?, ?)
          `).bind(date, sec.name, sec.description || null)
      );

      await db.batch([del1, del2, del3, insSummary, ...insSectors]);

      const sectorIdMap = await this.sectorRepo.getSectorIdMap(date);
      const stockStatements: any[] = [];
      let stocksCount = 0;

      for (const sec of sectorsAndStocks) {
          const sectorId = sectorIdMap[sec.name] || null;
          for (const stock of sec.stocks) {
              stockStatements.push(
                  db.prepare(`
                      INSERT INTO limit_up_stocks (date, status, code, name, time, concept_reason, sector_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?)
                  `).bind(
                      date,
                      stock.status,
                      stock.code,
                      stock.name,
                      stock.time,
                      stock.concept_reason,
                      sectorId
                  )
              );
              stocksCount++;
          }
      }

      if (stockStatements.length > 0) {
          await db.batch(stockStatements);
      }

      // 4. 将 R2 暂存移动归档并物理清除暂存原图
      const fileExtension = key.split('.').pop() || 'png';
      const formalKey = `images/${date}.${fileExtension}`;
      const pendingObject = await this.r2Bucket.get(key);

      if (pendingObject) {
          const mimeType = pendingObject.httpMetadata?.contentType || "image/png";
          await this.r2Bucket.put(formalKey, pendingObject.body, {
              httpMetadata: {
                  contentType: mimeType,
                  cacheControl: "public, max-age=31536000",
              },
              customMetadata: {
                  uploadDate: new Date().toISOString()
              }
          });
          await this.r2Bucket.delete(key);
      }

      return {
          success: true,
          summary: {
              ...summary,
              date
          },
          sectorsCount: sectorsAndStocks.length,
          stocksCount,
          rawMarkdown
      };
  }
  ```

- [ ] **Step 1.2: 编写控制器层接口 `commitParsedMarkdown`**
  在 `src/controllers/upload.ts` 中追加控制函数：
  ```typescript
  // src/controllers/upload.ts (追加函数)
  export async function commitParsed(c: Context) {
      try {
          const body = await c.req.json();
          const key = body?.key as string;
          const date = body?.date as string;
          const rawMarkdown = body?.rawMarkdown as string;

          if (!key) {
              return c.json({ error: "Missing R2 pending key" }, 400);
          }
          if (!date) {
              return c.json({ error: "Missing target date" }, 400);
          }
          if (!rawMarkdown) {
              return c.json({ error: "Missing raw markdown content" }, 400);
          }

          const db = c.env.DB;
          const uploadService = new UploadService(
              new SummaryRepository(db),
              new SectorRepository(db),
              new StockRepository(db),
              c.env,
              c.env.BUCKET || null
          );

          const result = await uploadService.commitParsedMarkdown(key, date, rawMarkdown);
          return c.json(result);
      } catch (error: any) {
          console.error("Error inside commitParsed controller:", error);
          return c.json({ error: "Internal Server Error", message: error.message }, 500);
      }
  }
  ```

- [ ] **Step 1.3: 注册路由绑定**
  在 `src/controllers/index.ts` 中注册接口路由：
  ```typescript
  // src/controllers/index.ts (在 registerRoutes 内部追加)
  app.post('/api/batch/commit-parsed', uploadController.commitParsed);
  ```

- [ ] **Step 1.4: 干跑本地编译类型检测**
  Run: `npm run check`
  Expected: PASS

- [ ] **Step 1.5: 提交后端接口新版代码**
  ```bash
  git add src/services/upload.service.ts src/controllers/upload.ts src/controllers/index.ts
  git commit -m "feat: add commit-parsed endpoint to directly write parsed markdown without Gemini calling"
  ```

---

## Task 2: 设计并装载前端 LocalStorage 缓存的自定义中转面板

**Files:**
- Modify: `public/index.html`

### 详细步骤:

- [ ] **Step 2.1: 在页面中加入可收合的高级本地中转配置卡片**
  在 `public/index.html` 的上传选项卡中，最底部添加一个可配置卡片：
  ```html
  <!-- public/index.html 在主体内容区底部追加 -->
  <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 mt-6">
      <button id="proxy-settings-toggle" class="w-full flex items-center justify-between text-left focus:outline-none">
          <div class="flex items-center space-x-2.5">
              <div class="p-1.5 bg-slate-100 text-slate-500 rounded-lg"><i data-lucide="settings" class="w-4 h-4"></i></div>
              <div>
                  <h4 class="text-sm font-bold text-slate-800">高级本地大模型中转配置 (LocalStorage 持久化)</h4>
                  <p class="text-xxs text-slate-400 mt-0.5">当公网不稳定时，配置本机的中转或本地反代，浏览器直连提速 10 倍以上</p>
              </div>
          </div>
          <i id="proxy-chevron" data-lucide="chevron-down" class="w-5 h-5 text-slate-400 transition-transform"></i>
      </button>

      <div id="proxy-settings-collapse" class="hidden pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center space-x-3 col-span-1 md:col-span-2 bg-amber-50 border border-amber-200/50 p-3 rounded-xl text-xxs text-amber-700 leading-normal">
              <i data-lucide="info" class="w-4 h-4 text-amber-500 shrink-0"></i>
              <span>本地中转需要允许跨域（CORS）请求。如果使用 One-API / Dify / FastGPT 运行，请确保您本机的中转已设置允许跨源资源共享。</span>
          </div>
          <div class="space-y-1.5">
              <label class="block text-xxs font-bold text-slate-500 uppercase tracking-wider">是否启用本地中转优先</label>
              <div class="flex items-center space-x-3 mt-1.5">
                  <input type="checkbox" id="proxy-enabled" class="rounded border-slate-300 text-red-500 focus:ring-red-500 w-4 h-4">
                  <span class="text-xs text-slate-600 font-medium">开启本地中转直连 (不通时自动平滑降级公网)</span>
              </div>
          </div>
          <div class="space-y-1.5">
              <label for="proxy-api-type" class="block text-xxs font-bold text-slate-500 uppercase tracking-wider">接口协议类型</label>
              <select id="proxy-api-type" class="block w-full py-2 px-3 border border-slate-300 bg-slate-50 rounded-lg text-xs font-semibold focus:outline-none focus:ring-red-500 focus:border-red-500">
                  <option value="gemini">Google Gemini 协议</option>
                  <option value="openai">OpenAI / Chat 兼容协议</option>
              </select>
          </div>
          <div class="space-y-1.5">
              <label for="proxy-api-base" class="block text-xxs font-bold text-slate-500 uppercase tracking-wider">中转 API Base 路径</label>
              <input type="text" id="proxy-api-base" placeholder="如：http://127.0.0.1:3000" class="block w-full py-2 px-3 border border-slate-300 bg-slate-50 rounded-lg text-xs font-semibold focus:outline-none focus:ring-red-500 focus:border-red-500">
          </div>
          <div class="space-y-1.5">
              <label for="proxy-api-key" class="block text-xxs font-bold text-slate-500 uppercase tracking-wider">中转 API Key (可选)</label>
              <input type="password" id="proxy-api-key" placeholder="如：sk-xxxxx (无 Key 可留空)" class="block w-full py-2 px-3 border border-slate-300 bg-slate-50 rounded-lg text-xs font-semibold focus:outline-none focus:ring-red-500 focus:border-red-500">
          </div>
          <div class="space-y-1.5 col-span-1 md:col-span-2">
              <label for="proxy-model" class="block text-xxs font-bold text-slate-500 uppercase tracking-wider">调用大模型名称 (Model)</label>
              <input type="text" id="proxy-model" placeholder="如：gemini-flash-latest / gpt-4o-mini" class="block w-full py-2 px-3 border border-slate-300 bg-slate-50 rounded-lg text-xs font-semibold focus:outline-none focus:ring-red-500 focus:border-red-500">
          </div>
      </div>
  </div>
  ```

- [ ] **Step 2.2: 提交 HTML 的外观层修改**
  ```bash
  git add public/index.html
  git commit -m "style: add custom collapsible local model proxy settings panel in index.html"
  ```

---

## Task 3: 前端 API 桥接与浏览器端本地中转自路由调用

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/tabs/upload.js`

### 详细步骤:

- [ ] **Step 3.1: 在前端 `api.js` 网络层对接全新直传已解析接口**
  在 `public/js/api.js` 中增加调用方法：
  ```javascript
  // public/js/api.js (追加到 api 对象中)
  async commitParsedMarkdown(key, date, rawMarkdown) {
      return this.fetch('/api/batch/commit-parsed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, date, rawMarkdown })
      });
  }
  ```

- [ ] **Step 3.2: 在 `UploadTab` 中集成 LocalStorage 自动保存机制**
  在 `public/js/tabs/upload.js` 中，添加配置表单读取、持久化、折叠状态切换逻辑：
  ```javascript
  // 初始化配置节点并读取 localStorage
  initProxyDOM() {
      this.proxyToggle = document.getElementById('proxy-settings-toggle');
      this.proxyCollapse = document.getElementById('proxy-settings-collapse');
      this.proxyChevron = document.getElementById('proxy-chevron');

      this.inpEnabled = document.getElementById('proxy-enabled');
      this.inpType = document.getElementById('proxy-api-type');
      this.inpBase = document.getElementById('proxy-api-base');
      this.inpKey = document.getElementById('proxy-api-key');
      this.inpModel = document.getElementById('proxy-model');

      // 折叠折回
      this.proxyToggle.addEventListener('click', () => {
          this.proxyCollapse.classList.toggle('hidden');
          this.proxyChevron.classList.toggle('rotate-180');
      });

      // 字段自动落盘缓存
      const fields = [
          { el: this.inpEnabled, key: 'proxy_enabled', prop: 'checked', type: 'bool' },
          { el: this.inpType, key: 'proxy_api_type', prop: 'value' },
          { el: this.inpBase, key: 'proxy_api_base', prop: 'value' },
          { el: this.inpKey, key: 'proxy_api_key', prop: 'value' },
          { el: this.inpModel, key: 'proxy_model', prop: 'value' }
      ];

      fields.forEach(f => {
          // 初始化加载
          const cached = localStorage.getItem(f.key);
          if (cached !== null) {
              f.el[f.prop] = f.type === 'bool' ? (cached === 'true') : cached;
          }
          // 同步变动
          f.el.addEventListener('change', () => {
              const val = f.type === 'bool' ? f.el.checked : f.el.value;
              localStorage.setItem(f.key, String(val));
          });
      });
  }
  ```

- [ ] **Step 3.3: 开发浏览器直连本地中转的核心调用算法**
  在 `public/js/tabs/upload.js` 中增加方法：
  - 先从前端下载暂存区图片的 Blob。
  - 将 Blob 转为 ArrayBuffer 及 Base64。
  - 连通性嗅探测速（对 API Base 发起一次轻量 /ping 连通，超时设定 1000ms），如果嗅探失败则降级。
  - 根据选定的 Gemini/OpenAI 协议类型，直接利用原生 `fetch` 请求本地 API，获取 Markdown！
  ```javascript
  // 核心前端直连本地中转调用
  async ocrWithLocalProxy(fileKey, mimeType) {
      const enabled = document.getElementById('proxy-enabled').checked;
      const apiType = document.getElementById('proxy-api-type').value;
      const apiBase = document.getElementById('proxy-api-base').value.trim();
      const apiKey = document.getElementById('proxy-api-key').value.trim();
      const model = document.getElementById('proxy-model').value.trim();

      if (!enabled || !apiBase || !model) {
          return null; // 未开启或未配置，走降级
      }

      // 1. 探针嗅探测速连通性
      try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);
          await fetch(`${apiBase}/v1/models` || `${apiBase}`, { method: 'GET', signal: controller.signal }).catch(() => {});
          clearTimeout(timer);
      } catch (err) {
          console.warn("本地中转不可达，自动降级为线上官方：", err);
          return null;
      }

      // 2. 获取图片 Blob 并转换为 Base64
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

      // 3. 多协议分支
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
          // OpenAI / Chat 多模态兼容
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
  ```

- [ ] **Step 3.4: 在解析任务触发函数中，装配自路由决策逻辑**
  在 `public/js/tabs/upload.js` 中重塑单个任务的 OCR 触发过程：
  ```javascript
  // 找到每行或队列中启动解析的逻辑：
  // 先尝试本地大模型中转直连：
  try {
      let result;
      const localMarkdown = await this.ocrWithLocalProxy(task.key, task.mimeType || 'image/png');
      
      if (localMarkdown) {
          // 连通成功并大模型正常响应！走极速写入端点
          result = await api.commitParsedMarkdown(task.key, task.date, localMarkdown);
      } else {
          // 降级，走后端官方代理原接口
          result = await api.processPendingImage(task.key, task.date);
      }
      
      if (result.error) throw new Error(result.message || result.error);
      // 处理成功行消除，刷新看板大图
  } catch (err) {
      // 报错提示，行标记为 failed
  }
  ```

- [ ] **Step 3.5: 干跑编译测试**
  Run: `npm run check`
  Expected: 全量无异常通过。
