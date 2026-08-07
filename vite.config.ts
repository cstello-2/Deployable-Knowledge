import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, normalizePath } from 'vite';

const UNWATCHED_RUNTIME_PATHS = ['./documents/', './app.db'].map((path) =>
	normalizePath(fileURLToPath(new URL(path, import.meta.url)))
);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: { exclude: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	ssr: { external: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	server: {
		watch: {
			ignored: (path) =>
				UNWATCHED_RUNTIME_PATHS.some((runtimePath) => normalizePath(path).startsWith(runtimePath))
		}
	}
});
