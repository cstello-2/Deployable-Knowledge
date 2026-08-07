<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Slider } from '$lib/components/ui/slider';
	import {
		CONTEXT_SIZE_MIN,
		CONTEXT_SIZE_STEP,
		CONTEXT_WINDOW_TOKENS_MAX,
		LOCAL_MODEL_PROVIDER_ID
	} from '$lib/constants';
	import { localModelsStore, settingsStore } from '$lib/stores';
	import type { LlamaGpuMode } from '$lib/types';

	const GPU_LABELS: Record<LlamaGpuMode, string> = {
		auto: 'Auto (recommended)',
		cpu: 'CPU only',
		cuda: 'CUDA (NVIDIA)',
		vulkan: 'Vulkan'
	};

	const OLLAMA_CONTEXT_MAX = 131_072;

	const isLlamaCpp = $derived(settingsStore.config.provider === LOCAL_MODEL_PROVIDER_ID);
	const isOllama = $derived(settingsStore.config.provider === 'ollama');
	const showSection = $derived(isLlamaCpp || isOllama);
	const activeModel = $derived(
		localModelsStore.status?.models.find(
			({ fileName }) => fileName === settingsStore.config.model
		) ?? null
	);
	const maxContext = $derived(
		Math.max(
			CONTEXT_SIZE_MIN,
			isLlamaCpp ? (activeModel?.trainContextSize ?? CONTEXT_WINDOW_TOKENS_MAX) : OLLAMA_CONTEXT_MAX
		)
	);
	const deviceOptions = $derived.by(() => {
		const supported = localModelsStore.status?.gpu.supported ?? [];
		const options: LlamaGpuMode[] = ['auto', ...supported, 'cpu'];
		if (!options.includes(settingsStore.config.gpuMode)) options.push(settingsStore.config.gpuMode);
		return options;
	});
	const automatic = $derived(settingsStore.config.contextSize === null);
	const displayContextSize = $derived(
		Math.min(Math.max(settingsStore.config.contextSize ?? maxContext, CONTEXT_SIZE_MIN), maxContext)
	);

	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function queueSave(): void {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			void settingsStore.saveActive();
		}, 500);
	}

	function setContextSize(value: number | null): void {
		settingsStore.updateConfig({ contextSize: value });
		queueSave();
	}

	function clampContextSize(value: number): number {
		return Math.min(maxContext, Math.max(CONTEXT_SIZE_MIN, Math.floor(value)));
	}

	function numberValue(event: Event, fallback: number): number {
		const value =
			event.currentTarget instanceof HTMLInputElement
				? event.currentTarget.valueAsNumber
				: Number.NaN;
		return Number.isFinite(value) ? value : fallback;
	}

	function selectGpuMode(value: string): void {
		settingsStore.updateConfig({ gpuMode: value as LlamaGpuMode });
		queueSave();
	}

	onMount(() => {
		if (!localModelsStore.status) void localModelsStore.refresh().catch(() => undefined);
	});

	onDestroy(() => {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
			void settingsStore.saveActive();
		}
	});
</script>

{#if showSection}
	<section class="grid gap-4">
		<h2 class="m-0 text-sm font-semibold">Local runtime</h2>
		<div class="grid gap-2">
			<Label for="settings-context-size">Context window (tokens)</Label>
			<div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
				<Checkbox
					checked={automatic}
					id="settings-context-auto"
					onCheckedChange={(checked) =>
						setContextSize(checked === true ? null : clampContextSize(maxContext))}
				/>
				<Label for="settings-context-auto" class="text-sm font-normal">
					{isLlamaCpp
						? 'Automatic — fit to memory, up to the model maximum'
						: "Automatic — use Ollama's default context length"}
				</Label>
			</div>
			{#if !automatic}
				<div class="flex items-center gap-3">
					<Slider
						class="min-w-0 flex-1"
						min={CONTEXT_SIZE_MIN}
						max={maxContext}
						step={CONTEXT_SIZE_STEP}
						value={displayContextSize}
						onValueChange={(value) => setContextSize(clampContextSize(value))}
					/>
					<Input
						id="settings-context-size"
						class="w-28 shrink-0"
						type="number"
						min={CONTEXT_SIZE_MIN}
						max={maxContext}
						step={CONTEXT_SIZE_STEP}
						value={displayContextSize}
						oninput={(event) =>
							setContextSize(clampContextSize(numberValue(event, displayContextSize)))}
					/>
				</div>
			{/if}
			<p class="m-0 text-xs text-muted-foreground">
				{#if !isLlamaCpp}
					Applied as num_ctx. Ollama defaults to roughly 4,096 tokens, which truncates long
					tool-calling conversations — raise this for multi-step search.
				{:else if activeModel?.trainContextSize}
					Model maximum: {maxContext.toLocaleString()} tokens
				{:else}
					Download the model to detect its maximum context (using {CONTEXT_WINDOW_TOKENS_MAX.toLocaleString()}
					fallback)
				{/if}
			</p>
		</div>
		{#if isLlamaCpp}
			<div class="grid gap-2">
				<Label for="settings-gpu-mode">Compute device</Label>
				<Select.Root
					type="single"
					value={settingsStore.config.gpuMode}
					onValueChange={selectGpuMode}
				>
					<Select.Trigger id="settings-gpu-mode" class="w-full">
						<span class="truncate">{GPU_LABELS[settingsStore.config.gpuMode]}</span>
					</Select.Trigger>
					<Select.Content>
						{#each deviceOptions as option (option)}
							<Select.Item value={option} label={GPU_LABELS[option]} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}
	</section>
{/if}
