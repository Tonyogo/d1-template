# A股涨停复盘看板 (A-Share Limit-Up Dashboard)

本自适应单页面应用（SPA）复盘看板，由原先的 Python (FastAPI + SQLite) 项目无缝迁移重构至 **Cloudflare Workers (TypeScript) + Cloudflare D1 (Serverless SQL 数据库) + Gemini 视觉大模型 / 混合式本地中转 OCR** 现代全栈架构。

它支持 A 股历史涨停盘面数据的多维度过滤检索、涨停长图的 **OCR 异步分步解析入库**、以及高性能的前后端彻底解耦全球 CDN 静态托管。

---

## 🌟 核心特性

- **前后端彻底解耦与极速静态托管 (Decoupled Frontend Assets)**：
  - 前端 SPA 完全移入 `./public/`，通过 **Wrangler Assets** 直接进行全球 CDN 边缘节点零延迟、零 CPU 消耗托管。
- **批量长图暂存与异步 OCR (2-Step Batch Upload)**：
  - 拖入多个复盘长图，支持多线程暂存（R2 `images/pending/`）和串行调用 Gemini OCR 结构化入库（解决 Worker 同步请求耗时熔断限制）。
- **人工复盘数据纠错大闭环 (R2 Backup & Revision Modal)**：
  - OCR 解析出库的同时在 R2 原地物理备份 Markdown 文本。
  - 支持在每日复盘页面点击 `🔧 修正数据` 一键拉取 R2 里的 Markdown，在线进行人工精修与级联入库，并自动异步重载刷新。
- **自适应移动端与 Micro-Card 卡片化视图**：
  - **移动端**：顶部导航自适应隐藏并激活带有毛玻璃背景的 `fixed bottom-0` Sticky 底部菜单栏。股票数据表完全切换为精美堆叠的个股卡片。
  - **桌面端**：保留极简的顶部 Tabs 和原生 Table 五列平铺面板，支持同屏最大信息吞吐展示。
- **安全与环境隔离**：
  - 支持飞书 callback 控制器（URL首次挑战与 verificationToken 生产强制强安全阻断防护）。

---

## 📂 项目结构

```text
├── README.md               # 项目说明文档
├── CLAUDE.md               # 重构后最新的三层架构（Controllers/Services/Repositories）红线开发指南
├── wrangler.json           # Cloudflare Worker 配置文件 (包含 D1、R2 绑定和全局 vars)
├── package.json            # 依赖与符合环境兼容的开发构建脚本配置
├── .dev.vars.example       # 本地开发密钥配置模板
├── migrations/             # D1 数据库 SQL 迁移文件
│   └── 0002_migrate_legacy_market_data.sql  # 核心：2.4w+ 条 A 股历史复盘数据
├── scripts/                # 辅助开发脚本目录
│   └── dump_sqlite_to_d1.py                 # SQLite 历史数据转 D1 SQL 脚本
├── src/                    # === 1. 后端 Worker 源代码 ===
│   ├── index.ts            # Hono 路由与中间件总入口
│   ├── types.ts            # 全局领域层强类型约束管理定义
│   ├── controllers/        # A. 控制器层 (Hono 控制器，仅做参数处理与服务注入)
│   ├── services/           # B. 业务服务层 (纯业务过程控制，协调大模型和存储)
│   ├── repositories/       # C. 数据持久层 (纯 D1 SQL 的 Repository 执行逻辑)
│   └── utils/              # D. 基础设施与客户端工具 (Gemini、OcrParser 提取引擎)
│
├── public/                 # === 2. 前端 SPA 静态资产目录 (Wrangler Assets) ===
│   ├── index.html          # SPA 主页面结构
│   ├── css/
│   │   └── app.css         # 自定义全局样式
│   └── js/
│       ├── api.js          # API 网络 fetch 统一抽象层
│       ├── app.js          # 导航、Tab 状态、个股/日期深度联动
│       └── tabs/           # 各个面板专职微视图渲染组件
└── legacy/                 # [只读] 历史遗留 Python 项目代码 (仅作参考)
```

---

## 🛠 快速开始

### 1. 安装项目依赖
```bash
npm install
```

### 2. 配置本地密钥 `.dev.vars`
在本地调试 Gemini OCR 解析功能前，需配置 `GEMINI_API_KEY`：
- 将项目根目录下的 `.dev.vars.example` 复制一份并重命名为 `.dev.vars`。
- 打开 `.dev.vars`，将 `GEMINI_API_KEY` 替换为您真实的 Gemini API 密钥：
```ini
GEMINI_API_KEY="AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3. 应用本地迁移并启动开发服务器
运行以下命令，会自动在本地应用 SQL 迁移并自动导入 24,910 条 A 股历史复盘数据，随后启动 Wrangler 本地调试代理：
```bash
npm run dev
```
启动成功后，在浏览器访问控制台输出的地址（通常是 `http://localhost:8787`）即可。
