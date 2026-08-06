<script lang="ts">
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import { mergeProps } from 'bits-ui';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/components/ui/utils';
	import { DOCUMENT_SORT_OPTIONS, type DocumentSortMode } from '$lib/utils';

	interface Props {
		onChange: (value: DocumentSortMode) => void;
		value: DocumentSortMode;
	}

	let { onChange, value }: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Tooltip.Root>
				<Tooltip.Trigger
					{...mergeProps(props, {
						class: cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')
					})}
				>
					<ArrowUpDown /> Sort
				</Tooltip.Trigger>
				<Tooltip.Content>Sort documents</Tooltip.Content>
			</Tooltip.Root>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.RadioGroup {value} onValueChange={(next) => onChange(next as DocumentSortMode)}>
			{#each DOCUMENT_SORT_OPTIONS as option (option.value)}
				<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
