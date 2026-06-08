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
}
