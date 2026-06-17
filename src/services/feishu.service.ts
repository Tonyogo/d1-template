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
