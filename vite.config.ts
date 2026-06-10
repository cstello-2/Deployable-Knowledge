import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const backendTarget = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';
const backendRoutes = [
	'/api', 
	'/begin', 
	// '/logout', //TAG NOT USED
	// '/healthz', //TAG NOT USED
	// '/static', //TAG NOT USED
	'/documents', 
	'/search', 
	'/remove', 
	'/upload', 
	'/upload-local', 
	'/upload-progress', 
	// '/ingest', //TAG NOT USED
	// '/clear_db', //TAG NOT USED
	'/folders', 
	'/progress', 
	'/corpus', 
	'/sessions', 
	'/session', 
	'/segments', 
	'/user', 
	'/providers', 
	'/directory', 
	// '/ocr', //TAG NOT USED
	// '^/(ollama|openai|anthropic|gemini|github|github_models)(/|$)' //TAG NOT USED?
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
