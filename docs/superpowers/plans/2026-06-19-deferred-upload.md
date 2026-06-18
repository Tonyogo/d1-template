# 两步式暂存与延迟 OCR 处理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建两步式上传暂存与延迟/可视化选择日期 OCR 解析入库机制，极大提升高波动网络环境下大模型导入的成功率。

**Architecture:** 
- **Stage 1 (Upload)**: 直接将图片上传并物理暂存在 R2 的 `images/pending/${timestamp}_${original_name}` 路径下，第一阶段无大模型调用，保障上传瞬间完成。
- **Stage 2 (Query & Preview)**: 后端提供列表检索和防路径穿越的图片预览，前端渲染优雅的待处理仪表盘。
- **Stage 3 (Process)**: 串行触发局部大模型 OCR 转化与 D1 多表级联事务，完成后自动实现图片正式归档和暂存删除。

**Tech Stack:** TypeScript, Cloudflare Workers (Hono), Cloudflare D1, Cloudflare R2, Vanilla JS SPA.

## Global Constraints
- `legacy/` 目录为只读，绝对禁止修改其中文件。
- 后端必须严格遵守 **3-Tier 三层解耦架构** 规范，控制器禁止出现 D1 `prepare` / `all` / `batch` SQL 以及任何对 R2 Bucket 对象的 `get` / `put`，均下移到 Service 与 Repository 中。
- 严密防范路径穿越注入漏洞：在预览 pending 区域图片时，必须确保 key 强制以 `images/pending/` 前缀开始，否则直接返回 403 / 400。

---

## Task 1: 改造后端 R2 图片极速上传与待处理列表、预览服务

**Files:**
- Modify: `src/services/upload.service.ts`
- Modify: `src/controllers/upload.ts`
- Modify: `src/services/image.service.ts`
- Modify: `src/controllers/image.ts`
- Modify: `src/controllers/index.ts`

**Interfaces:**
- `UploadService.listPendingImages()` -> 返回所有处于待处理状态的对象数组，包含文件名、大小、时间以及建议的日期。
- `UploadService.stashPendingImage(file: File)` -> 返回带防冲突时间戳的 R2 `imageKey`。
- `ImageService.getPendingImage(key: string)` -> 读取并返回暂存的 `R2ObjectBody` 或 `null`。

### 详细步骤:

- [ ] **Step 1.1: 升级 `UploadService` 与 `ImageService` 服务层逻辑**
  在 `src/services/upload.service.ts` 中，更新 `stashPendingImage` 逻辑使其不强制要求 `date`，直接生成时间戳混淆名称；并增加 `listPendingImages()` 方法：
  ```typescript
  // src/services/upload.service.ts
  async stashPendingImage(file: File): Promise<{ success: boolean; imageKey: string }> {
      if (!this.r2Bucket) {
          throw new Error("R2 bucket is not configured for stashing");
      }
      const timestamp = Date.now();
      // 过滤和清理文件名中的非法字符
      const cleanedName = file.name.replace(/[\/\?<>\\:\*\|"]/g, '_');
      const pendingKey = `images/pending/${timestamp}_${cleanedName}`;

      await this.r2Bucket.put(pendingKey, file.stream(), {
          httpMetadata: {
              contentType: file.type || "image/png"
          }
      });

      return { success: true, imageKey: pendingKey };
  }

  async listPendingImages(): Promise<any[]> {
      if (!this.r2Bucket) {
          throw new Error("R2 bucket is not configured");
      }
      const listed = await this.r2Bucket.list({ prefix: "images/pending/" });
      const results: any[] = [];

      for (const obj of listed.objects) {
          const key = obj.key;
          // 提取真实文件名：去掉 images/pending/${timestamp}_
          const prefixMatch = key.match(/^images\/pending\/\d+_(.+)$/);
          const originalName = prefixMatch ? prefixMatch[1] : key.replace("images/pending/", "");
          
          // 智能分析建议日期
          const dateMatch = originalName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
          const suggestedDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

          results.push({
              key,
              originalName,
              size: obj.size,
              uploadedAt: obj.uploaded.toISOString(),
              suggestedDate
          });
      }

      // 按时间戳倒序排列（最新上传的优先展示）
      return results.sort((a, b) => b.key.localeCompare(a.key));
  }
  ```
  在 `src/services/image.service.ts` 中，增加读取暂存图片流方法：
  ```typescript
  // src/services/image.service.ts
  async getPendingImage(key: string): Promise<R2ObjectBody | null> {
      // 严格防御路径穿透
      if (!key.startsWith("images/pending/")) {
          throw new Error("Access denied: Invalid pending image path");
      }
      const object = await this.bucket.get(key);
      return object;
  }
  ```

