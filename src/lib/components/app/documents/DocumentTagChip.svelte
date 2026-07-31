<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { documentTagHue } from '$lib/utils';

	interface Props {
		onRemove?: () => void;
		tag: string;
	}

	let { onRemove, tag }: Props = $props();
</script>

{#if onRemove}
	<Tooltip.Root>
		<Tooltip.Trigger
			class="group rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			type="button"
			aria-label={`Remove #${tag}`}
			onclick={onRemove}
		>
			<Badge
				class="dk-tag dk-tag-selected min-h-6 gap-1 py-1 transition-[background-color,border-color,color]"
				style={`--tag-hue: ${documentTagHue(tag)}`}
				variant="outline"
			>
				#{tag}<X
					class="size-3 scale-75 opacity-0 transition-[opacity,transform] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
				/>
			</Badge>
		</Tooltip.Trigger>
		<Tooltip.Content>Remove #{tag}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<Badge
		class="dk-tag dk-tag-selected min-h-6 py-1"
		style={`--tag-hue: ${documentTagHue(tag)}`}
		variant="outline">#{tag}</Badge
	>
{/if}
