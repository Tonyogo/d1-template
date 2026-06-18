import { Hono } from 'hono';
import { Env } from '../types';
import * as reviewController from './review';
import * as searchController from './search';
import * as activeController from './active';
import * as imageController from './image';
import * as uploadController from './upload';
import * as feishuController from './feishu';

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
	app.get('/api/daily-summaries', reviewController.getSummaries);
	app.get('/api/daily-details/:date', reviewController.getDetails);
	app.get('/api/search', searchController.search);
	app.get('/api/active-sectors', activeController.getActiveSectors);
	app.get('/api/image', imageController.getImage);
	app.get('/api/pending-images', uploadController.listPendingImages);
	app.get('/api/pending-image', imageController.getPendingImage);
	app.post('/api/upload', uploadController.uploadReview);
	app.post('/api/batch/upload', uploadController.batchUpload);
	app.post('/api/batch/process', uploadController.batchProcess);
	app.post('/api/feishu/callback', feishuController.handleCallback);
}
