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
