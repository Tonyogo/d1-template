# CLAUDE.md Controller Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新项目根目录下的 `CLAUDE.md` 开发守则文档，新增 Controller 层的核心红线定义（Red-Lines）和反模式示例（Anti-Patterns），以增强三层架构的硬性边界和对后续 AI/人工开发的指导力。

**Architecture:** 文档升级规范。不包含逻辑代码修改。

**Tech Stack:** Markdown.

---

### Task 1: 升级 CLAUDE.md 规范

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 升级 A. 控制器层 规范块**

在 `CLAUDE.md` 的 `#### A. 控制器层 (Controllers - src/controllers/)` （约第 51 行）后，追加具体的反模式规范和 Do's & Don'ts 对比代码块。

将原：
```markdown
#### A. 控制器层 (Controllers - `src/controllers/`)
* **职责**：仅负责捕获 Hono 接口 HTTP 请求（解析 Query、参数、FormData），校验基础参数，并实例化并调用 `Service` 层接口，最后返回标准的 JSON 格式响应。
* **限制**：**不允许直接进行 D1 数据库 SQL 读写或直接访问复杂业务流程**。
* **DI 注入**：无状态类。在运行时利用 `c.env` 手动构造其依赖的服务层实例，便于单元测试 mock 注入。
```

修改为：
```markdown
#### A. 控制器层 (Controllers - `src/controllers/`)
* **职责**：仅负责捕获 Hono 接口 HTTP 请求（解析 Query、参数、FormData），校验基础参数，并实例化并调用 `Service` 层接口，最后返回标准的 JSON 格式响应。
* **限制**：**不允许直接进行 D1 数据库 SQL 读写或直接访问复杂业务流程**。
* **DI 注入**：无状态类。在运行时利用 `c.env` 手动构造其依赖的服务层实例，便于单元测试 mock 注入。

##### 🚨 Controller 核心红线与反模式 (Anti-Patterns)
为防止层级架构腐化，控制器中**绝对严禁**以下行为：
* ❌ **严禁直接数据库交互**：控制器中不得出现 `c.env.DB.prepare`、`.all()`、`.run()`、`.batch()` 等任何 SQL 语句编写或 D1 调用（必须下移到 Repository 层）。
* ❌ **严禁直接访问 R2 存储**：控制器中不得出现 `c.env.BUCKET.get()`、`.put()` 等任何与 R2 交互、文件轮询、后缀探测等文件业务逻辑（必须下移到 Service/Repository 层）。
* ❌ **严禁糅合多表逻辑**：复杂的级联写入、跨桶交互必须下沉至 `Service` 层的事务方法中，控制器一律只做“单点入口”调用。

##### 💡 经典合规 Controller 模式示例
```typescript
// 正确 (Do): 控制器只解析入参，调用服务拉取数据并流式响应
export async function getImage(c: Context) {
	const date = c.req.query('date');
	if (!date) return c.json({ error: "Missing parameter" }, 400);
	if (!c.env.BUCKET) return c.json({ error: "R2 binding missing" }, 500);

	const imageService = new ImageService(c.env.BUCKET);
	const object = await imageService.getImageByDate(date);
	if (!object) return c.json({ error: "Not found" }, 404);

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	return new Response(object.body, { headers });
}
```
```

- [ ] **Step 2: 确认文档格式与 Git 提交通行**

1. 确认 `CLAUDE.md` 在 Markdown 下高亮和换行正常。
2. Git 提交代码：
```bash
git add CLAUDE.md
git commit -m "docs: upgrade CLAUDE.md with controller red-line rules and best practices"
```