- [ ] **Step 1.2: 升级控制器层与路由注册器**
  在 `src/controllers/upload.ts` 中增加 `listPendingImages` 接口，并调整 `batchUpload` 去掉强日期的依赖：
  ```typescript
  // src/controllers/upload.ts (修改/追加)
  export async function batchUpload(c: Context) {
      try {
          const formData = await c.req.formData();
          const file = (formData.get("file") || formData.get("image")) as File | null;

          if (!file) {
              return c.json({ error: "Missing file parameter" }, 400);
          }

          const db = c.env.DB;
          const uploadService = new UploadService(
              new SummaryRepository(db),
              new SectorRepository(db),
              new StockRepository(db),
              c.env,
              c.env.BUCKET || null
          );

          const result = await uploadService.stashPendingImage(file);
          return c.json(result);
      } catch (error: any) {
          console.error("Error inside batchUpload controller:", error);
          return c.json({ error: "Internal Server Error during batch upload", message: error.message }, 500);
      }
  }

  export async function listPendingImages(c: Context) {
      if (!c.env.BUCKET) {
          return c.json({ error: "R2 bucket is not configured" }, 500);
      }
      try {
          const db = c.env.DB;
          const uploadService = new UploadService(
              new SummaryRepository(db),
              new SectorRepository(db),
              new StockRepository(db),
              c.env,
              c.env.BUCKET
          );
          const list = await uploadService.listPendingImages();
          return c.json(list);
      } catch (error: any) {
          console.error("Error inside listPendingImages controller:", error);
          return c.json({ error: "Internal Server Error listing pending images", message: error.message }, 500);
      }
  }
  ```
  在 `src/controllers/image.ts` 中增加 `getPendingImage` 控制器：
  ```typescript
  // src/controllers/image.ts (追加)
  export async function getPendingImage(c: Context) {
      const key = c.req.query('key');
      if (!key) {
          return c.json({ error: "Missing key parameter" }, 400);
      }
      if (!key.startsWith("images/pending/")) {
          return c.json({ error: "Forbidden" }, 403);
      }
      if (!c.env.BUCKET) {
          return c.json({ error: "R2 bucket is not configured" }, 500);
      }

      const imageService = new ImageService(c.env.BUCKET);
      try {
          const object = await imageService.getPendingImage(key);
          if (!object) {
              return c.json({ error: "Pending image not found" }, 404);
          }

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set("etag", object.httpEtag);
          headers.set("cache-control", "public, max-age=604800"); // 暂存图片缓存 7 天

          return new Response(object.body, { headers });
      } catch (error: any) {
          console.error("Error retrieving pending image inside controller:", error);
          return c.json({ error: "Internal Server Error", message: error.message }, 500);
      }
  }
  ```
  在 `src/controllers/index.ts` 中完成新路由定义注册：
  ```typescript
  // src/controllers/index.ts (在 registerRoutes 内添加)
  app.get('/api/pending-images', uploadController.listPendingImages);
  app.get('/api/pending-image', imageController.getPendingImage);
  ```

- [ ] **Step 1.3: 运行静态代码检查，确保语法和类型完美**
  Run: `npm run check`
  Expected: 无 TypeScript 类型或编译错误。

- [ ] **Step 1.4: 提交第一阶段后端文件准备**
  ```bash
  git add src/services/upload.service.ts src/controllers/upload.ts src/services/image.service.ts src/controllers/image.ts src/controllers/index.ts
  git commit -m "feat: implement raw pending image storage, listing and image streaming endpoints"
  ```

---

## Task 2: 改造指定未处理图片 OCR 转换及多表级联归档服务

