export class ImageService {
	constructor(private bucket: R2Bucket) {}

	/**
	 * 根据复盘日期依次遍历常见后缀（png, jpg, jpeg, webp），从 R2 存储桶中拉取原始图片
	 * @param date YYYY-MM-DD 格式日期
	 * @returns 返回 R2 存储实体 R2ObjectBody 或 null
	 */
	async getImageByDate(date: string): Promise<R2ObjectBody | null> {
		const extensions = ["png", "jpg", "jpeg", "webp"];
		for (const ext of extensions) {
			const object = await this.bucket.get(`images/${date}.${ext}`);
			if (object) {
				return object;
			}
		}
		return null;
	}

	/**
	 * 读取并返回暂存的 R2ObjectBody 或 null，严格防御路径穿透
	 * @param key R2 对象的键
	 * @returns 返回 R2ObjectBody 或 null
	 */
	async getPendingImage(key: string): Promise<R2ObjectBody | null> {
		if (!key.startsWith("images/pending/")) {
			throw new Error("Access denied: Invalid pending image path");
		}
		const object = await this.bucket.get(key);
		return object;
	}
}
