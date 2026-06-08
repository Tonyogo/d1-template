---
name: claudemd-anti-patterns-spec
description: Establish rigid anti-pattern and red-line rules inside CLAUDE.md to hardcode boundary rules preventing database/R2 leakage into controller layers.
metadata:
  type: project
---

# 🚀 CLAUDE.md 规范约束升级设计规格书 (CLAUDE.md Guardrails Spec)

本文档规范了项目中 `CLAUDE.md` 项目架构守则的升级设计。本次优化的核心目的是在控制层中制定红线守则和反模式示例，阻止任何 D1 数据库操作或 R2 对象存储操作直接入侵控制层目录。

---

## 🏛️ 1. 升级原因与目的

在经历了图片获取 API 的下沉重构后，我们发现：
* 缺乏明确的书面红线（Red Lines），AI 或开发者极易图省事在 Controller 中直接写 D1 SQL 拼装或 R2 Bucket 文件操作。
* 明确的 Do's and Don'ts 对比可以充当极其强大的“编译/审查前置防呆墙”。

---

## 📂 2. 规范细化设计

### 2.1 新增 Controller 核心红线 (Red-Line Rules)
任何在 `src/controllers/` 下的文件必须受到严格的安全过滤，禁止包含：
* `c.env.DB` 上的各类数据库实体调用
* `c.env.BUCKET` 上的各类云存储实体调用

### 2.2 提供坏味道对比 (Anti-Pattern vs Best-Practice)
在 `CLAUDE.md` 内提供明确的 Markdown 代码高亮片段，分别标出 `❌ (Don't)` 越界写法与 `💡 (Do)` 经典合规写法的对照。

---

## 🛡️ 3. 部署与合并

本升级完全为文档类改造，无需更新任何 TypeScript/CSS/HTML 逻辑代码，确保合并后项目在不更改业务的前提下拥有更强的防御性特征。
