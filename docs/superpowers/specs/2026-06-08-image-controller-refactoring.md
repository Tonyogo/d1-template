---
name: image-controller-refactoring
description: Decouple direct R2 calls out of Image Controller by introducing a dedicated ImageService under services layer to ensure 3-tier backend alignment.
metadata:
  type: project
---

# 🚀 Image 控制器层职责下沉与三层架构合规规范 (Image Service SPEC)

本文档规范了项目内 R2 原始图片加载 API 接口的架构重构。重构主要目的是消除 Controller 层中存在的越界访问 R2 Bucket 和在接口层实现图片查找格式分支的问题。

---

## 🏛️ 1. 架构合规性与三层边界

根据项目核心规范 `CLAUDE.md`：
* **Controller 层（控制层）**：只允许承担提取 Hono 参数、做基础合法性校验、注入环境依赖实例化 Service、最后返回标准的 Hono `Response`，**绝对禁止直接访问持久化数据存储（D1/R2）**。
* **Service 层（业务服务层）**：承载业务流逻辑，对 R2 存储桶执行遍历寻找图片对象。

---

## 📂 2. 重构涉及文件清单

* **新建文件**：`src/services/image.service.ts` ── 创建专门的图片业务处理 Service，接管 R2 桶交互。
* **重构文件**：`src/controllers/image.ts` ── 剥离 R2 调用，只通过 `ImageService` 索要数据，并处理 HTTP 协议头输出。

---

## 🛠️ 3. 新增类及方法签名规范

### 3.1 `src/services/image.service.ts` (新增)
```typescript
export class ImageService {
    constructor(private bucket: R2Bucket) {}

    /**
     * 根据复盘日期，依次寻找 png/jpg/jpeg/webp 后缀名格式的原始归档 R2 文件对象
     * @param date 日期 YYYY-MM-DD 格式
     * @returns 返回找到的 R2 存储流或 null
     */
    async getImageByDate(date: string): Promise<R2ObjectBody | null>;
}
```

### 3.2 `src/controllers/image.ts` (重构)
```typescript
import { Context } from 'hono';

/**
 * Hono 控制器接口
 * 职责：
 * 1. 校验 query 中是否有 date 入参（无则拦截返回 400）。
 * 2. 校验 R2 Bucket 绑定是否存在（无则拦截返回 500）。
 * 3. 注入 c.env.BUCKET 初始化 ImageService 实例。
 * 4. 调用服务拉取大文件流。
 * 5. 写入 Etag、HTTP 缓存头，并流式输出 Response。
 */
export async function getImage(c: Context): Promise<Response>;
```

---

## 🛡️ 4. 容错与缓存管理

* 如果 R2 获取文件出现底层未知异常，Controller 应当进行 `try/catch` 捕捉，并友好返回 `HTTP 500` 及明确的异常摘要，杜绝空指针或未知断联挂起。
* 成功拉取到的图片应继续维持 `public, max-age=31536000`（1年长效强缓存）和 Etag 校验特性，降低 R2 带来的重复 API 计费开销。
