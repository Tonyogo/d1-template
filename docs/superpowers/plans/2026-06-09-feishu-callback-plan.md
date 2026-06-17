# 飞书事件回调接口集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个合规、安全的飞书（Lark Suite）事件订阅回调接口。支持 URL 首次挑战认证，且对后续具体事件进行 Token 级安全验证过滤，防止未授权的伪造请求入侵。

**Architecture:**
- **Hono Controller (`src/controllers/feishu.ts`)**：解析飞书传入的 Payload。验证 header 中的 token 是否匹配；如属于 `url_verification` 则即时吐出挑战字串响应，否则进入 `FeishuService` 分发。
- **Feishu Service (`src/services/feishu.service.ts`)**：提供无状态的、解耦业务分发机制。对不同消息事件提供可扩展的方法支持（如 `im.message.receive_v1` 等）。

**Tech Stack:** Cloudflare Workers, Hono Web Framework, TypeScript 5.9.3.

---

### Task 1: 升级强类型变量并创建业务服务层

**Files:**
- Modify: `src/types.ts`
- Create: `src/services/feishu.service.ts`

- [ ] **Step 1: 在 `src/types.ts` 中新增飞书安全校验环境变量声明**

在 `Env` 接口中，增加 `FEISHU_VERIFICATION_TOKEN` 环境变量：
```typescript
export interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	GEMINI_API_KEY?: string;
	GEMINI_API_BASE?: string;
	GEMINI_MODEL?: string;
	FEISHU_VERIFICATION_TOKEN?: string; // 飞书安全校验 Token
}
```

- [ ] **Step 2: 创建飞书业务服务层 `src/services/feishu.service.ts`**

新建此文件。实现一个极简但扩展性极佳的事件分发器，在接收到具体业务事件时提供友好的控制台或日志打印：
```typescript
import { Env } from '../types';

export class FeishuService {
	constructor(private env: Env) {}

	/**
	 * 统一的分发入口，根据 2.0 格式事件类型分流
	 * @param eventType 飞书事件名，如 "im.message.receive_v1"
	 * @param eventData 具体事件负载 event 节点内容
	 */
	async handleEvent(eventType: string, eventData: any): Promise<void> {
		console.log(`[FeishuEvent] Received event: ${eventType}`, JSON.stringify(eventData));

		switch (eventType) {
			case 'im.message.receive_v1':
				await this.handleMessageReceive(eventData);
				break;
			// 可以在此随时追加其它订阅事件类型
			default:
				console.log(`[FeishuEvent] Unhandled event type: ${eventType}`);
		}
	}

	private async handleMessageReceive(event: any): Promise<void> {
		const message = event.message;
		const sender = event.sender;
		console.log(`[FeishuEvent] Received message from ${sender?.sender_id?.open_id}: ${message?.content}`);
		// 后续如果有飞书应用消息自动回复等业务，可在此直接扩展调用
	}
}
```

- [ ] **Step 3: 编译安全校验**

Run: `npm run check`
Expected: 编译通过，类型检测正确。

---

### Task 2: 编写 Hono 控制层与路由挂载

**Files:**
- Create: `src/controllers/feishu.ts`
- Modify: `src/controllers/index.ts`

- [ ] **Step 1: 新建飞书回调控制器 `src/controllers/feishu.ts`**

创建该文件，处理 URL Challenge 和 Token 过滤逻辑：
```typescript
import { Context } from 'hono';
import { FeishuService } from '../services/feishu.service';

export async function handleCallback(c: Context) {
	try {
		const body = await c.req.json();
		const verificationToken = c.env.FEISHU_VERIFICATION_TOKEN;

		// 1. 获取请求携带的 Token 用于安全防范
		// 飞书 2.0 事件的 Token 位于 header.token，1.0/首次挑战的 Token 位于最外层 body.token
		const requestToken = body?.header?.token || body?.token;

		// 如果配置了本地 Token，则必须执行强校验阻断非合法请求
		if (verificationToken && requestToken !== verificationToken) {
			console.warn("[FeishuCallback] Token mismatch! Unauthorized access attempt blocked.");
			return c.json({ error: "Unauthorized: Token mismatch" }, 401);
		}

		// 2. 判断是否为首次 URL Verification Challenge
		// 2.0 格式挑战的 type 依旧在 body.type，或 body.header.event_type 中
		const isChallenge = body?.type === 'url_verification' || body?.header?.event_type === 'url_verification';
		if (isChallenge) {
			const challengeValue = body?.challenge;
			if (!challengeValue) {
				return c.json({ error: "Missing challenge parameter" }, 400);
			}
			console.log("[FeishuCallback] Received url_verification, responding with challenge successfully.");
			return c.json({ challenge: challengeValue });
		}

		// 3. 正常业务事件，异步触发 FeishuService 分发
		const eventType = body?.header?.event_type || body?.type;
		const eventData = body?.event || body;

		if (eventType) {
			const feishuService = new FeishuService(c.env);
			// Worker 极其推崇的非阻塞异步后台事件触发模式
			c.executionCtx.waitUntil(feishuService.handleEvent(eventType, eventData));
		}

		// 飞书开放平台硬性规定：回调接口必须在 3 秒内返回 HTTP 200 表示成功接收，避免飞书系统超时重试
		return c.json({ success: true });
	} catch (error: any) {
		console.error("Error in Feishu callback controller:", error);
		return c.json({ error: "Internal Server Error", message: error.message }, 500);
	}
}
```

- [ ] **Step 2: 在控制器总路由注册 `src/controllers/index.ts`**

在 `src/controllers/index.ts` 中，导入控制器并挂载 POST 路径：
```typescript
import * as feishuController from './feishu';

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
	// ... 已有路由保持不变 ...
	app.post('/api/feishu/callback', feishuController.handleCallback);
}
```

- [ ] **Step 3: 运行 `npm run check` 检查 Hono 路由类型安全与编译**

Run: `npm run check`
Expected: 编译通过且无 TS 错误。

- [ ] **Step 4: 提交变动并 Commit**

```bash
git add src/
git commit -m "feat: implement Feishu callback controller and service for event subscriptions"
```
