# Image Controller Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图片拉取控制器中的直接 R2 存储桶操作剥离，将其下沉到独立编写的 `ImageService` 业务服务层中，以彻底符合三层后端合规性设计。

**Architecture:** 
1. **控制层 (Controller)**：`src/controllers/image.ts` 捕获 Query 中的 `date` 并做基础参数检验、注入 `c.env.BUCKET` 实例化 `ImageService`。
2. **业务层 (Service)**：`src/services/image.service.ts` 专职处理通过 R2 桶加载 png/jpg/jpeg/webp 后缀名的具体原始图片流，降低 Controller 复杂度。

**Tech Stack:** Cloudflare Workers, Hono Framework, R2 Storage, TypeScript.

---

### Task 1: 创建 ImageService 隔离 R2 调用

**Files:**
- Create: `src/services/image.service.ts`

- [ ] **Step 1: 创建 `src/services/image.service.ts` 并实现 R2 图像文件寻找逻辑**

新建并写入整个文件，不能有任何 `TODO` 或占位符：
```typescript
export class ImageService {
	constructor(private bucket: R2Bucket) {}

	/**
	 * 根据复盘日期依次遍历常见后缀（png, jpg, jpeg, webp），从 R2 存储桶中拉取原始图片
	 * @param date YYYY-MM-DD 格式日期
	 * @returns 返回 R2 存储实体 R2ObjectBody 或 null
	 */
	async getImageByDate(date: string): Promise<R2ObjectBody | null> {
		const extensions = ["png", "jpg", "jpeg", "webp"];
		for (const ext of extensions) {
			const object = await this.bucket.get(`images/${date}.${ext}`);
			if (object) {
				return object;
			}
		}
		return null;
	}
}
```

- [ ] **Step 2: 编译类型安全审查**

Run: `npm run check`
Expected: 编译成功。

- [ ] **Step 3: 将服务文件存入 Git 并 Commit**

```bash
git add src/services/image.service.ts
git commit -m "feat: implement ImageService to encapsulate R2 bucket file loading operations"
```

---

### Task 2: 重构 ImageController 只做控制层业务

**Files:**
- Modify: `src/controllers/image.ts`

- [ ] **Step 1: 升级 `src/controllers/image.ts` 调用 Service**

将原文件替换为 Hono 规范控制器代码，移除对 R2 桶实体方法以及文件后缀命名的直接操作：
```typescript
import { Context } from 'hono';
import { ImageService } from '../services/image.service';

export async function getImage(c: Context) {
	const date = c.req.query('date');
	if (!date) {
		return c.json({ error: "Missing date parameter" }, 400);
	}

	if (!c.env.BUCKET) {
		return c.json({ error: "R2 bucket is not configured" }, 500);
	}

	// 动态注入 R2 Bucket 绑定依赖实例化 Service，彻底划清层级边界
	const imageService = new ImageService(c.env.BUCKET);
	try {
		const object = await imageService.getImageByDate(date);
		
		if (!object) {
			return c.json({ error: "Image Not Found for specified date" }, 404);
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("etag", object.httpEtag);
		headers.set("cache-control", "public, max-age=31536000");

		return new Response(object.body, { headers });
	} catch (error: any) {
		console.error("Error retrieving image inside controller:", error);
		return c.json({ error: "Internal Server Error during image retrieval", message: error.message }, 500);
	}
}
```

- [ ] **Step 2: 编译与部署干跑验证**

Run: `npm run check`
Expected: 编译 100% 正确无任何 TS 错漏。

- [ ] **Step 3: 将控制器层修改进行 Commit**

```bash
git add src/controllers/image.ts
git commit -m "refactor: simplify ImageController by delegating R2 loading logic to ImageService"
```
