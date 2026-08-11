/**
 * Builds the SvelteKit app for the desktop shell.
 *
 * `svelte.config.js` swaps in adapter-node when `DK_TARGET` is `electron`, and
 * setting it here instead of in the npm script keeps the command working on
 * Windows shells that do not understand `VAR=value` prefixes.
 */
process.env.DK_TARGET = 'electron';

const { build } = await import('vite');

await build();
