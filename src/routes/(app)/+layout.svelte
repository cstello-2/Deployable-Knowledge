<script lang="ts">
  import "../../app.css";
  import { onMount, setContext } from "svelte";
  import "material-symbols/rounded.css";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import { ProgressPopup } from "$lib/components/popups";
  import ToastHost, {
    showToast,
  } from "$lib/components/utils/ToastHost.svelte";
  import type {
    EmbeddingModelInstallEvent,
    EmbeddingModelStatus,
  } from "$lib/requestTypes";
  import favicon from "$lib/assets/icon.svg";
  import { initWorkspaceStateStorage } from "$lib/utils/workspaceState";
  import { AppState } from "$lib/state.svelte";

  let { children } = $props();
  const appState = new AppState();
  setContext("appState", appState);

  let modelSetupOpen = $state(false);
  let modelSetupProgress = $state({
    percent: 0,
    label: "Preparing semantic search",
    message: "Downloading the embedding model.",
  });
  let modelSetupError = $state("");

  initWorkspaceStateStorage();

  onMount(() => {
    checkEmbeddingModel();
  });

  async function checkEmbeddingModel() {
    try {
      const response = await fetch("/setup");
      if (!response.ok) throw new Error("Could not check the embedding model");

      const status = (await response.json()) as EmbeddingModelStatus;
      if (!status.installed) await downloadEmbeddingModel();
    } catch (error) {
      showModelSetupError(error);
    }
  }

  async function downloadEmbeddingModel() {
    modelSetupOpen = true;
    modelSetupProgress = {
      percent: 0,
      label: "Preparing semantic search",
      message: "Downloading the embedding model.",
    };
    modelSetupError = "";

    try {
      const response = await fetch("/setup", { method: "POST" });
      if (!response.ok || !response.body) {
        throw new Error("Embedding model download could not be started");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ready = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) continue;

          const event = JSON.parse(line) as EmbeddingModelInstallEvent;

          if (event.status === "progress") {
            modelSetupProgress = {
              percent: event.progress,
              label: "Preparing semantic search",
              message: "Downloading and preparing semantic search.",
            };
          } else if (event.status === "ready") {
            ready = true;
          } else {
            throw new Error(event.message);
          }
        }

        if (done) break;
      }

      if (!ready) throw new Error("Embedding model setup did not complete");

      modelSetupOpen = false;
      showToast("Semantic search is ready");
    } catch (error) {
      showModelSetupError(error);
    }
  }

  function showModelSetupError(error: unknown) {
    modelSetupOpen = true;
    modelSetupError =
      error instanceof Error ? error.message : "Embedding model setup failed";
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  <AppHeader />
  <div class="app-content">
    {@render children()}
  </div>
  <ToastHost />
  <ProgressPopup
    open={modelSetupOpen}
    id="embedding-model-setup"
    title="Preparing semantic search"
    contentLabel="Embedding model setup progress"
    progress={modelSetupProgress}
    error={modelSetupError}
    errorTitle="Semantic search setup failed"
    errorDetail="You can continue without semantic search and retry later."
    onRetry={() => void downloadEmbeddingModel()}
    onClose={() => (modelSetupOpen = false)}
  />
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
