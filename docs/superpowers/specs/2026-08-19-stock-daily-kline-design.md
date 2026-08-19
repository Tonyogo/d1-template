# 股票日K线行情数据与图表展示设计文档 (Stock Daily K-Line Chart Design)

## 1. 概述 (Overview)

本设计旨在为 A股涨停复盘看板 添加股票日 K 线行情查看功能。前端直接拉取免费公开的腾讯财经 API 数据，在前端通过 ECharts 动态渲染出包含 K 线图、MA 均线（5/10/20日）和成交量副图的交互式 Modal 弹窗。

该功能完全由前端驱动，零后端依赖，不增加 Cloudflare Workers 或 D1 数据库的存储与流量开销。

---

## 2. 系统架构 (Architecture & Data Flow)

```
┌────────────────────────────────────────────────────────────────────────┐
│                              前端 SPA                                   │
│                                                                        │
│  [个股查询 Tab / 每日复盘 Tab / 活跃板块 Tab] (点击股票卡片/代码/名称)     │
│                            │                                           │
│                            ▼                                           │
│              app.openKlineModal(code, name)                            │
│                            │                                           │
│                            ▼                                           │
│                 KlineModal (JS 弹窗组件)                                │
│                            │                                           │
│              ┌─────────────┴─────────────┐                             │
│              ▼                           ▼                             │
│     StockDataService               ECharts Canvas                      │
│ (请求腾讯财经 API 并解析)           (渲染 K线/均线/成交量)                │
└──────────────│───────────────────────────▲─────────────────────────────┘
               │                           │
               ▼                           │
    https://web.ifzq.gtimg.cn/... (跨域请求日K线前复权数据)
```

1. **调用流**：用户在系统任意页面/Tab 中点击股票代码或名称，调用全局 `app.openKlineModal(code, name)`。
2. **数据流**：`KlineModal` 调用 `StockDataService.fetchKlineData(code)`。
3. **解析流**：`StockDataService` 根据 6 位股票代码自动推断市场前缀（`sh`/`sz`/`bj`），发起 `fetch` 请求并解析返回的 JSON，计算 MA5、MA10、MA20 移动平均线。
4. **渲染流**：将标准化好的 OHLCV (Open, High, Low, Close, Volume) 数据交由 `ECharts` 渲染至 Modal 中的 Canvas 容器。

---

## 3. 股票 API 与数据转换规范 (API & Data Specification)

### 3.1 免费 API 接口
* **Endpoint**: `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,{count},qfq`
* **参数说明**:
  * `symbol`: 包含前缀的股票代码，如 `sh600519`
  * `count`: 拉取 K 线天数，默认 `60`（可选 `30`, `60`, `120`）
  * `qfq`: 前复权（Forward Adjusted）

### 3.2 市场前缀推导规则 (Market Code Mapping)
* **上海 (SH)**：代码以 `60` 或 `688` 开头 -> 前缀 `sh` (如 `sh600519`, `sh688001`)
* **深圳 (SZ)**：代码以 `00` 或 `300` 开头 -> 前缀 `sz` (如 `sz000001`, `sz300750`)
* **北京 (BJ)**：代码以 `8`, `4` 或 `920` 开头 -> 前缀 `bj` (如 `bj830000`)
* **兜底规则**：不匹配以上前缀时，默认使用 `sh`

### 3.3 数据结构与均线计算
从 API 响应中提取 `data[symbol].day` 或 `data[symbol].qfqday` 数组：
* 元素格式：`[date, open, close, high, low, volume]`
* **MA 计算公式**：
  * `MA N` 均线在第 $i$ 天的值为从第 $i-N+1$ 天至第 $i$ 天收盘价的算术平均值（当历史天数小于 $N$ 时填 `null`）。

---

## 4. UI 界面与交互规范 (UI & Modal Component)

### 4.1 DOM 结构与 Modal 骨架 (`public/index.html`)
* 在 `<body>` 底部增加 `#kline-modal` 结构：
  * **Backdrop**: 带有 `backdrop-blur-sm bg-slate-900/40` 的全屏遮罩。
  * **Modal Card**: 居中响应式卡片 (最大宽度 `max-w-4xl`)，包含：
    * **Header**: 股票名称、代码、最新价格行情指标标签、时间范围选择器 (`30日` | `60日` | `120日`)、关闭按钮。
    * **Chart Container**: `#kline-chart-container`（高度 `450px`）。
    * **Status Overlay**: Loader 加载指示器 / Error 错误提示遮罩。

### 4.2 ECharts 样式与配置规范
* **主题调色板**：符合中国 A 股交易习惯
  * **阳线 (上涨/收平)**：红色 `#ef4444` (Rose-500)
  * **阴线 (下跌)**：绿色 `#10b981` (Emerald-500)
  * **均线**：MA5 (`#f59e0b` 琥珀黄), MA10 (`#3b82f6` 蔚蓝), MA20 (`#a855f7` 紫)
* **双 Grid 布局**：
  * Top Grid (80% 高度): K线图 (Candlestick) + 均线 (Line)
  * Bottom Grid (20% 高度): 成交量 (Bar)
* **交互性**：
  * 支持 Crosshair 悬浮准星与详尽 Tooltip
  * 支持鼠标滚轮/手势平移与缩放 (DataZoom)

---

## 5. 文件变动清单 (Files to Create & Modify)

### 新建文件
1. **`docs/superpowers/specs/2026-08-19-stock-daily-kline-design.md`**：本设计文档。
2. **`public/js/services/stock-data.js`**：股票行情 API 数据获取与计算 Service。
3. **`public/js/components/kline-modal.js`**：K 线 Modal 组件（负责 ECharts 渲染与事件调度）。

### 修改文件
1. **`public/index.html`**：
   * 引入 ECharts CDN (`https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js`)。
   * 添加 K线 Modal 遮罩与 DOM 容器。
2. **`public/js/app.js`**：
   * 实例化 `KlineModalComponent` 并对外暴露 `openKlineModal(code, name)` 方法。
3. **`public/js/tabs/search.js`**：
   * 结果表格中的股票代码/名称节点添加点击事件，触发 `openKlineModal`。
4. **`public/js/tabs/review.js`**：
   * 涨停板块折叠菜单中每只股票节点添加点击事件，触发 `openKlineModal`。
5. **`public/js/tabs/active.js`**：
   * 龙头股票与活跃股票卡片节点添加点击事件，触发 `openKlineModal`。

---

## 6. 异常处理与边界情况 (Edge Cases & Resilience)

1. **停牌/无行情数据股票**：API 返回空数据或 HTTP 异常时，Modal 中优雅显示“暂无当前股票行情数据”，并提供重试按钮。
2. **内存泄漏与 Window Resize**：Modal 关闭时停用 ECharts 实例；窗口大小变动时触发 `chart.resize()`。
3. **重复快速点击**：数据加载期间禁用多次请求，并使用 Loader 动画。
