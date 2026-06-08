import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const backendTarget = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';
const backendRoutes = [
	'/api',
	'/begin',
	'/logout',
	'/healthz',
	'/static',
	'/documents',
	'/search',
	'/remove',
	'/upload',
	'/upload-local',
	'/upload-progress',
	'/ingest',
	'/clear_db',
	'/folders',
	'/progress',
	'/corpus',
	'/sessions',
	'/session',
	'/segments',
	'/user',
	'/providers',
	'/directory',
	'/ocr',
	'^/(ollama|openai|anthropic|gemini|github|github_models)(/|$)'
];

const backendProxy = Object.fromEntries(
	backendRoutes.map((route) => [
		route,
		{
			target: backendTarget,
			changeOrigin: false,
			ws: true
		}
	])
);

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: backendProxy
	}
});
