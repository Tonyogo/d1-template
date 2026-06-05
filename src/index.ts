import { Hono } from 'hono';
import { Env } from './types';
import { registerRoutes } from './controllers';

const app = new Hono<{ Bindings: Env }>();

// 自动向 Hono 注册所有的 API 路由
registerRoutes(app);

export default app;
