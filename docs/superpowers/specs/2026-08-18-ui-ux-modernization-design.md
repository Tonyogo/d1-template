# A股涨停复盘看板 UI/UX 现代金融 SaaS 视觉与交互重构设计规范

## 1. 概述与重构目标 (Executive Summary & Goals)

### 1.1 背景与定位
当前「A股涨停复盘看板」功能完善，包含个股历史涨停查询、每日复盘与指标统计、活跃板块热度追踪、长图极速云暂存与智能 OCR 入库。
本规范旨在将系统的 UI/UX 进行全面重构，升级为具有 **现代高级金融 SaaS 风格（参考 Linear / Stripe Radar / 富途牛牛桌面浅色版）** 的高品质产品。

### 1.2 核心目标与红线
1. **视觉质感升维**：打造专业、克制、现代且富有科技质感的金融界面，采用精密设计令牌（Design Tokens）、微边框（Subtle borders）、高阶阴影与等宽数字对齐。
2. **移动端与宽屏完美适配**：针对桌面宽屏（`max-w-6xl`）和移动端（`<768px`）进行自适应布局重塑，优化触控热区与底部安全区（`env(safe-area-inset-bottom)`）。
3. **零破坏性重构（Non-Regression）**：
   - 严禁修改后端 API 接口、数据结构及路由；
   - 严格保留前端所有 DOM 元素的 `id`、`data-tab`、`toggle-stock-code`、`stock-leader-link`、`sector-link`、`date-link` 等核心选择器与事件监听绑定；
   - 保持所有 JavaScript 业务逻辑和控制器类（`SearchTab`, `ReviewTab`, `ActiveTab`, `UploadTab`, `App`）功能完整。

---

## 2. 设计令牌体系 (Design Tokens & Visual Hierarchy)

### 2.1 色彩系统 (Color Palette)
* **画布与容器背景 (Surfaces)**:
  * 主页面底色 (Canvas): `#F8FAFC` (`slate-50`)
  * 卡片背景 (Card Surface): `#FFFFFF`
  * 次级/输入背景 (Subtle Surface): `#F1F5F9` (`slate-100/70`)
  * 浮层/模态背景 (Overlay): `rgba(15, 23, 42, 0.65)` 搭配 `backdrop-blur-md`
* **金融语义色 (A-Share Financial Semantics)**:
  * 涨停红基调: `#E11D48` (`rose-600`) / `#DC2626` (`red-600`)
  * 连板热度阶梯:
    * 首板: `#3B82F6` (`blue-500`)，带浅蓝微光底色 `rgba(59, 130, 246, 0.08)`
    * 二板: `#F43F5E` (`rose-500`)，带浅玫微光底色 `rgba(244, 63, 94, 0.08)`
    * 三板/四板: `#DC2626` (`red-600`)，烈焰红微光
    * 五板及以上 / 高度板: 金尊烈焰徽章（渐变 `linear-gradient(135deg, #E11D48, #F59E0B)` 搭配金光微边框）
    * 一字板 / T字板: `#F59E0B` (`amber-500`) 琥珀金
* **指标辅助色**:
  * 晋级率 (Upgrade): `#10B981` (`emerald-500`)
  * 炸板率 (Broken): `#F43F5E` (`rose-500`)
  * 竞价涨幅 (Bidding): `#8B5CF6` (`purple-500`)
  * 板块/动因标签 (Tags): `#6366F1` (`indigo-500`) 胶囊 Pill

### 2.2 排版与数字规范 (Typography & Numerics)
* **UI 字体栈**:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
* **数字/代码/日期等宽规范 (Tabular Numerics)**:
  `font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;`
  `font-variant-numeric: tabular-nums;`
  所有股票代码、涨跌百分比、连板次数、日期均应用该样式，确保纵向精密对齐。

### 2.3 边框、阴影与圆角 (Borders, Shadows & Radius)
* **边框 (Subtle Borders)**:
  统一采用 1px 高精度微边框：`border: 1px solid rgba(226, 232, 240, 0.8)`，在卡片 Hover 时过渡为 `rgba(203, 213, 225, 0.9)`。
* **阴影体系 (Layered Elevations)**:
  * `shadow-card`: `0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)`
  * `shadow-card-hover`: `0 8px 20px -4px rgba(0, 0, 0, 0.06), 0 4px 6px -2px rgba(0, 0, 0, 0.03)`
  * `shadow-dropdown`: `0 12px 28px -4px rgba(0, 0, 0, 0.1), 0 4px 8px -2px rgba(0, 0, 0, 0.04)`
* **圆角**:
  * 外层大卡片: `rounded-2xl` (`16px`)
  * 内部控件、按钮与小卡片: `rounded-xl` (`12px`) / `rounded-lg` (`8px`)
  * 标签与状态徽章: `rounded-full`

---

## 3. 全局布局与导航系统设计 (Global Shell & Navigation)

