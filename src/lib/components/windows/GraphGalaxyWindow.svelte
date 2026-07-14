<script lang="ts">
  import { getContext, onMount, tick } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { getSelectedDocumentIds } from "$lib/utils/documentSelection";
  import type { AppState } from "$lib/state.svelte";
  import type { WindowInstanceProps } from "./index";

  type VisualNode = {
    id: string;
    label: string;
    kind: "document" | "chunk" | "entity";
    entityKind?: string;
    documentId?: string;
    chunkId?: string;
    score?: number;
    preview?: string;
  };

  type VisualEdge = {
    source: string;
    target: string;
    relation: string;
    weight: number;
    evidence?: string;
  };

  type GraphResponse = {
    query: string;
    mode: "overview" | "query";
    summary: string;
    stats: { nodes: number; edges: number };
    nodes: VisualNode[];
    edges: VisualEdge[];
  };

  type GalaxyNode = VisualNode & {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sr: number;
    depth: number;
  };

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const appState = getContext<AppState>("appState");
  const MIN_ZOOM = 0.18;
  const DEFAULT_ZOOM = 0.82;
  const WIDE_ZOOM = 0.42;
  const MAX_ZOOM = 3;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let graph = $state<GraphResponse | null>(null);
  let nodes = $state<GalaxyNode[]>([]);
  let query = $state("");
  let loading = $state(false);
  let status = $state("");
  let selectedNode = $state<GalaxyNode | null>(null);
  let yaw = $state(0.42);
  let pitch = $state(-0.18);
  let zoom = $state(DEFAULT_ZOOM);
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;

  const nodeById = $derived(new Map(nodes.map((node) => [node.id, node])));

  onMount(() => {
    query = appState.lastQuery;
    loadGraph(appState.lastQuery).catch(() => {});
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (canvas?.parentElement) resizeObserver.observe(canvas.parentElement);
    frame = requestAnimationFrame(draw);

    function handleVisualize(event: Event) {
      const nextQuery = (event as CustomEvent<{ query?: string }>).detail?.query ?? appState.lastQuery;
      query = nextQuery;
      loadGraph(nextQuery).catch(() => {});
    }

    window.addEventListener("dk:visualize-graph", handleVisualize);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("dk:visualize-graph", handleVisualize);
    };
  });

  async function loadGraph(nextQuery = query) {
    loading = true;
    status = "";
    selectedNode = null;
    try {
      const params = new URLSearchParams({
        topK: String(appState.ragTopK || 8),
      });
      for (const documentId of getSelectedDocumentIds()) {
        params.append("documentIds", documentId);
      }
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const response = await fetch(`/knowledge-graph/visual?${params}`);
      if (!response.ok) throw new Error(`Graph request failed (${response.status})`);
      graph = (await response.json()) as GraphResponse;
      nodes = layoutNodes(graph.nodes);
      await tick();
      resizeCanvas();
      status = graph.summary;
    } catch (error) {
      status = error instanceof Error ? error.message : "Unable to load graph galaxy.";
    } finally {
      loading = false;
    }
  }

  function visualizeLastQuery() {
    query = appState.lastQuery;
    loadGraph(query).catch(() => {});
  }

  function resetCamera() {
    yaw = 0.42;
    pitch = -0.18;
    zoom = DEFAULT_ZOOM;
  }

  function setWideView() {
    zoom = WIDE_ZOOM;
    pitch = -0.12;
  }

  function layoutNodes(input: VisualNode[]): GalaxyNode[] {
    const byKind = {
      document: input.filter((node) => node.kind === "document"),
      entity: input.filter((node) => node.kind === "entity"),
      chunk: input.filter((node) => node.kind === "chunk"),
    };
    const ordered = [...byKind.document, ...byKind.entity, ...byKind.chunk];
    return ordered.map((node, index) => {
      const h = hash(node.id);
      const kindRadius = node.kind === "document" ? 125 : node.kind === "entity" ? 210 : 285;
      const angle = index * 2.399963 + (h % 100) / 100;
      const vertical = ((h % 200) / 100 - 1) * kindRadius * 0.62;
      const ring = kindRadius + ((h >> 8) % 70);
      return {
        ...node,
        x: Math.cos(angle) * ring,
        y: vertical,
        z: Math.sin(angle) * ring,
        sx: 0,
        sy: 0,
        sr: 4,
        depth: 0,
      };
    });
  }

  function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  function draw() {
    frame = requestAnimationFrame(draw);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const projected = projectNodes(width, height);
    drawBackdrop(context, width, height);
    drawEdges(context, projected);
    drawNodes(context, projected);
  }

  function projectNodes(width: number, height: number) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const centerX = width / 2;
    const centerY = height / 2;
    const camera = 620;

    for (const node of nodes) {
      const rx = node.x * cy - node.z * sy;
      const rz = node.x * sy + node.z * cy;
      const ry = node.y * cp - rz * sp;
      const rzz = node.y * sp + rz * cp;
      const perspective = camera / (camera + rzz);
      const baseSize = node.kind === "document" ? 9 : node.kind === "entity" ? 6.5 : 4.8;
      node.sx = centerX + rx * perspective * zoom;
      node.sy = centerY + ry * perspective * zoom;
      node.sr = Math.max(2.5, baseSize * perspective * zoom);
      node.depth = rzz;
    }

    return [...nodes].sort((left, right) => left.depth - right.depth);
  }

  function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    gradient.addColorStop(0, "rgba(72, 104, 180, 0.24)");
    gradient.addColorStop(0.45, "rgba(16, 23, 44, 0.28)");
    gradient.addColorStop(1, "rgba(2, 7, 18, 0.72)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = 0.25;
    for (let i = 0; i < 80; i += 1) {
      const x = (hash(`star-${i}`) % Math.max(1, Math.floor(width)));
      const y = (hash(`star-y-${i}`) % Math.max(1, Math.floor(height)));
      context.fillStyle = "rgba(210, 226, 255, 0.7)";
      context.fillRect(x, y, 1, 1);
    }
    context.restore();
  }

  function drawEdges(context: CanvasRenderingContext2D, projected: GalaxyNode[]) {
    const visible = new Set(projected.map((node) => node.id));
    for (const edge of graph?.edges ?? []) {
      if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const alpha = Math.min(0.48, 0.1 + edge.weight * 0.1);
      context.strokeStyle = relationColor(edge.relation, alpha);
      context.lineWidth = Math.max(0.6, Math.min(2.2, edge.weight * 0.65));
      context.beginPath();
      context.moveTo(source.sx, source.sy);
      context.lineTo(target.sx, target.sy);
      context.stroke();
    }
  }

  function drawNodes(context: CanvasRenderingContext2D, projected: GalaxyNode[]) {
    for (const node of projected) {
      const selected = selectedNode?.id === node.id;
      const color = nodeColor(node);
      context.save();
      context.shadowColor = color;
      context.shadowBlur = selected ? 26 : 14;
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.sx, node.sy, selected ? node.sr + 3 : node.sr, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = selected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.28)";
      context.lineWidth = selected ? 2 : 0.8;
      context.stroke();

      if (selected || node.kind === "document") {
        context.font = selected ? "700 12px system-ui" : "600 11px system-ui";
        context.fillStyle = "rgba(238, 244, 255, 0.95)";
        context.fillText(trimLabel(node.label, selected ? 34 : 22), node.sx + node.sr + 5, node.sy - node.sr - 4);
      }
      context.restore();
    }
  }

  function handlePointerDown(event: PointerEvent) {
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    yaw += dx * 0.006;
    pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * 0.006));
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent) {
    dragging = false;
    canvas?.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY > 0 ? 0.88 : 1.1)));
  }

  function handleClick(event: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: GalaxyNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const distance = Math.hypot(node.sx - x, node.sy - y);
      if (distance < Math.max(14, node.sr + 8) && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    selectedNode = best;
  }

  function nodeColor(node: VisualNode) {
    if (node.kind === "document") return "rgb(125, 211, 252)";
    if (node.kind === "chunk") return "rgb(167, 139, 250)";
    if (node.entityKind === "condition") return "rgb(248, 113, 113)";
    if (node.entityKind === "treatment") return "rgb(52, 211, 153)";
    if (node.entityKind === "organization") return "rgb(251, 191, 36)";
    if (node.entityKind === "protocol") return "rgb(96, 165, 250)";
    return "rgb(226, 232, 240)";
  }

  function relationColor(relation: string, alpha: number) {
    if (relation === "CONTAINS") return `rgba(125, 211, 252, ${alpha})`;
    if (relation === "MENTIONS") return `rgba(167, 139, 250, ${alpha})`;
    if (relation === "HAS_STEP" || relation === "TREATS") return `rgba(52, 211, 153, ${alpha})`;
    return `rgba(226, 232, 240, ${alpha})`;
  }

  function hash(value: string) {
    let out = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      out ^= value.charCodeAt(i);
      out = Math.imul(out, 16777619);
    }
    return out >>> 0;
  }

  function trimLabel(value: string, limit: number) {
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  }
</script>

<BaseWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Knowledge graph galaxy"
>
  <div class="galaxy-window">
    <div class="toolbar">
      <input
        class="input"
        bind:value={query}
        placeholder="Use last query or type a graph focus..."
        aria-label="Graph focus query"
        onkeydown={(event) => event.key === "Enter" && loadGraph(query)}
      />
      <button class="btn btn-sm" type="button" onclick={visualizeLastQuery} title="Visualize latest chat query">
        <Icon name="auto_awesome" size={15} />
        Last query
      </button>
      <button class="btn btn-sm" type="button" onclick={() => loadGraph(query)} disabled={loading}>
        {loading ? "Loading..." : "Visualize"}
      </button>
      <button class="btn btn-sm" type="button" onclick={setWideView}>Wide view</button>
      <button class="btn btn-sm" type="button" onclick={resetCamera}>Reset</button>
    </div>

    <div class="meta-row">
      <span>{status || "Drag to orbit. Scroll to zoom. Click a node to inspect."}</span>
      {#if graph}
        <span>{graph.nodes.length} visible nodes · {graph.edges.length} visible edges · {graph.stats.nodes} total graph nodes · {Math.round(zoom * 100)}% zoom</span>
      {/if}
    </div>

    <div class="stage">
      <div class="usaf-mark" aria-label="USAF visual marker">
        <img src="/usaf-symbol.png" alt="" aria-hidden="true" />
        <span class="usaf-side-text">USAF</span>
      </div>

      <canvas
        bind:this={canvas}
        aria-label="Interactive knowledge graph galaxy"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        onclick={handleClick}
        onwheel={handleWheel}
      ></canvas>

      <div class="legend" aria-label="Graph legend">
        <span><i class="doc"></i>Document</span>
        <span><i class="chunk"></i>Chunk</span>
        <span><i class="entity"></i>Entity</span>
      </div>

      {#if selectedNode}
        <aside class="inspector">
          <div class="kind">{selectedNode.kind}{selectedNode.entityKind ? ` · ${selectedNode.entityKind}` : ""}</div>
          <h3>{selectedNode.label}</h3>
          {#if selectedNode.score}
            <p class="score">Score: {selectedNode.score.toFixed(4)}</p>
          {/if}
          {#if selectedNode.preview}
            <p>{selectedNode.preview}</p>
          {/if}
          {#if selectedNode.documentId}
            <p class="mono">document: {selectedNode.documentId.slice(0, 14)}…</p>
          {/if}
          {#if selectedNode.chunkId}
            <p class="mono">chunk: {selectedNode.chunkId.slice(0, 14)}…</p>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
</BaseWindow>

<style>
  :global(.miniwin[data-window-id="graph-galaxy-window"]:not(.collapsed)) {
    min-height: 480px;
  }

  :global(.miniwin[data-window-id="graph-galaxy-window"] .content-inner) {
    height: 100%;
    overflow: hidden;
  }

  .galaxy-window {
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
  }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto auto;
    gap: 6px;
    align-items: center;
  }

  .toolbar .btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--muted);
    font-size: 12px;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: #050816;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  canvas:active {
    cursor: grabbing;
  }

  .usaf-mark {
    position: absolute;
    z-index: 4;
    bottom: 6px;
    left: 50%;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
    transform: translateX(-50%);
  }

  .usaf-mark img {
    display: block;
    width: clamp(42px, 5vw, 68px);
    height: auto;
    opacity: 0.5;
    filter:
      drop-shadow(0 0 7px rgb(125 211 252 / 24%))
      drop-shadow(0 0 16px rgb(37 99 235 / 16%));
  }

  .usaf-side-text {
    color: rgb(224 242 254 / 62%);
    font-size: clamp(12px, 1.25vw, 17px);
    font-weight: 900;
    letter-spacing: 0.32em;
    padding-left: 0.32em;
    text-shadow: 0 0 10px rgb(96 165 250 / 32%);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .legend {
    position: absolute;
    z-index: 3;
    top: 10px;
    left: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
    border-radius: 999px;
    background: rgb(3 7 18 / 68%);
    color: rgb(226 232 240 / 92%);
    font-size: 11px;
    backdrop-filter: blur(8px);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .legend i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    box-shadow: 0 0 10px currentColor;
  }

  .legend .doc { background: rgb(125 211 252); color: rgb(125 211 252); }
  .legend .chunk { background: rgb(167 139 250); color: rgb(167 139 250); }
  .legend .entity { background: rgb(226 232 240); color: rgb(226 232 240); }

  .inspector {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: grid;
    width: min(320px, calc(100% - 24px));
    max-height: 48%;
    overflow: auto;
    gap: 6px;
    padding: 12px;
    border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--border));
    border-radius: 14px;
    background: rgb(8 13 28 / 84%);
    color: rgb(238 244 255);
    box-shadow: 0 18px 44px rgb(0 0 0 / 32%);
    backdrop-filter: blur(10px);
  }

  .inspector h3,
  .inspector p {
    margin: 0;
  }

  .inspector h3 {
    font-size: 14px;
  }

  .inspector p {
    color: rgb(218 226 244 / 86%);
    font-size: 12px;
    line-height: 1.35;
  }

  .kind,
  .score,
  .mono {
    color: rgb(148 163 184);
    font-size: 11px;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  }

  @media (max-width: 760px) {
    .toolbar {
      grid-template-columns: 1fr 1fr;
    }

    .toolbar .input {
      grid-column: 1 / -1;
    }

    .meta-row {
      flex-direction: column;
      gap: 3px;
    }
  }
</style>
