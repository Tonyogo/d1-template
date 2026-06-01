# A股涨停复盘看板 (A-Share Limit-Up Dashboard)

本自适应单页面应用（SPA）复盘看板，由原先的 Python (FastAPI + SQLite) 项目无缝迁移重构至 **Cloudflare Workers (TypeScript) + Cloudflare D1 (Serverless SQL 数据库) + Gemini 视觉大模型** 现代全栈架构。

它支持 A 股历史涨停盘面数据的多维度过滤检索、涨停截图的 **OCR 自动化解析入库**、以及高性能的边缘渲染与展示。

---

## 🌟 核心特性

- **极致边缘渲染**：基于 Cloudflare Workers 毫秒级冷启动，极致压缩网络开销。
- **现代化拖拽上传与智能识别**：
  - 新增“上传数据”模块，支持拖拽或选择复盘截图（`.png`, `.jpg`, `.jpeg`, `.webp`）。
  - **文件名智能提取日期**：上传时自动正则解析图片文件名（如 `2026-05-27.jpg`）并智能填充日期输入框。
  - **分步骤进度日志**：前台实时反馈文件读取、Gemini 识别（耗时 3~6 秒）、Markdown 指标解析、D1 云端入库等全链路状态。
  - **双向入库校验**：处理完成后，实时在前端预览解析生成的统计盘面并提供一键折叠查看 Gemini 的 Markdown 原始输出。
- **Gemini 智能 OCR 识别引擎**：
  - 使用 Deno 反向代理或原生接口安全对接 Gemini Vision 视觉大模型。
  - 通过精心设计的 OCR System Prompt 重构 Markdown 表格与核心数值。
- **高性能数据解析与持久化**：
  - TypeScript 重新实现 Python 版正则解析与列式数据过滤器。
  - **自增外键级联写入**：采用 D1 批处理（Batch）两阶段操作，优雅解决 D1 无状态事务下子表获取自增 sector 外键 ID 的难题，实现单次网络往返下的事务级强一致覆盖写入。
- **卓越的前端复盘看板**：
  - 完美契合移动端/桌面端的自适应宽窄屏布局，具有流畅的骨架屏、动态模糊、卡片气泡和分类筛选。
  - 集成**热点概念聚类**、**高度过滤模糊检索**和一键隐藏杂乱板块逻辑。

---

## 📂 项目结构

```text
├── README.md               # 项目说明文档
├── CLAUDE.md               # AI 助手操作及规范指南
├── wrangler.json           # Cloudflare Worker 配置文件 (包含 D1 绑定和全局 vars)
├── package.json            # 依赖与开发脚本配置
├── .dev.vars.example       # 本地开发密钥配置模板
├── migrations/             # D1 数据库 SQL 迁移文件
│   ├── 0001_create_comments_table.sql
│   └── 0002_migrate_legacy_market_data.sql  # 包含 2.4w+ 条 A 股历史复盘数据
├── scripts/                # 辅助开发脚本目录
│   └── dump_sqlite_to_d1.py                 # SQLite 历史数据转 D1 SQL 脚本
├── src/                    # 核心源代码目录
│   ├── index.ts            # Workers 后端入口 (路由/Gemini OCR/TS Parser/D1 事务)
│   └── indexHtml.ts        # 前端 SPA 渲染组件 (HTML + CSS + TailwindCSS + JS 交互)
└── legacy/                 # [只读] 历史遗留 Python 项目代码 (仅作参考)
```

---

## 🛠 快速开始

### 1. 安装项目依赖
推荐使用 `pnpm` 或是 `npm` 安装依赖：
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
*(注意：`.dev.vars` 已被加入 `.gitignore` 保护，无需担心密钥泄露到 Git)*

### 3. 应用本地迁移并启动开发服务器
运行以下命令，会自动在本地应用 SQL 迁移（创建表结构并自动导入 24,910 条 A 股历史复盘数据），随后启动 Wrangler 本地调试代理：
```bash
npm run dev
```
启动成功后，在浏览器访问控制台输出的地址（通常是 `http://localhost:8787`）即可。

---

## 🗄 数据库设计

D1 数据库中建立了以下相互关联的表：

1. **`daily_summary` (盘面每日总览)**
   - `date` (TEXT, 主键): 日期
   - `stock_count` (INTEGER): 涨停总只数
   - `upgrade_rate` (REAL): 连板晋级率
   - `limit_broken_rate` (REAL): 炸板率
   - `bidding_increase_rate` (REAL): 竞价涨幅

2. **`sectors` (板块概念)**
   - `id` (INTEGER, 自增主键)
   - `date` (TEXT, 关联日期)
   - `name` (TEXT, 概念/板块名称)
   - `description` (TEXT, 涨停热点逻辑简析)
   - *唯一约束*：`UNIQUE(date, name)`

3. **`limit_up_stocks` (涨停个股明细)**
   - `id` (INTEGER, 自增主键)
   - `date` (TEXT, 关联日期)
   - `status` (TEXT, 连板状态：首板 / 2连板 / 3天2板等)
   - `code` (TEXT, 6位股票代码)
   - `name` (TEXT, 股票简称)
   - `time` (TEXT, 涨停时间)
   - `concept_reason` (TEXT, 涨停概念及炒作原因)
   - `sector_id` (INTEGER, 关联 sectors.id)
   - *唯一约束*：`UNIQUE(date, code)`

### D1 数据操作命令

- **应用迁移至本地**: `npm run seedLocalD1`
- **应用迁移至线上数据库**: `npm run predeploy`
- **新建一个 D1 迁移文件**:
  ```bash
  npx wrangler d1 migrations create d1-db <migration_name>
  ```

---

## 🚀 线上部署

当本地调试满意后，可以轻松将该应用托管至 Cloudflare 遍布全球的边缘节点中。

### 1. 绑定并上传线上密钥 (API KEY)
向 Cloudflare 线上 Worker 安全地注入您的 `GEMINI_API_KEY`：
```bash
npx wrangler secret put GEMINI_API_KEY
```
根据提示粘贴您的密钥并回车即可。

### 2. 一键发布部署
运行发布脚本，其会自动应用云端 D1 数据库迁移，并完成代码的类型检查与边缘分发打包：
```bash
npm run deploy
```

---

## 📝 研发及设计规范

- 本项目的核心规约详见 `CLAUDE.md`。
- **特别注意**：`./legacy/` 目录下存放着原始 Python (FastAPI + SQLite) 代码。在做技术迁移、接口比对或逻辑查阅时可作为参考，**绝对不要对其进行任何写操作和修改**。