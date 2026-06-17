---
name: mobile-adaptation-spec
description: Spec for adapting A-Share limit-up dashboard to mobile screen layouts using sticky bottom navigation, card-based stock lists, responsive images, and touch targets.
metadata:
  type: project
---

# 🚀 移动端响应式与卡片化重构设计规格书 (Mobile Adaptation Spec)

本文档规范了 A股涨停复盘数据看板项目的移动端响应式重构。此次适配完全基于 Tailwind CSS 的 Media Queries 体系，实现“双端自适应导航切换”和“个股列表卡片化”。

---

## 🏛️ 1. 双端响应式导航规范 (Responsive Navigation)

由于屏幕空间的限制，顶部 Tab 栏在小屏下会被隐藏，并联动到底部的悬浮 Tab 栏：

* **桌面端 (`md:` 以上)**：显示顶部右上角的 Tab 切换容器，隐藏底部。
* **移动端 (`md:` 以下)**：
  * 隐藏顶部导航容器。
  * 在屏幕底部 `fixed bottom-0` 悬浮模糊透明背景的 Bottom Bar，高度固定为 `pb-20 md:pb-0` 的安全避让高度。
  * **联动机制**：
    由于按钮不再依靠单 ID（`id="tab-btn-search"`）来检索，我们引入 `data-tab` 标识。在 JS 点击切换时，同时高亮和更新顶部、底部所有匹配 `data-tab="X"` 的按钮样式。

---

## 📂 2. 个股列表卡片化适配 (Table-to-Card Responsive Design)

移动端的窄屏不支持宽表格，强行滚动会导致核心数据（涨停动因、代码）发生断截。我们对其进行自适应转换：

### 2.1 表格结构拆解
* **`<thead>` (表头)**：在移动端设定为 `hidden md:table-header-group`，隐藏表头空间。
* **`<tr>` (表格行)**：
  * 在移动端（小屏下）转换为 `flex flex-col mb-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm`。每一行成为一个独立的个股汇总卡片。
  * 在大屏下恢复 `md:table-row` 铺平状态。
* **`<td>` (单元格)**：
  * 设为 `block md:table-cell`。在移动端作为独立块纵向排列。
  * **时间列分离**：在移动端，将时间列整合到最上方与板式徽章水平排齐（`flex justify-between`），大屏下则放回独立的第三列单元格中。
  * **动因卡槽化**：移动端的涨停原因添加一个 `bg-slate-50 p-2.5 rounded-lg` 的卡槽底色，并带有 `md:hidden` 专属小标签（“涨停动因 & 概念”），极具可读性。

---

## 🛠️ 3. 其它移动端优化细节

1. **批量上传表格**：在 `upload.js` 中，控制台的表格对于宽屏显示友好，但在小屏下由于有“删除”和“双击修改日期”的动作，我们允许在 `md:` 以下隐藏部分对日期单元格和文件名宽度进行控制。
2. **复盘长图自适应**：
   * 移动端展开图片后，最大宽度限制为 `max-w-full`，并提供“点击图片可以长按或新标签页中打开”的友好交互。