**Files:**
- Modify: `src/services/upload.service.ts`
- Modify: `src/controllers/upload.ts`

**Interfaces:**
- `UploadService.processStashedImage(key: string, date: string)` -> 根据传入的目标 Key，提取 R2 源文件，运行 Gemini 并处理级联数据库事务，随后将图片移入正式目录、删除暂存。

### 详细步骤:

- [ ] **Step 2.1: 改造 `processStashedImage` 实现精准定位与归档移置**
  修改 `src/services/upload.service.ts`，将原来穷举后缀改写为直接基于 `key` 参数获取图片，并对后缀和类型精确处理。
  ```typescript
  // src/services/upload.service.ts (更新 processStashedImage 方法)
  async processStashedImage(key: string, date: string) {
      if (!this.r2Bucket) {
          throw new Error("R2 bucket is not configured");
      }

      // 1. 获取指定 key 对应的 pending 资源
      if (!key.startsWith("images/pending/")) {
          throw new Error("Invalid stashed image key pattern");
      }
      const pendingObject = await this.r2Bucket.get(key);
      if (!pendingObject) {
          throw new Error(`Stashed pending image not found: ${key}`);
      }

      const mimeType = pendingObject.httpMetadata?.contentType || "image/png";
      const tempResponse = new Response(pendingObject.body);
      const imageBlob = await tempResponse.blob();

      // 2. Gemini OCR 智能多模态提取
      const rawMarkdown = await GeminiClient.callGeminiOCR(imageBlob, mimeType, this.env);
      const { summary, sectorsAndStocks } = OcrParser.parseOcrMarkdown(rawMarkdown);

      // 3. 多表级联 D1 批量事务写入
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

      // 提交第一阶段删除与日常总结/板块插入
      await db.batch([del1, del2, del3, insSummary, ...insSectors]);

      // 获取新插入板块的 id 索引映射
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

      // 4. 将图片重命名移动到正式归档目录，并彻底安全删除 images/pending/ 下的原图
      const fileExtension = key.split('.').pop() || 'png';
      const formalKey = `images/${date}.${fileExtension}`;

      // 再次取得 pending 对象的只读 Body 并推送到正式归档
      const archiveObject = await this.r2Bucket.get(key);
      if (archiveObject) {
          await this.r2Bucket.put(formalKey, archiveObject.body, {
              httpMetadata: {
                  contentType: mimeType,
                  cacheControl: "public, max-age=31536000", // 归档持久化 1 年缓存
              },
              customMetadata: {
                  uploadDate: new Date().toISOString()
              }
          });
          // 彻底物理删除 R2 的 pending 区域图片，保障空间整洁
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

- [ ] **Step 2.2: 改造控制器 `batchProcess`**
  使其接收参数中包含 `key` 和 `date`，并在运行异常时，保障不会导致原始待处理图片丢失：
  ```typescript
  // src/controllers/upload.ts (修改 batchProcess 方法)
  export async function batchProcess(c: Context) {
      if (!c.env.GEMINI_API_KEY) {
          return c.json({ error: "GEMINI_API_KEY is not configured. Please set it in your environment." }, 400);
      }

      try {
          const body = await c.req.json();
          const key = body?.key as string;
          const date = body?.date as string;

          if (!key) {
              return c.json({ error: "Missing R2 pending file key" }, 400);
          }
          if (!date) {
              return c.json({ error: "Missing target date parameter" }, 400);
          }

          const db = c.env.DB;
          const uploadService = new UploadService(
              new SummaryRepository(db),
              new SectorRepository(db),
              new StockRepository(db),
              c.env,
              c.env.BUCKET || null
          );

          const result = await uploadService.processStashedImage(key, date);
          return c.json(result);
      } catch (error: any) {
          console.error("Error inside batchProcess controller:", error);
          return c.json({ error: "Internal Server Error during batch processing", message: error.message }, 500);
      }
  }
  ```

- [ ] **Step 2.3: 运行代码干跑检查**
  Run: `npm run check`
  Expected: PASS

- [ ] **Step 2.4: 提交后端 OCR 与归档变更**
  ```bash
  git add src/services/upload.service.ts src/controllers/upload.ts
  git commit -m "feat: upgrade batchProcess to consume targeted stashed files and archive them"
  ```

---

## Task 3: 改造前端 API 及两步式待处理控制台界面组件

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/tabs/upload.js`
- Modify: `public/index.html`

