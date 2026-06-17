# 飞书事件回调接口（Feishu Callback）集成设计规格书

---

## 🏛️ 1. 系统核心设计

我们将为项目后端（Hono 路由）增加一个专职接收飞书开放平台（Lark Suite）事件订阅的 Callback 接口。飞书开放平台的事件订阅机制在第一次配置时会触发 **URL 首次验证（url_verification）**，在后续正常运行时会源源不断发送**具体的业务事件（如消息接收、机器人私聊、审批流变更等）**。

### 1.1 飞书回调交互生命周期

#### 阶段 A：首次 URL Challenge 验证
1. 飞书开放平台向我们的服务器发送 `POST /api/feishu/callback`，Body 携带：
   ```json
   {
     "challenge": "ajlsd321hl885...",
     "token": "v_asldkfjhasdf...",
     "type": "url_verification"
     // 2.0 格式通常在 schema 属性中
   }
   ```
2. 我们需要校验其 Token 字段是否与我们在后台设置的 `FEISHU_VERIFICATION_TOKEN` 一致。
3. 校验通过后，直接向飞书返回 JSON：
   ```json
   {
     "challenge": "ajlsd321hl885..."
   }
   ```
4. 飞书验证成功，绑定接口生效。

#### 阶段 B：业务事件分发 (Token 安全校验)
1. 飞书向我们推送真实的业务事件，Body 格式如下：
   ```json
   {
     "schema": "2.0",
     "header": {
       "event_id": "f7850024...",
       "event_type": "im.message.receive_v1",
       "token": "v_asldkfjhasdf..."
     },
     "event": { ... }
   }
   ```
2. 我们的控制层在解析到 `header.token` 与本地 Token 一致后，提取具体 Event 类型将其分发给 `FeishuService`，由 Service 控制后续业务流。

---

## 📂 2. 重构与新增文件清单

* **新建服务**：`src/services/feishu.service.ts` ── 用于多事件统一管理分发。
* **新建控制层**：`src/controllers/feishu.ts` ── 实现 Hono 的 `/api/feishu/callback` 请求解析与 Token 阻断。
* **注册路由**：`src/controllers/index.ts` ── 注册 POST 路由。
* **环境变量声明**：`src/types.ts` ── 新增环境变量强类型。
