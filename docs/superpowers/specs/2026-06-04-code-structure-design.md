---
name: code-structure-optimization
description: Optimize project structure by adopting Hono, decoupling backend into 3-tier architecture, and separating frontend via Wrangler Assets.
metadata:
  type: project
---

# 🚀 A股涨停复盘看板代码结构优化设计规范 (A-Share Limit-up Dashboard Architecture Spec)

本文档规范了 A股涨停复盘看板项目的代码重构设计。本次优化的核心目的是消除原有单文件结构、前后端代码混杂的“代码坏味道”，通过 Hono 框架构建轻量且标准的后端三层架构，并将前端 SPA 页面通过 Cloudflare Wrangler Assets 机制实现彻底的前后端解耦。

---

## 🏛️ 1. 架构概览与部署模式

项目将由一个统一的代码库（Monorepo）管理，并分别部署在 Cloudflare Worker (计算与接口) 和 Cloudflare Assets (静态 CDN) 上。

* **Wrangler Assets 托管静态资源**：前端文件托管至 CDN，不消耗 Worker 运行时 CPU，实现冷启动零开销。
* **Hono 框架作为 API 路由**：取代手动 HTTP 路径匹配，实现高可读性、高性能的轻量级 API 调度。
* **后端三层架构 (3-Tier Backend)**：Hono Controller (控制层) -> Business Service (业务服务层) -> Repository/Parser (数据层/解析引擎)，职责单一，完全解耦。

---

## 📂 2. 结构化目录规范 (Target Directory Tree)

```text
d1-template/
├── wrangler.json           # 配置 assets.directory 指向 "./public"
├── package.json            # 声明 dependencies (新增 hono) 与 scripts
├── src/                    # === 1. 后端 API Worker (TypeScript) ===
│   ├── index.ts            # Hono App 入口与中间件配置
│   ├── types.ts            # 领域层强类型定义 (DbRows, DTOs, Context)
│   ├── controllers/        # 控制器层 (解析 HTTP 传参与标准化响应)
│   │   ├── index.ts        # 控制器总装与路由挂载
│   │   ├── upload.ts       # POST /api/upload 控制器
│   │   ├── review.ts       # GET /api/daily-summaries, /api/daily-details/:date 控制器
│   │   ├── search.ts       # GET /api/search 控制器
│   │   ├── active.ts       # GET /api/active-sectors 控制器
│   │   └── image.ts        # GET /api/image 控制器
│   │
│   ├── services/           # 业务逻辑层 (多阶段逻辑协调、OCR 调度、核心算法)
│   │   ├── upload.service.ts  # 控制“OCR -> 解析 -> D1写事务 -> R2保存”的流水线
│   │   ├── review.service.ts  # 每日复盘概览与详情聚合同步
│   │   ├── search.service.ts  # 个股及过滤搜索业务逻辑
│   │   └── active.service.ts  # 活跃板块热度统计算法
│   │
│   ├── repositories/       # 数据访问层 (仅用于 D1 SQL 读写，不含任何业务规则)
│   │   ├── base.repository.ts  # D1 基础操作辅助器
│   │   ├── summary.repository.ts # daily_summary 表增删改查
│   │   ├── sector.repository.ts  # sectors 表增删改查
│   │   └── stock.repository.ts   # limit_up_stocks 表增删改查 (含复杂 CTE/HAVING 查询)
│   │
│   └── utils/              # 外部客户端与解析工具 (无状态，纯函数式调用)
│       ├── gemini.client.ts   # 封装 Gemini Flash OCR 视觉大模型接口
│       └── ocr-parser.ts      # Markdown 清洗与正则表达式数据结构化抽取器
│
├── public/                 # === 2. 前端单页应用 (Vanilla JS + Tailwind CSS) ===
│   ├── index.html          # SPA HTML
│   ├── css/
│   │   └── app.css         # 自定义全局样式
│   └── js/
│       ├── api.js          # API 客户端封装 (封装 fetch 请求)
│       ├── app.js          # 页面初始化与主交互核心
│       └── tabs/           # 按功能拆分的前端业务模块
│           ├── search.js   # 个股查询模块 DOM 维护
│           ├── review.js   # 每日复盘模块 DOM 维护
│           ├── active.js   # 活跃板块模块 DOM 维护
│           └── upload.js   # 拖拽上传与步骤进度条 DOM 维护
│
└── scripts/                # === 3. 运维与迁移脚本 ===
    └── dump_sqlite_to_d1.py
```

---

## 🛠️ 3. 核心分层及类设计说明

### 3.1 数据传输强类型规范 (`src/types.ts`)
统一管理后端所有的类型声明，消灭类型碎片化问题。

```typescript
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  GEMINI_API_KEY?: string;
  GEMINI_API_BASE?: string;
  GEMINI_MODEL?: string;
}

// 数据库基础物理模型 (Physical Tables Models)
export interface DailySummary {
  date: string;
  stock_count: number;
  upgrade_rate: number | null;
  limit_broken_rate: number | null;
  bidding_increase_rate: number | null;
}

export interface SectorRow {
  id: number;
  date: string;
  name: string;
  description: string | null;
}

export interface StockRow {
  id: number;
  date: string;
  status: string | null;
  code: string;
  name: string;
  time: string | null;
  concept_reason: string | null;
  sector_id: number | null;
}

// 接口 DTO 与中间状态 (DTOs & Parsed Types)
export interface StockParsed {
  status: string | null;
  code: string;
  name: string;
  time: string | null;
  concept_reason: string | null;
}

export interface SectorParsed {
  name: string;
  description: string;
  stocks: StockParsed[];
}

export interface OcrParsedPayload {
  summary: OcrParsedSummary;
  sectorsAndStocks: SectorParsed[];
}

export type OcrParsedSummary = Omit<DailySummary, 'date'>;
```

