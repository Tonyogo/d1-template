import { Hono } from 'hono';
import { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// 所有的后端 API 一律挂载至 /api 前缀下
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'A-Share Limit-up Backend' }));

export default app;
