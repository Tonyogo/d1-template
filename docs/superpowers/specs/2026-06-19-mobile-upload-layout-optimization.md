# 2026-06-19 暂存队列移动端卡片化自适应与按钮全宽化设计规范

## 1. 痛点与异常表现

随着暂存两步式上传机制的落地，用户能快速上传多张图片。但是在移动设备（如手机/竖屏平板）上查看“上传数据”标签下的“云端待处理暂存队列”时，产生了严重的视觉和操作错位：
* **表格过宽**：原生 HTML `<table>` 在小屏幕下，五列（缩略图、文件名+上传时间、日期输入框、大小、按钮组）被强行横向拉扯。即使有 `overflow-x-auto`，用户也需要不停横向滚动，无法一屏看清全貌。
* **点击区域错误**：某些小尺寸开关和按钮点击区域过小。
* **按钮控制栏拥挤**：头部的“刷新列表”与“一键顺序处理”按钮在手机窄屏上发生换行重叠，严重影响视觉平衡和点击手感。

---

## 2. 解决方案：去中心化一屏化响应式重构 (Responsive Unification)

通过重构 `public/index.html` 的结构和 `public/js/tabs/upload.js` 的渲染模板，实现**“桌面端用极简表格，移动端用优雅卡片/合并槽”**的自适应双轨响应体验。

### 2.1 头部控制按钮一屏美化
将 `pending-console-container` 顶部的操作区域由横向并列改为在移动端自适应列状平铺，并把按钮改造成圆润大点击区：
* **移动端（< 768px）**：刷新列表和一键处理按钮呈 1:1 等宽并排平铺，手指轻触即可精确触发。
* **桌面端（>= 768px）**：依然保持右侧紧凑按钮组排列。

### 2.2 待处理行重构（移动端卡片化，桌面端表格行化）
彻底废除原生的多 td 标签分散构造法，在 `upload.js` 中将 `renderPendingRow` 改写为自适应 Flex/Table-row innerHTML 融合体：
* **在移动端**：
  - `<thead class="...">` 表头完全隐藏。
  - `tr` 整体转型为一个**高颜值的白色圆角卡片**（带有 `flex flex-col rounded-2xl border p-4 shadow-sm mb-4`）。
  - **档案合并展示**：左侧展示 `w-14 h-14` 的大图缩略图，右边将长文件名进行智能截断（`truncate line-clamp-1`），下方一排微缩展示大小与上传时间。
  - **日期选择器全宽化**：日期选择框宽度充满卡片，并带有“目标复盘日期”的微缩标头，极其现代。
  - **解析和删除按键横向撑满**：两个按键成排等宽，大尺寸极易操作。
* **在桌面端**：
  - 自动复原成原汁原味的 `table-row`，完美对齐传统表头。

---

## 3. 具体修改方案

### 3.1 `public/index.html` 的结构升级
* 隐藏 `thead`：
  `<thead class="bg-slate-50/75 text-slate-500 font-semibold text-xs uppercase tracking-wider text-left hidden md:table-header-group">`
* 控制栏自适应：
  ```html
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
      ...
      <div class="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 w-full sm:w-auto">
          <!-- 自适应按钮组 -->
      </div>
  </div>
  ```

### 3.2 `public/js/tabs/upload.js` 的行生成重写
将 `renderPendingRow` 进行重组。所有节点获取与事件监听完全在 innerHTML 创建后进行高可用精准对齐，防范空指针与未绑定 Bug。
通过该系统，整个上传控制台在手机上将宛如原生 APP 的卡片待办队列，体验直冲巅峰！
