<script lang="ts">
  import "../app.css";
  import { onMount, setContext } from "svelte";
  import "material-symbols/rounded.css";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import favicon from "$lib/assets/favicon.svg";
  import { initLayoutPresetStorage } from "$lib/utils/layoutPresets";
  import { initWindowStateStorage } from "$lib/utils/windowState";
  import { createAppState } from "$lib/state.svelte";

  let { children } = $props();
  const appState = createAppState();
  setContext("appState", appState);

  onMount(() => {
    initWindowStateStorage();
    initLayoutPresetStorage();
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  <AppHeader />
  <div class="app-content">
    {@render children()}
  </div>
</div>

<style>
  .app-shell {
    display: flex;
    height: 100vh;
    min-height: 0;
    background: var(--bg);
    flex-direction: column;
  }

  .app-content {
    min-height: 0;
    flex: 1 1 auto;
  }
</style>
