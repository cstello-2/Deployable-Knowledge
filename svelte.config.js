import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';

// The Electron desktop build needs a self-contained Node server it can spawn as
// a child process, so it opts into adapter-node. Every other build keeps the
// auto adapter and its platform detection.
const adapter = process.env.DK_TARGET === 'electron' ? adapterNode : adapterAuto;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
		experimental: { async: true }
	},
	kit: {
		adapter: adapter(),
		alias: {
			$routes: 'src/routes'
		}
	}
};

export default config;
