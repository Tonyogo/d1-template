import { Env } from '../types';

export class GeminiClient {
	/**
	 * Call Gemini OCR API to extract text from image as Markdown
	 */
	static async callGeminiOCR(imageBlob: Blob, mimeType: string, env: Env): Promise<string> {
		const arrayBuffer = await imageBlob.arrayBuffer();
		// In Cloudflare Workers environment, global Buffer might not be directly available,
		// but since we might run on workerd or with node_compat, let's use a standard Web API representation
		// or Buffer if available. Let's make it robust.
		let base64String: string;
		if (typeof Buffer !== 'undefined') {
			base64String = Buffer.from(arrayBuffer).toString('base64');
		} else {
			const bytes = new Uint8Array(arrayBuffer);
			let binary = '';
			const len = bytes.byteLength;
			for (let i = 0; i < len; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			base64String = btoa(binary);
		}

		const apiBase = env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
		const model = env.GEMINI_MODEL || 'gemini-flash-latest';
		const apiKey = env.GEMINI_API_KEY;

		if (!apiKey) {
			throw new Error("GEMINI_API_KEY is not configured");
		}

		const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;

		const payload = {
			contents: [
				{
					parts: [
						{
							inlineData: {
								data: base64String,
								mimeType: mimeType
							}
						},
						{
							text: "请对输入图片执行以下任务：1. 提取图片中所有可见文字 2. 保持原始阅读顺序 3. 按内容结构转换为 Markdown 4. 只输出最终 Markdown 格式"
						}
					],
					role: "user"
				}
			],
			systemInstruction: {
				parts: [
					{
						text: "# OCR 助手\n你是一个专业的 OCR 与文档结构重建引擎。\n你的任务是将图片中的文字内容，严格、完整地转换为 Markdown 文档。\n\n必须遵守以下规则：\n1. 只输出 Markdown，不要输出任何解释性文字\n2. 不增加、不删除、不改写原始内容\n3. 保持原始阅读顺序\n4. 无法识别的内容用 `<!-- unreadable -->` 标记\n5. 所有文字都是从图片中获取，不要掺杂非图片中的文字\n\n结构转换规则：\n- 标题 → # / ## / ###\n- 段落 → 普通文本\n- 列表 → Markdown 列表\n- 表格 → Markdown 表格\n- 代码 → ``` 包裹\n- 强调 → ** / *\n\n排版规则：\n- 合并不必要的换行\n- 保持语义完整\n"
					}
				],
				role: "user"
			}
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errText}`);
		}

		const json: any = await response.json();
		if (!json.candidates || json.candidates.length === 0 || !json.candidates[0].content || !json.candidates[0].content.parts || json.candidates[0].content.parts.length === 0) {
			throw new Error("Empty or invalid response from Gemini API");
		}

		return json.candidates[0].content.parts[0].text;
	}
}
