import { Env } from '../types';

declare const Buffer: any;

export class GeminiClient {
	/**
	 * Call Gemini OCR API to extract text from image as Markdown.
	 * Supports optional stream mode (default is true) to process chunks incrementally,
	 * preventing Cloudflare 524 timeouts.
	 */
	static async callGeminiOCR(
		imageBlob: Blob,
		mimeType: string,
		env: Env,
		stream: boolean = true
	): Promise<string> {
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

		const prompt = "请识别分析这张 A 股涨停复盘长图，将其中的大盘指标、热点板块以及个股列表完整提取并重构为规范的 Markdown 文档。";

		const systemPrompt = `请将图片中的 A 股涨停复盘数据完整提取为 Markdown 文档。

### 转换规则：
1. 仅输出最终 Markdown 文本，无多余解释，不使用 \`\`\` 代码块包裹。
2. 严禁使用空格/Tab对齐，所有个股数据必须转为 5 列 Markdown 表格。
3. 字段细节：
   - 【连板】字间留空（如 \`首 板\`），一字板加 \`- \`（如 \`- 二 板\`），T字板加 \`T \`（如 \`T 二 板\`）。
   - 【股票名称】去空格；【代码】6位数字；【时间】HH:MM:SS。
   - 【涨停原因分析】用 \`+\` 连接，多行内容合并为一行，严禁单元格内换行。

### 严格按以下模板格式输出：
同花顺数据可视化
DATA VISUALIZATION

# MM月DD日 A股涨停复盘

热点复盘

- 一字涨停 T T字涨停

涨停个数：**XX** 只
总晋级率：**XX.XX%**
总炸板率：**XX.XX%**
总竞价涨幅：**+X.XX%**

### 板块名称：板块催化逻辑（若无逻辑则仅写板块名，如：### 其他概念）

| 连板 | 代码 | 名称 | 涨停时间 | 涨停原因分析 |
| :--- | :--- | :--- | :--- | :--- |
| 六 板 | 600371 | 万向德农 | 09:34:27 | 转基因玉米+玉米种业+新品研发 |
| - 三 板 | 002679 | 福建金森 | 09:25:00 | 林业主业+海峡两岸+国有控股 |
| T 二 板 | 300413 | 芒果超媒 | 10:21:00 | AIGC长剧+AI应用+微短剧 |

注：数据为连板数/个股/最终涨停时间/涨停原因分类；连板数高/涨停早/形态强，则资金关注度高
`;

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
							text: prompt
						}
					],
					role: "user"
				}
			],
			systemInstruction: {
				parts: [
					{
						text: systemPrompt
					}
				]
			}
		};

		if (stream) {
			const url = `${apiBase}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(`Gemini API error (stream): ${response.status} ${response.statusText} - ${errText}`);
			}

			if (!response.body) {
				throw new Error("Gemini API stream response body is null");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";
			let fullMarkdown = "";

			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || ""; // Save last incomplete line back to the buffer

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (trimmedLine.startsWith("data:")) {
							const dataStr = trimmedLine.slice(5).trim();
							if (!dataStr) continue;
							try {
								const parsed = JSON.parse(dataStr);
								const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
								if (text) {
									fullMarkdown += text;
								}
							} catch (e) {
								console.error("Failed to parse Gemini SSE data line:", dataStr, e);
							}
						}
					}
				}

				// Check if there is any trailing unprocessed line remaining in buffer
				if (buffer) {
					const trimmedLine = buffer.trim();
					if (trimmedLine.startsWith("data:")) {
						const dataStr = trimmedLine.slice(5).trim();
						if (dataStr) {
							try {
								const parsed = JSON.parse(dataStr);
								const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
								if (text) {
									fullMarkdown += text;
								}
							} catch (e) {
								console.error("Failed to parse Gemini SSE remaining data line:", dataStr, e);
							}
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			if (!fullMarkdown) {
				throw new Error("Empty or invalid streamed response from Gemini API");
			}

			return fullMarkdown;
		} else {
			const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(`Gemini API error (non-stream): ${response.status} ${response.statusText} - ${errText}`);
			}

			const json: any = await response.json();
			if (!json.candidates || json.candidates.length === 0 || !json.candidates[0].content || !json.candidates[0].content.parts || json.candidates[0].content.parts.length === 0) {
				throw new Error("Empty or invalid response from Gemini API");
			}

			return json.candidates[0].content.parts[0].text;
		}
	}
}
