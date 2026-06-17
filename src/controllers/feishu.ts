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