### 3.2 路由与控制层设计 (Hono Controllers)
Hono 控制器不进行任何 SQL 交互和业务处理。它们仅负责解析参数并将其流转给对应的 `Service`。

* **依赖注入（DI）机制**：
  在 Worker 的 `fetch` 触发时，控制器和 Service 通过 `c.env` 动态实例化并进行手动依赖构造，防止常驻内存泄漏，且对后续单元测试提供极其便利的 Mock 切入点。
  ```typescript
  // src/controllers/review.ts 伪代码
  export async function getDetails(c: Context) {
    const date = c.req.param('date');
    const db = c.env.DB;
    
    // 手动组装依赖链 (无状态类构造，性能极佳)
    const summaryRepo = new SummaryRepository(db);
    const sectorRepo = new SectorRepository(db);
    const stockRepo = new StockRepository(db);
    const reviewService = new ReviewService(summaryRepo, sectorRepo, stockRepo);
    
    try {
      const data = await reviewService.getReviewDetails(date);
      return c.json(data);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  }
  ```

### 3.3 业务服务层设计 (Services)
`UploadService` 是整个系统的核心流。它管理一个完整的长事务级联流程。

```typescript
// src/services/upload.service.ts
export class UploadService {
  constructor(
    private summaryRepo: SummaryRepository,
    private sectorRepo: SectorRepository,
    private stockRepo: StockRepository,
    private geminiClient: GeminiClient,
    private r2Bucket: R2Bucket | null
  ) {}

  async processUploadPipeline(file: File, date: string): Promise<UploadResponse> {
    const mimeType = file.type || "image/png";
    
    // 1. 调用大模型提取文本
    const rawMarkdown = await this.geminiClient.callOCR(file, mimeType);
    
    // 2. 解析文本
    const { summary, sectorsAndStocks } = OcrParser.parse(rawMarkdown);
    summary.date = date;

    // 3. 数据库原子事务操作 (使用 D1 Batch 确保清空和重新插入原子性)
    await this.executeDatabaseTransaction(date, summary, sectorsAndStocks);

    // 4. 图片归档到 R2 桶中
    if (this.r2Bucket) {
      await this.saveImageToR2(file, date, mimeType);
    }

    return {
      success: true,
      summary,
      sectorsCount: sectorsAndStocks.length,
      stocksCount: sectorsAndStocks.reduce((sum, s) => sum + s.stocks.length, 0),
      rawMarkdown
    };
  }
}
```

### 3.4 数据访问层设计 (Repositories)
Repositories 中只包含 SQL 执行。
* `StockRepository` 负责拼接复杂的 `HAVING SUM` 个股交集模糊查询、活跃板块统计算法，不处理 HTTP 上下文。
* D1 SQL 中的大写和缩进风格需遵循 D1 系统原先的整洁风格。

---

## 🎨 4. 前端 SPA 解耦方案 (Wrangler Assets)

优化前端 SPA，消除 1500 多行的单文件混沌，并实现模块化开发：

### 4.1 Wrangler 配置改造
修改 `wrangler.json` 替换原有 `fetch` 拦截 HTML 的静态响应，移交 CDN：
```json
"assets": {
  "directory": "./public"
}
```

### 4.2 前端 JavaScript 微模块化设计

1. **`public/js/api.js` (接口适配层)**：
   隔离具体的 `fetch` 通信。整个 SPA 的其他脚本不直接调用 `fetch`，一律使用 `api.*` 方法。
2. **`public/js/tabs/*.js` (视图控制器)**：
   每个 JS 文件代表一个 Tab 面板。例如 `tabs/upload.js` 只管拖拽区、日期解析和进度条，并在上传成功后触发 `tabs/review.js` 重新获取最新日期列表刷新下拉单。
3. **`public/js/app.js` (核心集成与深度链接)**：
   负责 Hono API 接口的全局错误兜底、Tab DOM 的激活控制。还负责多视图切换互交（例如在活跃板块中点击个股名字直接激活 `tabs/search.js` 面板自动查询该股历史）。

---

## 🛡️ 5. 错误处理与健壮性规范

1. **OCR 重试与优雅降级**：
   若 Gemini OCR 接口发生故障，前端显示明确的大模型调用超时，但确保不阻断 D1 数据库里历史记录的日常查询。
2. **R2 降级策略**：
   如果 R2 写入由于绑定、网络或容量原因失败，Worker 捕捉其异常并记录控制台日志，但必须正常向用户返回 D1 导入成功的结果（R2 图片不影响核心逻辑执行）。
3. **参数验证**：
   后端 Controller 严格核实 URL `date` 参数是否符合 `YYYY-MM-DD` 的日期规范，如果不符立即拦截并返回 `HTTP 400 Bad Request`，无需下探至数据库底层。
