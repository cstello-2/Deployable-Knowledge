<script lang="ts">
  import type {
    AgentOutput,
    AgentTraceItem,
    StoredToolCall,
  } from "$lib/agentTypes";
  import { legacyToolCallTrace } from "$lib/agentTrace";

  let {
    trace = [],
    toolCalls = [],
    outputs = [],
  }: {
    trace?: AgentTraceItem[];
    toolCalls?: StoredToolCall[];
    outputs?: AgentOutput[];
  } = $props();

  let displayTrace = $derived(
    trace.length
      ? trace
      : toolCalls.map((call, index) => legacyToolCallTrace(call, index)),
  );
  let sourceOutputs = $derived(
    outputs.filter(
      (output): output is Extract<AgentOutput, { type: "source" }> =>
        output.type === "source",
    ),
  );
  let otherOutputs = $derived(outputs.filter((output) => output.type !== "source"));

  function imageSource(output: Extract<AgentOutput, { type: "image" }>) {
    return `data:${output.data.mimeType};base64,${output.data.base64}`;
  }

  function formatData(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      return String(value);
    }
  }

  function sourceHref(output: Extract<AgentOutput, { type: "source" }>) {
    if (output.data.documentId) {
      const page = output.data.pageIndex === undefined ? 1 : output.data.pageIndex + 1;
      return `/document-files/${encodeURIComponent(output.data.documentId)}#page=${page}`;
    }
    return output.data.url;
  }

</script>

{#if displayTrace.length}
  <div class="agent-trace" aria-label="Agent activity">
    {#each displayTrace as item (`${item.kind}-${item.id}`)}
      <details class:error={item.isError || item.status === "error"}>
        <summary>
          <span>{item.title}{item.isError || item.status === "error" ? " (failed)" : ""}</span>
          <span class="disclosure-arrow" aria-hidden="true"></span>
        </summary>
        <pre>{item.output}</pre>
      </details>
    {/each}
  </div>
{/if}

{#if outputs.length}
  <section class="context-outputs" aria-label="Tool context">
    {#if sourceOutputs.length}
      <ol class="source-list">
        {#each sourceOutputs as output (`source-${output.id}`)}
          {@const href = sourceHref(output)}
          <li>
            {#if href}
              <a
                class="source-link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title="Open source chunk"
              >
                {#if output.data.title}
                  <span class="source-title">{output.data.title}</span>
                {/if}
                {#if output.data.title && output.data.description}<span aria-hidden="true"> — </span>{/if}
                {#if output.data.description}
                  <span class="source-copy">{output.data.description}</span>
                {:else if !output.data.title}
                  <span class="source-copy">Document source</span>
                {/if}
              </a>
            {:else}
              <span class="source-link">
                {#if output.data.title}
                  <span class="source-title">{output.data.title}</span>
                {/if}
                {#if output.data.title && output.data.description}<span aria-hidden="true"> — </span>{/if}
                {#if output.data.description}
                  <span class="source-copy">{output.data.description}</span>
                {:else if !output.data.title}
                  <span class="source-copy">Document source</span>
                {/if}
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
    {#if otherOutputs.length}
      <ul class="context-list">
        {#each otherOutputs as output (`${output.type}-${output.id}`)}
          <li class:image={output.type === "image"}>
          {#if output.type === "image"}
            <img src={imageSource(output)} alt={output.data.alt} loading="lazy" />
          {:else if output.type === "text"}
            <div class="text-output">
              {#if output.label}<span class="output-type">{output.label}</span>{/if}
              <span>{output.data}</span>
            </div>
          {:else}
            <div class="data-output">
              {#if output.label}<span class="output-type">{output.label}</span>{/if}
              <pre>{formatData(output.data)}</pre>
            </div>
          {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .agent-trace {
    display: grid;
    gap: 2px;
    margin: 0 0 9px;
    color: var(--muted);
    font-size: 11px;
  }

  .agent-trace details {
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--border) 82%, transparent);
    border-radius: 7px;
    background: color-mix(
      in oklab,
      hsl(var(--h) var(--sat) var(--l-panel)) 88%,
      var(--accent) 12%
    );
  }

  .agent-trace details.error {
    color: var(--danger-bor, #d65c5c);
  }

  .agent-trace summary {
    display: flex;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 7px;
    border-radius: 6px;
    background: color-mix(
      in oklab,
      hsl(var(--h) var(--sat) var(--l-panel)) 90%,
      var(--accent) 10%
    );
    cursor: pointer;
    list-style: none;
    transition: background 120ms ease, color 120ms ease;
  }

  .agent-trace summary::-webkit-details-marker {
    display: none;
  }

  .agent-trace summary:hover {
    background: color-mix(
      in oklab,
      hsl(var(--h) var(--sat) var(--l-panel)) 80%,
      var(--accent) 20%
    );
    color: var(--text);
  }

  .agent-trace details[open] summary {
    border-bottom: 1px solid color-mix(in oklab, var(--border) 82%, transparent);
    border-radius: 6px 6px 0 0;
  }

  .agent-trace summary > span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .disclosure-arrow {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg) translate(-1px, -1px);
    transition: transform 140ms ease;
  }

  .agent-trace details[open] .disclosure-arrow {
    transform: rotate(225deg) translate(-1px, -1px);
  }

  .agent-trace pre {
    max-width: 100%;
    max-height: 320px;
    box-sizing: border-box;
    margin: 0;
    padding: 8px 10px;
    overflow: auto;
    border: 0;
    border-radius: 0 0 6px 6px;
    background: color-mix(
      in oklab,
      hsl(var(--h) var(--sat) var(--l-bg)) 92%,
      var(--accent) 8%
    );
    color: var(--text);
    font-size: 10px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .context-outputs {
    display: grid;
    gap: 5px;
    margin-top: 9px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in oklab, var(--border) 72%, transparent);
  }

  .context-list {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source-list {
    display: grid;
    gap: 1px;
    margin: 0;
    padding-left: 22px;
    font-size: 11px;
    line-height: 1.4;
  }

  .source-list > li {
    min-width: 0;
    padding-left: 1px;
    color: var(--muted);
  }

  .source-link {
    display: block;
    min-width: 0;
    margin-left: -3px;
    padding: 3px;
    border-radius: 3px;
    color: var(--muted);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  a.source-link:hover,
  a.source-link:focus-visible {
    background: color-mix(in oklab, var(--text) 7%, transparent);
    color: var(--text);
    outline: none;
  }

  .source-title {
    color: var(--text);
    font-weight: 600;
  }

  .context-list > li {
    min-width: 0;
    padding: 6px 8px;
    border-left: 2px solid var(--border);
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .context-list > li.image {
    width: fit-content;
    max-width: 100%;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .text-output,
  .data-output {
    display: flex;
    min-width: 0;
    gap: 6px;
    align-items: baseline;
    font-size: 11px;
    line-height: 1.35;
  }

  .source-copy {
    color: inherit;
  }

  .output-type {
    flex: 0 0 auto;
    color: var(--muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  a {
    flex: 0 0 auto;
  }

  img {
    display: block;
    width: auto;
    max-width: min(100%, 340px);
    max-height: 240px;
    object-fit: contain;
    border-radius: 4px;
    background: white;
  }

  pre {
    max-width: 100%;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
  }
</style>
