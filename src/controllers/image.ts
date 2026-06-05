import { Context } from 'hono';

export async function getImage(c: Context) {
	const date = c.req.query('date');
	if (!date) {
		return c.json({ error: "Missing date parameter" }, 400);
	}

	if (!c.env.BUCKET) {
		return c.json({ error: "R2 bucket is not configured" }, 500);
	}

	const extensions = ["png", "jpg", "jpeg", "webp"];
	let object: R2ObjectBody | null = null;
	for (const ext of extensions) {
		const tempObj = await c.env.BUCKET.get(`images/${date}.${ext}`);
		if (tempObj) {
			object = tempObj;
			break;
		}
	}

	if (!object) {
		return c.json({ error: "Image Not Found for specified date" }, 404);
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000");

	return new Response(object.body, { headers });
}
