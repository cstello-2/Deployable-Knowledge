<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import Palette from '@lucide/svelte/icons/palette';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	// resolve() may return request-relative hrefs during SSR, so active-state
	// comparison must use the plain pathname, not the resolved href.
	const items = [
		{ label: 'Agent', path: '/settings/agent', icon: Bot },
		{ label: 'Models', path: '/settings/models', icon: HardDrive },
		{ label: 'Theme', path: '/settings/theme', icon: Palette }
	] as const;
</script>

<nav aria-label="Settings sections">
	<ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 md:flex-col md:overflow-visible">
		{#each items as item (item.path)}
			{@const active = page.url.pathname === item.path}
			<li class="shrink-0">
				<a
					href={resolve(item.path)}
					aria-current={active ? 'page' : undefined}
					class={[
						'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
						active
							? 'border-border bg-background text-foreground shadow-sm'
							: 'border-transparent text-muted-foreground hover:bg-card/75 hover:text-foreground'
					]}
				>
					<item.icon class="size-4 shrink-0" />
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
