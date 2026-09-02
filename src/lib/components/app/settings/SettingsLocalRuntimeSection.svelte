<script lang="ts">
	import Cpu from '@lucide/svelte/icons/cpu';
	import { onMount } from 'svelte';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { LOCAL_MODEL_PROVIDER_ID } from '$lib/constants';
	import { localModelsStore, settingsStore } from '$lib/stores';
	import type { LlamaGpuMode } from '$lib/types';

	const GPU_LABELS: Record<LlamaGpuMode, string> = {
		auto: 'Auto (recommended)',
		cpu: 'CPU only',
		cuda: 'CUDA (NVIDIA)',
		vulkan: 'Vulkan'
	};

	const isLlamaCpp = $derived(settingsStore.config.provider === LOCAL_MODEL_PROVIDER_ID);
	const deviceOptions = $derived.by(() => {
		const supported = localModelsStore.status?.gpu.supported ?? [];
		const options: LlamaGpuMode[] = ['auto', ...supported, 'cpu'];
		if (!options.includes(settingsStore.config.gpuMode)) options.push(settingsStore.config.gpuMode);
		return options;
	});

	function selectGpuMode(value: string): void {
		settingsStore.updateConfig({ gpuMode: value as LlamaGpuMode });
	}

	onMount(() => {
		if (!localModelsStore.status) void localModelsStore.refresh().catch(() => undefined);
	});
</script>

{#if isLlamaCpp}
	<section class="grid gap-4" aria-labelledby="local-runtime-heading">
		<header class="flex items-center gap-3">
			<Cpu class="size-5 shrink-0" />
			<div class="grid gap-1">
				<h2 id="local-runtime-heading" class="text-base font-semibold">Local runtime</h2>
				<p class="m-0 text-xs text-muted-foreground">
					Compute device for models that run in-app. The context window is fitted automatically to
					available memory, up to the model maximum.
				</p>
			</div>
		</header>
		<div class="grid gap-2">
			<Label for="settings-gpu-mode">Compute device</Label>
			<Select.Root type="single" value={settingsStore.config.gpuMode} onValueChange={selectGpuMode}>
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
	</section>
{/if}
