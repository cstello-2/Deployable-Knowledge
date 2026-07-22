<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/components/ui/utils';
	import { DOCUMENT_TAG_PATTERN, normalizeDocumentTag } from '$lib/utils';
	import { mergeProps } from 'bits-ui';
	import TagPaletteItem from './TagPaletteItem.svelte';

	interface Props {
		compact?: boolean;
		onCreate?: (tag: string) => Promise<void> | void;
		onDelete?: (tag: string) => void;
		onToggle: (tag: string) => void;
		selected?: string[];
		tags: string[];
		title?: string;
		triggerIcon?: typeof Plus;
		triggerLabel?: string;
		triggerTooltip?: string;
	}

	let {
		compact = false,
		onCreate,
		onDelete,
		onToggle,
		selected = [],
		tags,
		title = 'Tags',
		triggerIcon: TriggerIcon = Plus,
		triggerLabel,
		triggerTooltip
	}: Props = $props();
	let creating = $state(false);
	let error = $state('');
	let newTag = $state('');

	async function createTag(): Promise<void> {
		if (!onCreate || creating) return;
		const tag = normalizeDocumentTag(newTag);
		if (!DOCUMENT_TAG_PATTERN.test(tag)) {
			error = 'Use letters, numbers, dashes, or underscores.';
			return;
		}
		if (tags.includes(tag)) {
			error = `#${tag} already exists.`;
			return;
		}

		creating = true;
		error = '';
		try {
			await onCreate(tag);
			newTag = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			creating = false;
		}
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			{#if compact}
				<ActionIcon class="size-6 rounded-full" label={title} size="icon-sm" triggerProps={props}
					><TriggerIcon /></ActionIcon
				>
			{:else}
				<Tooltip.Root>
					<Tooltip.Trigger
						{...mergeProps(props, { class: cn(buttonVariants(), 'cursor-pointer') })}
					>
						<TriggerIcon />
						{triggerLabel ?? title}
					</Tooltip.Trigger>
					<Tooltip.Content>{triggerTooltip ?? title}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" class="w-80">
		<div class="grid gap-3">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
					{title}
				</div>
				{#if selected.length}
					<span class="text-[11px] text-muted-foreground">{selected.length} selected</span>
				{/if}
			</div>

			<div
				class="flex max-h-48 flex-wrap content-start items-start gap-1.5 overflow-y-auto"
				role="group"
				aria-label={title}
			>
				{#each tags as tag (tag)}
					<TagPaletteItem
						onDelete={onDelete ? () => onDelete?.(tag) : undefined}
						onToggle={() => onToggle(tag)}
						selected={selected.includes(tag)}
						{tag}
					/>
				{:else}
					<p class="text-xs text-muted-foreground">No tags yet.</p>
				{/each}
			</div>

			{#if onCreate}
				<form
					class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t pt-3"
					onsubmit={(event) => {
						event.preventDefault();
						void createTag();
					}}
				>
					<Input
						aria-label="New tag name"
						bind:value={newTag}
						class="h-8"
						disabled={creating}
						placeholder="New tag"
					/>
					<Button disabled={creating || !newTag.trim()} size="sm" type="submit">
						<Plus /> Add
					</Button>
					{#if error}<p class="col-span-2 text-xs text-destructive">{error}</p>{/if}
				</form>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
