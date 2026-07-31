<script lang="ts" generics="Item extends { id: string }">
	import { onDestroy, tick, type Snippet } from 'svelte';
	import type { ReorderHandleProps } from './notebook-types';

	const ITEM_GAP = 8;
	const DRAG_THRESHOLD = 4;

	type ItemRect = { height: number; top: number };

	type ItemDrag = {
		active: boolean;
		dy: number;
		height: number;
		index: number;
		itemId: string;
		maxDy: number;
		minDy: number;
		pointerId: number;
		rects: ItemRect[];
		startY: number;
		targetIndex: number;
	};

	type ItemSettle = { dy: number; itemId: string; pending: boolean };

	interface Props {
		ariaLabel: string;
		disabled?: boolean;
		empty: Snippet;
		item: Snippet<[Item, ReorderHandleProps]>;
		items: readonly Item[];
		onMove: (itemId: string, targetIndex: number) => Promise<void> | void;
	}

	let { ariaLabel, disabled = false, empty, item, items, onMove }: Props = $props();
	let announcement = $state('');
	let drag = $state<ItemDrag | null>(null);
	let itemElements = $state<(HTMLElement | undefined)[]>([]);
	let settle = $state<ItemSettle | null>(null);
	let settleTimer = 0;

	onDestroy(() => clearTimeout(settleTimer));

	function handlePointerDown(event: PointerEvent, index: number, itemId: string): void {
		if (disabled || !event.isPrimary || event.button !== 0) return;
		clearTimeout(settleTimer);
		settle = null;

		const rects: ItemRect[] = [];
		for (const element of itemElements.slice(0, items.length)) {
			if (!element) return;
			rects.push({ height: element.offsetHeight, top: element.offsetTop });
		}

		const current = rects[index];
		const first = rects[0];
		const last = rects.at(-1);
		if (!current || !first || !last) return;

		const currentCenter = current.top + current.height / 2;
		const firstCenter = first.top + first.height / 2;
		const lastCenter = last.top + last.height / 2;

		drag = {
			active: false,
			dy: 0,
			height: current.height,
			index,
			itemId,
			maxDy: lastCenter - currentCenter + 1,
			minDy: firstCenter - currentCenter,
			pointerId: event.pointerId,
			rects,
			startY: event.clientY,
			targetIndex: index
		};
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;

		const dy = event.clientY - drag.startY;
		if (!drag.active) {
			if (Math.abs(dy) < DRAG_THRESHOLD) return;
			drag.active = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		event.preventDefault();
		drag.dy = Math.min(Math.max(dy, drag.minDy), drag.maxDy);
		const center = drag.rects[drag.index].top + drag.dy + drag.height / 2;
		let targetIndex = 0;
		for (const [index, rect] of drag.rects.entries()) {
			if (index !== drag.index && center > rect.top + rect.height / 2) targetIndex += 1;
		}
		drag.targetIndex = targetIndex;
	}

	async function handlePointerEnd(event: PointerEvent, commit: boolean): Promise<void> {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const { active, dy, height, index, itemId, rects, targetIndex } = drag;

		if (!commit || !active || targetIndex === index) {
			drag = null;
			return;
		}

		const target = rects[targetIndex];
		if (!target) {
			drag = null;
			return;
		}

		const slotTop = targetIndex > index ? target.top + target.height - height : target.top;
		settle = { dy: rects[index].top + dy - slotTop, itemId, pending: true };
		drag = null;
		announcement = `Moved item to position ${targetIndex + 1} of ${items.length}`;
		const moveResult = onMove(itemId, targetIndex);

		await tick();
		itemElements[targetIndex]?.getBoundingClientRect();
		settle = { dy: 0, itemId, pending: false };
		clearTimeout(settleTimer);
		settleTimer = window.setTimeout(() => (settle = null), 200);
		await moveResult;
	}

	function handleKeydown(event: KeyboardEvent, index: number, itemId: string): void {
		if (disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;

		const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
		event.preventDefault();
		if (targetIndex < 0 || targetIndex >= items.length) return;
		announcement = `Moved item to position ${targetIndex + 1} of ${items.length}`;
		void onMove(itemId, targetIndex);
	}

	function reorderHandleProps(index: number, itemId: string): ReorderHandleProps {
		return {
			'aria-keyshortcuts': 'ArrowUp ArrowDown',
			onkeydown: (event) => handleKeydown(event, index, itemId),
			onpointercancel: (event) => void handlePointerEnd(event, false),
			onpointerdown: (event) => handlePointerDown(event, index, itemId),
			onpointermove: handlePointerMove,
			onpointerup: (event) => void handlePointerEnd(event, true)
		};
	}

	function itemShift(index: number): number {
		if (!drag?.active || index === drag.index) return 0;
		if (index > drag.index && index <= drag.targetIndex) return -(drag.height + ITEM_GAP);
		if (index < drag.index && index >= drag.targetIndex) return drag.height + ITEM_GAP;
		return 0;
	}
</script>

<nav aria-label={ariaLabel}>
	<div class="grid content-start gap-2 p-3" role="list">
		{#each items as value, index (value.id)}
			{@const dragging = drag?.active === true && drag.itemId === value.id}
			{@const settleDy = settle?.itemId === value.id ? settle.dy : null}
			{@const shift = itemShift(index)}
			<div
				aria-posinset={index + 1}
				aria-setsize={items.length}
				bind:this={itemElements[index]}
				class={[
					'relative transition-transform duration-150',
					(dragging || settleDy !== null) && 'z-10 shadow-md',
					(dragging || settle?.pending) && 'transition-none'
				]}
				role="listitem"
				style:transform={dragging
					? `translateY(${drag?.dy ?? 0}px)`
					: settleDy !== null
						? `translateY(${settleDy}px)`
						: shift
							? `translateY(${shift}px)`
							: undefined}
			>
				{@render item(value, reorderHandleProps(index, value.id))}
			</div>
		{:else}
			{@render empty()}
		{/each}
	</div>
</nav>

<p aria-live="polite" class="sr-only">{announcement}</p>
