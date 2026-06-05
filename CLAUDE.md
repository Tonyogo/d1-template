# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and developers when working with code in this repository.

## Important Rules
- `./legacy/` contains the legacy project code. It is **read-only reference** – do NOT modify any files inside it.
- When migrating, read the logic from `./legacy/` and write the migrated code into `./src/`.
- All code modifications MUST strictly adhere to the **3-Tier Backend Architecture** and the **Decoupled Frontend Assets** pattern specified below.

## Commands

### Development and Build
- Run local development server (with auto-seeding): `npm run dev` (uses `pnpm seedLocalD1` internally, so ensure `pnpm` is installed globally or adjust as needed)
- Typecheck and dry-run deploy: `npm run check`
- Generate Environment Types (Wrangler Typegen): `npm run cf-typegen`

### Database & Migrations (Cloudflare D1)
- Apply migrations locally: `npm run seedLocalD1` (translates to `wrangler d1 migrations apply DB --local`)
- Apply migrations to remote production DB: `npm run predeploy` (translates to `wrangler d1 migrations apply DB --remote`)
- Create a new migration file: `npx wrangler d1 migrations create d1-db <migration_name>`

### Deployment
- Deploy to Cloudflare Workers and Assets: `npm run deploy` (automatically runs `predeploy` to apply remote migrations first)

*Note: No dedicated linting or testing frameworks (such as Jest or Vitest) are configured in this codebase.*

---

## 🏛️ High-Level Architecture (重构后新版规范)

本项目是一个前后端彻底分离的 Cloudflare Workers 应用程序，集成了 Cloudflare D1 Serverless SQL 数据库和 Cloudflare R2 对象存储。

### 1. 前端静态资产层 (Decoupled Frontend SPA)
前端代码完全剥离至 `./public/` 目录下，部署时通过 **Cloudflare Wrangler Assets** 静态托管（不消耗 Worker 运行时 CPU，冷启动零延迟）。
* **`public/index.html`**：纯静态 SPA HTML，作为单页应用的入口骨架。
* **`public/css/app.css`**：全局和自定义样式定义。
* **`public/js/api.js`**：对后端 `/api/*` 接口网络 fetch 请求的统一纯净抽象封装。
* **`public/js/tabs/`**：按功能选项卡划分的**微控制组件**（如 `search.js`、`review.js`、`active.js`、`upload.js`），负责维护各自面板的 DOM、事件流与业务渲染。
* **`public/js/app.js`**：前端总入口。掌管全局 Tab 切换、样式调配以及跨 Tab 跳转深度路由（如深色高亮跳转及个股深度链接检索）。

### 2. 后端 RESTful API 路由层 (Hono Router)
后端运行在 Cloudflare Workers 上，使用 **Hono 框架** 作为极简、极速的 API 调度器，消灭手写路径匹配。
* **Hono Entrypoint (`src/index.ts`)**：初始化 Hono 实例，配置中间件，并引入并注册业务接口路由。
* **Hono 路由注册器 (`src/controllers/index.ts`)**：统一注册 `/api/*` 前缀下的所有子控制器路由。
* **环境上下文类型定义 (`src/types.ts`)**：全项目的数据物理模型、DTO 以及环境变量强类型（TS 5.9.3）安全管理核心。

### 3. 后端服务三层解耦规范 (3-Tier Architecture)

任何新的 API 接口或功能模块开发，都必须严格执行并拆分为以下三层结构：

#### A. 控制器层 (Controllers - `src/controllers/`)
* **职责**：仅负责捕获 Hono 接口 HTTP 请求（解析 Query、参数、FormData），校验基础参数，并实例化并调用 `Service` 层接口，最后返回标准的 JSON 格式响应。
* **限制**：**不允许直接进行 D1 数据库 SQL 读写或直接访问复杂业务流程**。
* **DI 注入**：无状态类。在运行时利用 `c.env` 手动构造其依赖的服务层实例，便于单元测试 mock 注入。

#### B. 业务服务层 (Services - `src/services/`)
* **职责**：协调并封装业务核心逻辑，控制多表级联及跨平台调用（如大模型 OCR 调度、R2 读写、D1 batch 批处理事务、统计算法等）。
* **限制**：**不包含任何 HTTP 原生处理（如 Request/Response 响应）**，保证可在非 Worker 环境或测试环境中独立运行。

#### C. 数据访问层 (Repositories - `src/repositories/`)
* **职责**：直接与 D1 数据库交互的底层持久层。封装纯粹的 SQL 准备、批量处理、关联更新、CTE (Common Table Expressions) 及复杂 HAVING 数据过滤。
* **限制**：**只做 SQL 增删改查，不掺杂任何接口、服务或 OCR 等业务逻辑**。

#### D. 外部基础设施与工具类 (Utilities - `src/utils/`)
* 封装无状态的纯函数工具（如正则表达式 Markdown 析出解析引擎 `OcrParser`）或外部 SDK / 大模型网络交互（如 `GeminiClient`），不直接依赖 D1，作为纯净的服务层外部依赖。
