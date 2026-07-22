<script lang="ts">
	import Contrast from '@lucide/svelte/icons/contrast';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Palette from '@lucide/svelte/icons/palette';
	import Sun from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Label } from '$lib/components/ui/label';
	import {
		THEME_COLORS,
		THEME_MODES,
		themeStore,
		type ThemeColor,
		type ThemeMode
	} from '$lib/stores';

	const colorOptions: Record<ThemeColor, { label: string; swatch: string }> = {
		classic: { label: 'Classic', swatch: 'bg-sky-500' },
		purple: { label: 'Purple', swatch: 'bg-purple-500' },
		blue: { label: 'Blue', swatch: 'bg-blue-600' },
		yellow: { label: 'Yellow', swatch: 'bg-yellow-400' },
		green: { label: 'Green', swatch: 'bg-green-600' },
		'high-contrast': { label: 'High contrast', swatch: 'bg-black dark:bg-white' }
	};

	const modeLabels: Record<ThemeMode, string> = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};
</script>

<section class="dk-panel grid gap-5 rounded-xl border p-5" aria-labelledby="appearance-heading">
	<header class="flex items-center gap-3">
		<Palette class="size-5 shrink-0" />
		<div class="grid gap-1">
			<h2 id="appearance-heading" class="text-base font-semibold">Appearance</h2>
			<p class="m-0 text-xs text-muted-foreground">
				Choose how the workspace looks. Changes are applied immediately.
			</p>
		</div>
	</header>

	<div class="grid gap-5 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)]">
		<div class="grid content-start gap-2">
			<Label>Color mode</Label>
			<ButtonGroup.Root class="w-fit">
				{#each THEME_MODES as mode (mode)}
					<Button
						variant={themeStore.mode === mode ? 'default' : 'outline'}
						aria-pressed={themeStore.mode === mode}
						onclick={() => themeStore.setMode(mode)}
					>
						{#if mode === 'light'}
							<Sun />
						{:else if mode === 'dark'}
							<Moon />
						{:else}
							<Monitor />
						{/if}
						{modeLabels[mode]}
					</Button>
				{/each}
			</ButtonGroup.Root>
		</div>

		<div class="grid gap-2">
			<Label>Color theme</Label>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each THEME_COLORS as color (color)}
					{@const option = colorOptions[color]}
					<Button
						variant={themeStore.color === color ? 'default' : 'outline'}
						class="h-auto justify-start py-2.5"
						aria-pressed={themeStore.color === color}
						onclick={() => themeStore.setColor(color)}
					>
						<span class={['size-3 rounded-full border border-foreground/25', option.swatch]}></span>
						{#if color === 'high-contrast'}<Contrast class="size-3.5" />{/if}
						{option.label}
					</Button>
				{/each}
			</div>
		</div>
	</div>
</section>
