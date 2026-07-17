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
  let selectedEdge = $state<VisualEdge | null>(null);
  let yaw = $state(0.42);
  let pitch = $state(-0.18);
  let zoom = $state(DEFAULT_ZOOM);
  let panX = $state(0);
  let panY = $state(0);
  let showEntityNodes = $state(true);
  let dragging = false;
  let panning = false;
  let lastPointer = { x: 0, y: 0 };
  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;

  const nodeById = $derived(new Map(nodes.map((node) => [node.id, node])));
  const renderedNodes = $derived(showEntityNodes ? nodes : nodes.filter((node) => node.kind !== "entity"));
  const renderedNodeIds = $derived(new Set(renderedNodes.map((node) => node.id)));
  const renderedEdges = $derived((graph?.edges ?? []).filter((edge) => renderedNodeIds.has(edge.source) && renderedNodeIds.has(edge.target)));
  const selectedNodeEdges = $derived(
    selectedNode
      ? renderedEdges.filter((edge) => edge.source === selectedNode?.id || edge.target === selectedNode?.id)
      : [],
  );

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
    selectedEdge = null;
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
    panX = 0;
    panY = 0;
  }

  function setWideView() {
    zoom = WIDE_ZOOM;
    pitch = -0.12;
    panX = 0;
    panY = 0;
  }

  function toggleEntityNodes() {
    showEntityNodes = !showEntityNodes;
    if (!showEntityNodes && selectedNode?.kind === "entity") selectedNode = null;
    if (!showEntityNodes && selectedEdge && (!renderedNodeIds.has(selectedEdge.source) || !renderedNodeIds.has(selectedEdge.target))) {
      selectedEdge = null;
    }
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

    for (const node of renderedNodes) {
      const rx = node.x * cy - node.z * sy;
      const rz = node.x * sy + node.z * cy;
      const ry = node.y * cp - rz * sp;
      const rzz = node.y * sp + rz * cp;
      const perspective = camera / (camera + rzz);
      const baseSize = node.kind === "document" ? 9 : node.kind === "entity" ? 6.5 : 4.8;
      node.sx = centerX + panX + rx * perspective * zoom;
      node.sy = centerY + panY + ry * perspective * zoom;
      node.sr = Math.max(2.5, baseSize * perspective * zoom);
      node.depth = rzz;
    }

    return [...renderedNodes].sort((left, right) => left.depth - right.depth);
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
    for (const edge of renderedEdges) {
      if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const selected = isSelectedEdge(edge);
      const alpha = selected ? 0.92 : Math.min(0.48, 0.1 + edge.weight * 0.1);
      context.strokeStyle = relationColor(edge.relation, alpha);
      context.lineWidth = selected ? 3.2 : Math.max(0.6, Math.min(2.2, edge.weight * 0.65));
      if (selected) {
        context.shadowColor = "rgba(125, 211, 252, 0.75)";
        context.shadowBlur = 12;
      }
      context.beginPath();
      context.moveTo(source.sx, source.sy);
      context.lineTo(target.sx, target.sy);
      context.stroke();
      context.shadowBlur = 0;

      if (selected) {
        const midX = (source.sx + target.sx) / 2;
        const midY = (source.sy + target.sy) / 2;
        context.font = "700 11px system-ui";
        context.fillStyle = "rgba(238, 244, 255, 0.96)";
        context.fillText(displayRelation(edge.relation), midX + 7, midY - 7);
      }
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
    panning = event.ctrlKey || event.altKey || event.button === 1 || event.button === 2;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    if (panning || event.ctrlKey || event.altKey) {
      panX += dx;
      panY += dy;
    } else {
      yaw += dx * 0.006;
      pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * 0.006));
    }
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent) {
    dragging = false;
    panning = false;
    canvas?.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY > 0 ? 0.94 : 1.06)));
  }

  function handleClick(event: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: GalaxyNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestEdge: VisualEdge | null = null;
    let bestEdgeDistance = Number.POSITIVE_INFINITY;

    for (const node of renderedNodes) {
      const distance = Math.hypot(node.sx - x, node.sy - y);
      if (distance < Math.max(14, node.sr + 8) && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }

    for (const edge of renderedEdges) {
      const distance = edgeDistanceToPoint(edge, x, y);
      if (distance !== null && distance < 8 && distance < bestEdgeDistance) {
        bestEdge = edge;
        bestEdgeDistance = distance;
      }
    }

    if (best && bestDistance <= Math.max(12, bestEdgeDistance - 2)) {
      selectedNode = best;
      selectedEdge = null;
      return;
    }

    selectedNode = null;
    selectedEdge = bestEdge;
  }

  function edgeDistanceToPoint(edge: VisualEdge, x: number, y: number): number | null {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return null;

    const dx = target.sx - source.sx;
    const dy = target.sy - source.sy;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return null;

    const position = Math.max(0, Math.min(1, ((x - source.sx) * dx + (y - source.sy) * dy) / lengthSquared));
    const closestX = source.sx + position * dx;
    const closestY = source.sy + position * dy;
    return Math.hypot(x - closestX, y - closestY);
  }

  function focusEdge(edge: VisualEdge) {
    selectedNode = null;
    selectedEdge = edge;

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!canvas || !source || !target) return;

    const rect = canvas.getBoundingClientRect();
    const midX = (source.sx + target.sx) / 2;
    const midY = (source.sy + target.sy) / 2;
    panX += rect.width / 2 - midX;
    panY += rect.height / 2 - midY;
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

  function isSelectedEdge(edge: VisualEdge) {
    return Boolean(
      selectedEdge
      && selectedEdge.source === edge.source
      && selectedEdge.target === edge.target
      && selectedEdge.relation === edge.relation
    );
  }

  function nodeLabel(nodeId: string) {
    return nodeById.get(nodeId)?.label ?? nodeId.replace(/^[^:]+:/, "");
  }

  function edgePartnerLabel(edge: VisualEdge, nodeId: string) {
    return nodeLabel(edge.source === nodeId ? edge.target : edge.source);
  }

  function displayRelation(relation: string) {
    return relation
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    </div>

    <div class="meta-row">
      <span>{status || "Drag to orbit. Ctrl/Alt+drag to pan. Scroll to zoom. Click a node or line to inspect."}</span>
      {#if graph}
        <span>{renderedNodes.length} visible nodes · {renderedEdges.length} visible edges · {graph.stats.nodes} total graph nodes · {Math.round(zoom * 100)}% zoom</span>
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

      <div class="zoom-panel" aria-label="Galaxy zoom controls">
        <button type="button" onclick={() => zoom = Math.min(MAX_ZOOM, zoom * 1.07)} aria-label="Zoom in">+</button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step="0.01"
          bind:value={zoom}
          aria-label="Galaxy zoom"
        />
        <button type="button" onclick={() => zoom = Math.max(MIN_ZOOM, zoom * 0.94)} aria-label="Zoom out">−</button>
        <button type="button" onclick={resetCamera} title="Reset view" aria-label="Reset view">
          <Icon name="restart_alt" size={14} />
        </button>
      </div>

      <details class="layer-menu">
        <summary>
          <Icon name="tune" size={14} />
          Layers
        </summary>
        <label>
          <input
            type="checkbox"
            checked={showEntityNodes}
            onchange={toggleEntityNodes}
          />
          <span>White entity nodes</span>
        </label>
      </details>

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
          {#if selectedNodeEdges.length}
            <div class="relationship-menu">
              <div class="kind">connected relationships</div>
              {#each selectedNodeEdges.slice(0, 12) as edge}
                <button type="button" onclick={() => focusEdge(edge)}>
                  <span>{displayRelation(edge.relation)}</span>
                  <small>{edgePartnerLabel(edge, selectedNode.id)}</small>
                </button>
              {/each}
            </div>
          {/if}
        </aside>
      {:else if selectedEdge}
        <aside class="inspector edge-inspector">
          <div class="kind">relationship line</div>
          <h3>{displayRelation(selectedEdge.relation)}</h3>
          <div class="edge-path">
            <span>{nodeLabel(selectedEdge.source)}</span>
            <strong>→</strong>
            <span>{nodeLabel(selectedEdge.target)}</span>
          </div>
          <p class="score">Weight: {selectedEdge.weight.toFixed(2)}</p>
          {#if selectedEdge.evidence}
            <p>{selectedEdge.evidence}</p>
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
    grid-template-columns: minmax(0, 1fr) auto auto;
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

  .zoom-panel {
    position: absolute;
    z-index: 4;
    right: 10px;
    top: 58px;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 8px 6px;
    border: 1px solid color-mix(in oklab, var(--border) 72%, transparent);
    border-radius: 999px;
    background: rgb(3 7 18 / 68%);
    box-shadow: 0 14px 34px rgb(0 0 0 / 24%);
    backdrop-filter: blur(8px);
  }

  .zoom-panel button {
    display: inline-grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border: 1px solid rgb(148 163 184 / 28%);
    border-radius: 999px;
    background: rgb(15 23 42 / 72%);
    color: rgb(226 232 240 / 94%);
    cursor: pointer;
    font-size: 15px;
    font-weight: 800;
    line-height: 1;
  }

  .zoom-panel button:hover {
    border-color: rgb(125 211 252 / 52%);
    background: rgb(30 41 59 / 86%);
  }

  .zoom-panel input[type="range"] {
    width: 118px;
    height: 26px;
    accent-color: rgb(125 211 252);
    cursor: pointer;
    transform: rotate(-90deg);
    transform-origin: center;
    margin: 46px -46px;
  }

  .layer-menu {
    position: absolute;
    z-index: 5;
    top: 10px;
    right: 10px;
    color: rgb(226 232 240 / 94%);
    font-size: 11px;
  }

  .layer-menu summary {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
    border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
    border-radius: 999px;
    background: rgb(3 7 18 / 72%);
    box-shadow: 0 10px 26px rgb(0 0 0 / 22%);
    cursor: pointer;
    list-style: none;
    backdrop-filter: blur(8px);
    user-select: none;
  }

  .layer-menu summary::-webkit-details-marker {
    display: none;
  }

  .layer-menu[open] summary {
    border-color: rgb(125 211 252 / 42%);
    background: rgb(15 23 42 / 86%);
  }

  .layer-menu label {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    min-width: 170px;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid color-mix(in oklab, var(--border) 75%, transparent);
    border-radius: 12px;
    background: rgb(8 13 28 / 92%);
    box-shadow: 0 18px 44px rgb(0 0 0 / 32%);
    backdrop-filter: blur(10px);
  }

  .layer-menu input {
    accent-color: rgb(125 211 252);
  }

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

  .edge-path {
    display: grid;
    gap: 4px;
    color: rgb(226 232 240 / 94%);
    font-size: 12px;
    line-height: 1.25;
  }

  .edge-path strong {
    color: rgb(125 211 252);
    font-size: 14px;
  }

  .relationship-menu {
    display: grid;
    gap: 6px;
    padding-top: 4px;
  }

  .relationship-menu button {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 7px 8px;
    border: 1px solid rgb(148 163 184 / 22%);
    border-radius: 10px;
    background: rgb(15 23 42 / 54%);
    color: rgb(226 232 240 / 94%);
    cursor: pointer;
    text-align: left;
  }

  .relationship-menu button:hover {
    border-color: rgb(125 211 252 / 46%);
    background: rgb(30 41 59 / 72%);
  }

  .relationship-menu button span {
    font-size: 11px;
    font-weight: 800;
  }

  .relationship-menu button small {
    overflow: hidden;
    color: rgb(203 213 225 / 76%);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
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