### 详细步骤:

- [ ] **Step 3.1: 在前端 `api.js` 中增加获取 pending 图片列表、单图延迟 OCR 处理抽象方法**
  在 `public/js/api.js` 中，添加两个全新的网络请求映射：
  ```javascript
  // public/js/api.js (追加到 api 对象内)
  async listPendingImages() {
      return this.fetch('/api/pending-images');
  },
  async processPendingImage(key, date) {
      return this.fetch('/api/batch/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, date })
      });
  }
  ```

- [ ] **Step 3.2: 升级前端 UI DOM 结构 ＆ 待处理图片大列表面板**
  在 `public/index.html` 的上传选项卡板块内添加专门存放“暂存待处理图片”的控制区域：
  ```html
  <!-- public/index.html 查找已有的 id="upload-tab" 的位置，合适处新增待处理列表结构 -->
  <div class="mt-8 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden hidden" id="pending-console-container">
      <div class="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div class="flex items-center space-x-2">
              <i data-lucide="cloud-lightning" class="w-5 h-5 text-amber-500"></i>
              <h3 class="text-base font-bold text-slate-800">云端暂存待处理复盘图列表</h3>
          </div>
          <div class="flex items-center space-x-3">
              <button id="pending-refresh-btn" class="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                  <span>刷新</span>
              </button>
              <button id="pending-run-all-btn" class="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 shadow-sm transition">
                  <i data-lucide="play" class="w-3.5 h-3.5"></i>
                  <span>队列顺序一键 OCR</span>
              </button>
          </div>
      </div>
      <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
              <thead>
                  <tr class="border-b border-slate-100 text-xs font-semibold text-slate-400 bg-slate-50/20">
                      <th class="px-6 py-3">预览</th>
                      <th class="px-4 py-3">原始文件名</th>
                      <th class="px-4 py-3">上传时间</th>
                      <th class="px-4 py-3">文件大小</th>
                      <th class="px-4 py-3">目标复盘日期</th>
                      <th class="px-4 py-3 text-right">操作</th>
                  </tr>
              </thead>
              <tbody id="pending-tbody" class="divide-y divide-slate-100">
                  <!-- JS 动态灌入 -->
              </tbody>
          </table>
      </div>
  </div>

  <!-- 全局精美图片预览遮罩 Modal -->
  <div id="image-preview-modal" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
      <div class="relative bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <span id="preview-modal-title" class="font-bold text-slate-800 truncate">图片预览</span>
              <button id="preview-modal-close" class="text-slate-400 hover:text-slate-600 transition">
                  <i data-lucide="x" class="w-6 h-6"></i>
              </button>
          </div>
          <div class="flex-1 overflow-auto bg-slate-900 flex items-center justify-center p-4 min-h-[400px]">
              <img id="preview-modal-img" class="max-w-full max-h-[70vh] object-contain rounded shadow" src="" alt="预览">
          </div>
      </div>
  </div>
  ```

- [ ] **Step 3.3: 改造前端 `public/js/tabs/upload.js` 核心控制台逻辑**
  通过集成 `listPendingImages` 接口，渲染优雅的数据交互体系，并支持图片点击全屏放大预览：
  ```javascript
  // 在 UploadTab 中实现加载云端暂存列表和各项交互
  ```
  在 `public/js/tabs/upload.js` 初始化时加入调用并在 DOM 实例化中添加：
  - `this.loadPendingImages()` (从 R2 获取待处理对象并渲染)
  - 缩略图 `click` -> 开 Modal。
  - 日期绑定 `change` -> 实时绑定到缓存里。
  - 单张点击处理 -> 触发局部 OCR 解析事务，大看板动态重载。
  - 一键队列顺序处理。

- [ ] **Step 3.4: 静态运行并部署验证**
  在本地开发环境下，模拟上传，通过预览面板，绑定日期并完美通过 Gemini OCR 智能入库！