### 3.1 顶部 Header
* **结构**:
  * 吸顶毛玻璃效果：`sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200/80`
  * 最大宽度升级为 `max-w-6xl`。
  * 左侧 Logo: 红色渐变圆角图标容器，搭配多层微光立体阴影；右侧带有绿色“系统就绪/已同步”呼吸微脉冲指示点。
  * 右侧桌面 Tab 栏: 类似 Apple / Linear 的 Segmented Switcher，带浅灰胶囊底衬（`bg-slate-100/80`），激活项为白底微投影药丸。

### 3.2 移动端底部导航栏 (Bottom Bar)
* 适配 iOS 安全区：`padding-bottom: max(0.5rem, env(safe-area-inset-bottom))`
* 激活 Tab 带有微型红色指示点与图标高亮，48px 触控热区保证拇指操作无误触。

---

## 4. 四大核心模块重构细则 (Component Redesign Specifications)

### 4.1 Tab 1: 个股历史涨停查询 (Stock Search)
* **金融命令控制台 (Search Console)**:
  * 搜索框升级为带快捷键提示（`Enter ↵`）的现代 Command Bar 风格，深邃焦点光圈（Focus Ring）。
  * 板块与动因过滤：双列面板设计，支持 Tag 胶囊 Pill 快速删除，精确/模糊匹配升级为精致微型开关。
* **搜索结果展示 (Result Cards)**:
  * 股票结果卡片：头部显示股票名称、等宽 Mono 股票代码、最新涨停日期徽章、折叠指示箭头。
  * 历史明细表：PC 端表格行斑马微纹，移动端无缝转为卡片流；日期、板块均支持一键深度跳转。

### 4.2 Tab 2: 每日复盘看板 (Daily Review)
* **日期选择与修正按钮**:
  * 日期下拉框转为带日历图标的金融控件，右侧「修正数据」按钮转为微边框次级操作按钮。
* **4 大 KPI 仪表盘**:
  * 涨停家数、晋级率、炸板率、竞价涨幅 4 张指标卡采用双层设计：左侧为半透明柔和微色块图标，右侧为大号 Tabular 等宽数字排版，带有卡片内光晕。
* **复盘长图折叠卡片**:
  * 沉浸式收纳栏，展开时长图居中展示，配备微阴影外框。
* **板块手风琴 (Sectors Accordion)**:
  * 标题栏展示：板块名、涨停家数 Pill、领涨龙头股 Chips；
  * 表格内容：采用高清晰度金融盯盘表格排版。

### 4.3 Tab 3: 活跃板块与热度 (Active Sectors)
* **控制工具栏**:
  * 时间跨度选择（7天/30天/全历史）与板块搜索输入框整合为统一的流式工具条。
* **活跃板块网格卡片**:
  * 卡片头部增加热度进度条（Heat Percentage Meter）；
  * 领涨龙头股转化为高交互性的“股票筹码 Chip”（包含股票名、代码与上榜次数），带 Hover 缩放微动效。

### 4.4 Tab 4: 上传与暂存队列 (Upload & Stash Console)
* **拖拽上传区**:
  * 虚线边框带有 Hover 扩散光晕与微动效，提示文字更清晰。
* **待处理暂存队列 (Data Table)**:
  * 批量并发线程选择器与操作按钮整合为专业控制台 Header；
  * 列表项支持缩略图预览、目标日期智能识别提示、单项解析/删除按钮微动效与加载状态。
* **本地中转设置面板**:
  * 优雅的折叠抽屉卡片，输入框与协议选择具有统一的金融 Focus 态。

### 4.5 全局模态框 (Modals)
* **图片预览 Modal**: 采用居中弹出 / 移动端 Bottom Sheet，支持多级平滑缩放与重置。
* **Markdown 编辑 Modal**: 采用专业 Code-Editor 风格，等宽字体高亮排版与快捷保存。

---

## 5. 样式与工程文件映射 (File Structure & Changes)

* **`public/css/app.css`**: 全面重构，注入 Design Tokens、全局微滚动条、金融连板 Badge 样式、动画关键帧、毛玻璃辅助类。
* **`public/index.html`**: 骨架与结构精细化，升级布局类名与语义化标签，严格保持所有现有元素 ID 与事件接口。
* **`public/js/tabs/review.js`**: 优化板块手风琴、表格与 KPI 卡片的渲染模板 HTML。
* **`public/js/tabs/search.js`**: 优化搜索结果卡片、Tag 胶囊与历史明细表的渲染模板 HTML。
* **`public/js/tabs/active.js`**: 优化活跃板块卡片与龙头股 Chip 渲染模板 HTML。
* **`public/js/tabs/upload.js`**: 优化待处理队列表格行与操作态的渲染模板 HTML。
* **`public/js/app.js`**: 升级 Tab 切换高亮与徽章色彩工具函数（`getStatusBadgeStyle`）。

---

## 6. 验证与回归防护 (Verification & Non-Regression)
1. 语法与类型校验：执行 `npm run check` 确保无构建错误；
2. 元素 ID 完整性测试：核对 `index.html` 与 JS Tab 文件中的所有 `getElementById`，确保 100% 对应；
3. 响应式与跨端测试：在桌面宽屏、平板（md）与移动端（`<768px`）无横向溢出与挤压换行。
