# 股票名称多余空格清洗实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在大模型 OCR 数据提取源头清洗股票名称字段，剔除其含有的所有多余空白字符（含中文、英文及符号之间的间隔）。

**Architecture:** 
- **Parser Modification**: 在无状态解析引擎 `src/utils/ocr-parser.ts` 中，提取个股行表格各字段时，将 `name` 字段使用 `replace(/\s+/g, '')` 执行全空白字符清洗。

**Tech Stack:** TypeScript.

## Global Constraints
- 禁止修改 `./legacy/` 目录中任何文件。
- 绝不引入未使用死代码或 TBD 占位符。
- 保证类型推导、全编译零 Error。

---

## Task 1: 升级 OcrParser 实现个股名字全空格清洗

**Files:**
- Modify: `src/utils/ocr-parser.ts`

**Interfaces:**
- `OcrParser.parseOcrMarkdown(markdown: string)` -> 返回的 `sectorsAndStocks` 列表中个股 `StockParsed.name` 必须是不含任何空格的干净字符串。

### 详细步骤:

- [ ] **Step 1.1: 升级 OcrParser 的字段读取清洗**
  打开 `src/utils/ocr-parser.ts`，找到解析 Markdown 行数据并将其分裂为 parts 的区块：
  ```typescript
  // src/utils/ocr-parser.ts (大约在 60-84 行)
  ```
  修改 `name` 属性的获取方式，在其后追加 `.replace(/\s+/g, '')` 方法：
  ```typescript
  // 改造前：
  const stockRow: StockParsed = {
      status: parts[0] || null,
      code,
      name: parts[2],
      time: parts[3] || null,
      concept_reason: parts[4] || null
  };

  // 改造后：
  const stockRow: StockParsed = {
      status: parts[0] || null,
      code,
      name: parts[2] ? parts[2].replace(/\s+/g, '') : '',
      time: parts[3] || null,
      concept_reason: parts[4] || null
  };
  ```

- [ ] **Step 1.2: 运行编译干跑检查**
  Run: `npm run check`
  Expected: PASS

- [ ] **Step 1.3: 提交股票名字空格清洗逻辑变更**
  ```bash
  git add src/utils/ocr-parser.ts
  git commit -m "fix: sanitize stock names by removing all internal spaces during ocr parsing"
  ```
