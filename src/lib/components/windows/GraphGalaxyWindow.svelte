<script lang="ts">
  import { onMount, tick } from "svelte";
  import { WorkspaceWindow } from "$lib/components/app/workspace/WorkspaceWindow";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import { documentsStore, notebooksStore, settingsStore, workspaceStore } from "$lib/stores";
  import type { WindowInstanceProps } from "$lib/components/app/workspace/window-registry";

  type VisualNode = {
    id: string;
    label: string;
    kind: "document" | "chunk" | "entity";
    entityKind?: string;
    documentId?: string;
    chunkId?: string;
    score?: number;
    retrievalScore?: number;
    hybridScore?: number;
    graphScore?: number;
    preview?: string;
    content?: string;
    sourceTitle?: string;
    pageIndex?: number;
    chunkIndex?: number;
    chunkType?: string;
    matchedEntities?: string[];
    relations?: string[];
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

  type StoredGraphState = {
    query: string;
    documentIds: string[];
    chunkIds?: string[];
    topK: number;
    graph: GraphResponse;
    selectedNodeId: string | null;
    inspectorExpanded: boolean;
    yaw: number;
    pitch: number;
    zoom: number;
    panX?: number;
    panY?: number;
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

  type CameraAnimation = {
    nodeId: string;
    startedAt: number;
    duration: number;
    fromYaw: number;
    toYaw: number;
    fromPitch: number;
    toPitch: number;
    fromZoom: number;
    toZoom: number;
    fromPanX: number;
    toPanX: number;
    fromPanY: number;
    toPanY: number;
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

  const graphEnabled = $derived(settingsStore.config.retrievalMode === "graph");
  const GRAPH_DISABLED_MESSAGE =
    "Graph Galaxy is available only when KG search is enabled in Settings.";
  const MIN_ZOOM = 0.18;
  const DEFAULT_ZOOM = 0.82;
  const MAX_ZOOM = 3;
  const FOCUS_ZOOM = 1.18;
  const FOCUS_DURATION_MS = 650;
  const NO_MATCH_STATUS = "This assistant result does not have a matching node in the current Galaxy.";

  let canvas = $state<HTMLCanvasElement | null>(null);
  let graph = $state<GraphResponse | null>(null);
  let nodes = $state<GalaxyNode[]>([]);
  let query = $state("");
  let loading = $state(false);
  let status = $state("");
  let selectedNode = $state<GalaxyNode | null>(null);
  let selectedEdge = $state<VisualEdge | null>(null);
  let inspectorExpanded = $state(false);
  let savingChunkId = $state<string | null>(null);
  let pendingChunk = $state<VisualNode | null>(null);
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
  let graphAbortController: AbortController | null = null;
  let latestRequestId = -1;
  let loadGeneration = 0;
  let activeSessionId = $state<string | null>(null);
  let activeDocumentIds: string[] = [];
  let activeChunkIds: string[] = [];
  let activeTopK = settingsStore.config.ragTopK || 8;
  let cameraAnimation: CameraAnimation | null = null;
  let pendingFocusRequest: { chunkId?: string; nodeId?: string } | null = null;

  const nodeById = $derived(new Map(nodes.map((node) => [node.id, node])));
  const renderedNodes = $derived(showEntityNodes ? nodes : nodes.filter((node) => node.kind !== "entity"));
  const renderedNodeIds = $derived(new Set(renderedNodes.map((node) => node.id)));
  const renderedEdges = $derived((graph?.edges ?? []).filter((edge) => renderedNodeIds.has(edge.source) && renderedNodeIds.has(edge.target)));
  const selectedNodeEdges = $derived(
    selectedNode
      ? renderedEdges.filter((edge) => edge.source === selectedNode?.id || edge.target === selectedNode?.id)
      : [],
  );

  $effect(() => {
    if (settingsStore.config.retrievalMode === "graph") return;
    graphAbortController?.abort();
    loading = false;
  });

  onMount(() => {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (canvas?.parentElement) resizeObserver.observe(canvas.parentElement);
    frame = requestAnimationFrame(draw);

    function handleVisualize(event: Event) {
      if (!graphEnabled) return;
      const detail = (event as CustomEvent<{
        query?: string;
        documentIds?: string[];
        chunkIds?: string[];
        requestId?: number;
        sessionId?: string;
        topK?: number;
        phase?: "loading" | "ready" | "error";
      }>).detail;
      const nextQuery = detail?.query?.trim() ?? "";
      const requestId = Math.max(
        detail?.requestId ?? 0,
        latestRequestId + 1,
      );

      latestRequestId = requestId;
      activeSessionId = detail?.sessionId ?? activeSessionId;
      activeDocumentIds = [...(detail?.documentIds ?? [])];
      activeChunkIds = [...(detail?.chunkIds ?? [])];
      activeTopK = detail?.topK ?? settingsStore.config.ragTopK ?? 8;
      query = nextQuery;
      if (detail?.phase === "loading") {
        beginGraphQuery(nextQuery);
        return;
      }
      if (detail?.phase === "error") {
        graphAbortController?.abort();
        loading = false;
        status = `Unable to refresh the Galaxy for “${nextQuery}”.`;
        return;
      }
      loadGraph(
        nextQuery,
        detail?.documentIds ?? [],
        detail?.chunkIds ?? [],
        requestId,
      ).catch(() => {});
    }

    function handleRestoreQuery(event: Event) {
      if (!graphEnabled) return;
      const detail = (event as CustomEvent<{
        sessionId: string;
        query: string;
        documentIds: string[];
        chunkIds?: string[];
        requestId: number;
        topK?: number;
      }>).detail;
      if (!detail?.sessionId || detail.requestId < latestRequestId) return;
      latestRequestId = detail.requestId;
      activeSessionId = detail.sessionId;
      activeDocumentIds = [...detail.documentIds];
      activeChunkIds = [...(detail.chunkIds ?? [])];
      activeTopK = detail.topK ?? settingsStore.config.ragTopK ?? 8;
      const stored = readGraphSnapshot(detail.sessionId);
      if (stored && stored.query === detail.query) {
        graphAbortController?.abort();
        activeDocumentIds = [...(stored.documentIds ?? detail.documentIds)];
        activeChunkIds = [...(stored.chunkIds ?? detail.chunkIds ?? [])];
        activeTopK = stored.topK ?? detail.topK ?? settingsStore.config.ragTopK ?? 8;
        query = stored.query;
        graph = stored.graph;
        nodes = layoutNodes(stored.graph.nodes);
        selectedNode = nodes.find((node) => node.id === stored.selectedNodeId) ?? null;
        inspectorExpanded = Boolean(selectedNode && stored.inspectorExpanded);
        yaw = stored.yaw;
        pitch = stored.pitch;
        zoom = stored.zoom;
        panX = stored.panX ?? 0;
        panY = stored.panY ?? 0;
        status = stored.graph.summary;
        loading = false;
        emitChunkSelection();
        void tick().then(resizeCanvas);
        return;
      }

      loadGraph(
        detail.query,
        detail.documentIds,
        detail.chunkIds ?? [],
        detail.requestId,
      ).catch(() => {});
    }

    function handleFocusChunk(event: Event) {
      if (!graphEnabled) return;
      const detail = (event as CustomEvent<{ chunkId?: string; nodeId?: string }>).detail ?? {};
      if (!detail.chunkId && !detail.nodeId) return;
      pendingFocusRequest = detail;
      focusMatchingNode(detail);
    }

    function handleSaveExternalChunk(event: Event) {
      if (!graphEnabled) return;
      const detail = (event as CustomEvent<{ chunk?: VisualNode; query?: string }>).detail;
      if (!detail?.chunk?.chunkId) return;
      if (detail.query?.trim()) query = detail.query.trim();
      void openSaveChunkDialogFor(detail.chunk);
    }

    function handleClearGraph(event: Event) {
      const requestedId =
        (event as CustomEvent<{ requestId?: number }>).detail?.requestId ?? 0;
      const requestId = Math.max(requestedId, latestRequestId + 1);
      latestRequestId = requestId;
      graphAbortController?.abort();
      loadGeneration += 1;
      graph = null;
      nodes = [];
      query = "";
      activeChunkIds = [];
      loading = false;
      status = "";
      selectedNode = null;
      selectedEdge = null;
      inspectorExpanded = false;
      cameraAnimation = null;
      pendingFocusRequest = null;
      panX = 0;
      panY = 0;
      savingChunkId = null;
      emitChunkSelection();
    }

    window.addEventListener("dk:visualize-graph", handleVisualize);
    window.addEventListener("dk:clear-graph", handleClearGraph);
    window.addEventListener("dk:restore-query-graph", handleRestoreQuery);
    window.addEventListener("dk:focus-galaxy-chunk", handleFocusChunk);
    window.addEventListener("dk:save-result-chunk", handleSaveExternalChunk);
    return () => {
      cancelAnimationFrame(frame);
      graphAbortController?.abort();
      resizeObserver?.disconnect();
      window.removeEventListener("dk:visualize-graph", handleVisualize);
      window.removeEventListener("dk:clear-graph", handleClearGraph);
      window.removeEventListener("dk:restore-query-graph", handleRestoreQuery);
      window.removeEventListener("dk:focus-galaxy-chunk", handleFocusChunk);
      window.removeEventListener("dk:save-result-chunk", handleSaveExternalChunk);
    };
  });

  function beginGraphQuery(nextQuery: string) {
    graphAbortController?.abort();
    loadGeneration += 1;
    loading = true;
    graph = null;
    nodes = [];
    selectedNode = null;
    selectedEdge = null;
    inspectorExpanded = false;
    cameraAnimation = null;
    pendingFocusRequest = null;
    panX = 0;
    panY = 0;
    savingChunkId = null;
    status = `Building or updating the graph for “${nextQuery}”…`;
  }

  async function loadGraph(
    nextQuery: string,
    documentIds: string[],
    chunkIds: string[],
    requestId: number,
  ) {
    if (!graphEnabled) return;
    graphAbortController?.abort();
    const controller = new AbortController();
    graphAbortController = controller;
    const generation = ++loadGeneration;
    loading = true;
    status = "";
    selectedNode = null;
    selectedEdge = null;
    inspectorExpanded = false;
    cameraAnimation = null;
    try {
      const params = new URLSearchParams({
        topK: String(activeTopK),
      });
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      for (const documentId of documentIds) params.append("documentIds", documentId);
      for (const chunkId of chunkIds) params.append("chunkIds", chunkId);
      const response = await fetch(`/knowledge-graph/visual?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await graphRequestError(response));
      const nextGraph = (await response.json()) as GraphResponse;
      if (controller.signal.aborted || generation !== loadGeneration || requestId !== latestRequestId) {
        return;
      }
      graph = nextGraph;
      nodes = layoutNodes(nextGraph.nodes);
      await tick();
      resizeCanvas();
      status = nextGraph.summary;
      if (pendingFocusRequest) focusMatchingNode(pendingFocusRequest);
      persistGraphSnapshot();
    } catch (error) {
      if (controller.signal.aborted || generation !== loadGeneration || requestId !== latestRequestId) {
        return;
      }
      graph = null;
      nodes = [];
      status = error instanceof Error ? error.message : "Unable to load graph galaxy.";
    } finally {
      if (generation === loadGeneration && requestId === latestRequestId) loading = false;
    }
  }

  async function visualizeManualQuery(nextQuery = query) {
    if (!graphEnabled) return;
    const focus = nextQuery.trim() || settingsStore.lastQuery.trim();
    query = focus;
    activeSessionId = activeSessionId ?? null;
    // Re-read the current selection on every manual visualization. An empty
    // selection is intentionally sent as an empty array, which the server
    // interprets as the complete document collection.
    activeDocumentIds = [...documentsStore.selectedIds];
    activeChunkIds = [];
    activeTopK = settingsStore.config.ragTopK || activeTopK || 8;
    const requestId = ++latestRequestId;
    beginGraphQuery(focus);
    await loadGraph(focus, activeDocumentIds, activeChunkIds, requestId);
  }

  function visualizeLastQuery() {
    void visualizeManualQuery(settingsStore.lastQuery);
  }

  function handleQueryKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void visualizeManualQuery(query);
  }

  async function graphRequestError(response: Response): Promise<string> {
    try {
      const body = await response.json() as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim()) return body.message;
    } catch {
      // Fall back to the HTTP status when the response is not JSON.
    }
    return `Graph request failed (${response.status})`;
  }

  function resetCamera() {
    cameraAnimation = null;
    yaw = 0.42;
    pitch = -0.18;
    zoom = DEFAULT_ZOOM;
    panX = 0;
    panY = 0;
    persistGraphSnapshot();
  }

  function toggleEntityNodes() {
    showEntityNodes = !showEntityNodes;
    if (!showEntityNodes && selectedNode?.kind === "entity") selectedNode = null;
    if (!showEntityNodes && selectedEdge && (!renderedNodeIds.has(selectedEdge.source) || !renderedNodeIds.has(selectedEdge.target))) {
      selectedEdge = null;
    }
    persistGraphSnapshot();
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

  function draw(timestamp = performance.now()) {
    frame = requestAnimationFrame(draw);
    if (!canvas) return;
    updateCameraAnimation(timestamp);
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
    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;
    const camera = 620;

    for (const node of renderedNodes) {
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

    return [...renderedNodes].sort((left, right) => left.depth - right.depth);
  }

  function focusMatchingNode(request: { chunkId?: string; nodeId?: string }) {
    const matchingNode =
      (request.nodeId ? nodes.find((node) => node.id === request.nodeId) : null) ??
      (request.chunkId
        ? nodes.find((node) => node.kind === "chunk" && node.chunkId === request.chunkId)
        : null);

    if (!matchingNode) {
      if (!graph) return;
      pendingFocusRequest = null;
      status = NO_MATCH_STATUS;
      emitFocusResult(request, false);
      return;
    }

    pendingFocusRequest = null;
    if (status === NO_MATCH_STATUS) status = graph?.summary ?? "";
    selectedNode = matchingNode;
    selectedEdge = null;
    inspectorExpanded = matchingNode.kind === "chunk";
    emitChunkSelection();
    emitFocusResult(request, true);
    focusCameraOnNode(matchingNode);
    persistGraphSnapshot();
  }

  function focusCameraOnNode(node: GalaxyNode) {
    if (!canvas) return;
    const width = canvas.getBoundingClientRect().width;
    const horizontalRadius = Math.hypot(node.x, node.z);
    const alignedYaw = Math.atan2(node.x, node.z);
    const targetYaw = yaw + shortestAngle(alignedYaw - yaw);
    const targetPitch = Math.atan2(node.y, Math.max(1, horizontalRadius));
    const targetZoom = FOCUS_ZOOM;
    const targetPanX = -Math.min(240, Math.max(64, width * 0.24));
    const targetPanY = 0;

    if (cameraAnimation?.nodeId === node.id) return;
    const alreadyFocused =
      selectedNode?.id === node.id &&
      Math.abs(shortestAngle(targetYaw - yaw)) < 0.025 &&
      Math.abs(targetPitch - pitch) < 0.025 &&
      Math.abs(targetZoom - zoom) < 0.04 &&
      Math.abs(targetPanX - panX) < 8 &&
      Math.abs(targetPanY - panY) < 8;
    if (alreadyFocused) {
      persistGraphSnapshot();
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      yaw = targetYaw;
      pitch = targetPitch;
      zoom = targetZoom;
      panX = targetPanX;
      panY = targetPanY;
      persistGraphSnapshot();
      return;
    }

    cameraAnimation = {
      nodeId: node.id,
      startedAt: performance.now(),
      duration: FOCUS_DURATION_MS,
      fromYaw: yaw,
      toYaw: targetYaw,
      fromPitch: pitch,
      toPitch: targetPitch,
      fromZoom: zoom,
      toZoom: targetZoom,
      fromPanX: panX,
      toPanX: targetPanX,
      fromPanY: panY,
      toPanY: targetPanY,
    };
  }

  function updateCameraAnimation(timestamp: number) {
    const animation = cameraAnimation;
    if (!animation) return;
    const progress = Math.min(1, Math.max(0, (timestamp - animation.startedAt) / animation.duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    yaw = lerp(animation.fromYaw, animation.toYaw, eased);
    pitch = lerp(animation.fromPitch, animation.toPitch, eased);
    zoom = lerp(animation.fromZoom, animation.toZoom, eased);
    panX = lerp(animation.fromPanX, animation.toPanX, eased);
    panY = lerp(animation.fromPanY, animation.toPanY, eased);
    if (progress < 1) return;
    cameraAnimation = null;
    persistGraphSnapshot();
  }

  function emitFocusResult(request: { chunkId?: string; nodeId?: string }, found: boolean) {
    window.dispatchEvent(new CustomEvent("dk:galaxy-focus-result", {
      detail: {
        sessionId: activeSessionId,
        chunkId: request.chunkId ?? null,
        nodeId: request.nodeId ?? null,
        found,
      },
    }));
  }

  function shortestAngle(angle: number) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function lerp(start: number, end: number, amount: number) {
    return start + (end - start) * amount;
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
    cameraAnimation = null;
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
    persistGraphSnapshot();
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    cameraAnimation = null;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY > 0 ? 0.94 : 1.06)));
    persistGraphSnapshot();
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
      if (best.id !== selectedNode?.id) inspectorExpanded = false;
      selectedNode = best;
      selectedEdge = null;
      cameraAnimation = null;
      emitChunkSelection();
      persistGraphSnapshot();
      return;
    }

    selectedNode = null;
    selectedEdge = bestEdge;
    cameraAnimation = null;
    emitChunkSelection();
    persistGraphSnapshot();
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
    inspectorExpanded = false;
    cameraAnimation = null;

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!canvas || !source || !target) return;

    const rect = canvas.getBoundingClientRect();
    const midX = (source.sx + target.sx) / 2;
    const midY = (source.sy + target.sy) / 2;
    panX += rect.width / 2 - midX;
    panY += rect.height / 2 - midY;
    emitChunkSelection();
    persistGraphSnapshot();
  }

  function toggleInspectorExpanded() {
    if (selectedNode?.kind !== "chunk") return;
    inspectorExpanded = !inspectorExpanded;
    persistGraphSnapshot();
  }

  function emitChunkSelection() {
    window.dispatchEvent(new CustomEvent("dk:galaxy-chunk-selection", {
      detail: {
        sessionId: activeSessionId,
        chunkId: selectedNode?.kind === "chunk" ? selectedNode.chunkId ?? null : null,
      },
    }));
  }

  function closeGraphGalaxy() {
    selectedNode = null;
    inspectorExpanded = false;
    cameraAnimation = null;
    pendingFocusRequest = null;
    emitChunkSelection();
    persistGraphSnapshot();
    onClose();
  }

  function graphStorageKey(sessionId: string) {
    return `dk:query-graph:${sessionId}`;
  }

  function readGraphSnapshot(sessionId: string): StoredGraphState | null {
    try {
      const raw = localStorage.getItem(graphStorageKey(sessionId));
      return raw ? JSON.parse(raw) as StoredGraphState : null;
    } catch {
      return null;
    }
  }

  function persistGraphSnapshot() {
    if (!activeSessionId || !graph || typeof localStorage === "undefined") return;
    const snapshot: StoredGraphState = {
      query,
      documentIds: [...activeDocumentIds],
      chunkIds: [...activeChunkIds],
      topK: activeTopK,
      graph,
      selectedNodeId: selectedNode?.id ?? null,
      inspectorExpanded,
      yaw,
      pitch,
      zoom,
      panX,
      panY,
    };
    try {
      localStorage.setItem(graphStorageKey(activeSessionId), JSON.stringify(snapshot));
    } catch {
      // Graph restoration remains available through deterministic rebuilding.
    }
  }

  function chunkSaveKey(node: VisualNode) {
    return node.chunkId || node.id;
  }

  async function openSaveChunkDialog() {
    const node = selectedNode;
    if (node?.kind !== "chunk") return;
    await openSaveChunkDialogFor(node);
  }

  async function openSaveChunkDialogFor(node: VisualNode) {
    pendingChunk = node;
    const saveKey = node.chunkId;
    if (!saveKey) throw new Error("This graph chunk has no stored source ID.");
    if (savingChunkId) return;

    savingChunkId = saveKey;
    try {
      const notebookTitle = await notebooksStore.saveChunk(saveKey);
      workspaceStore.showWindow("notebook-window");
      await tick();
      window.dispatchEvent(new CustomEvent("notebook-sources:refresh"));
      showToast(`Chunk added to ${notebookTitle}`);
      pendingChunk = null;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("The chunk could not be saved.");
    } finally {
      savingChunkId = null;
    }
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

<WorkspaceWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  onClose={closeGraphGalaxy}
  contentLabel="Knowledge graph galaxy"
  contentClass="h-full overflow-hidden"
>
  <div class="galaxy-window" class:locked={!graphEnabled}>
    <div class="toolbar">
      <input
        class="input"
        bind:value={query}
        placeholder="Use last query or type a graph focus..."
        aria-label="Graph focus query"
        disabled={!graphEnabled}
        onkeydown={handleQueryKeydown}
      />
      <button
        class="btn btn-sm"
        type="button"
        onclick={visualizeLastQuery}
        disabled={!graphEnabled}
        title={graphEnabled
          ? "Visualize latest chat query"
          : "Enable KG search in Settings to use Graph Galaxy"}
      >
        <Icon name="auto_awesome" size={15} />
        Last query
      </button>
      <button
        class="btn btn-sm"
        type="button"
        onclick={() => void visualizeManualQuery(query)}
        disabled={!graphEnabled || loading}
        title={graphEnabled
          ? "Visualize the graph"
          : "Enable KG search in Settings to use Graph Galaxy"}
      >
        {loading ? "Loading..." : "Visualize"}
      </button>
    </div>

    <div class="meta-row">
      <span>{graphEnabled
        ? status || "Drag to orbit. Ctrl/Alt+drag to pan. Scroll to zoom. Click a node or line to inspect."
        : GRAPH_DISABLED_MESSAGE}</span>
      {#if graphEnabled && graph}
        <span>{renderedNodes.length} visible nodes · {renderedEdges.length} visible edges · {graph.stats.nodes} total graph nodes · {Math.round(zoom * 100)}% zoom</span>
      {/if}
    </div>

    <div class="stage">
      {#if !graphEnabled}
        <div class="graph-disabled-overlay" role="status">
          <Icon name="lock" size={24} />
          <strong>Graph Galaxy requires KG search</strong>
          <span>Open Settings and select KG to enable visualization.</span>
        </div>
      {/if}
      <div class="usaf-mark" aria-label="USAF visual marker">
        <img src="/usaf-symbol.svg" alt="" aria-hidden="true" />
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
        <aside
          class="inspector"
          class:expanded={selectedNode.kind === "chunk" && inspectorExpanded}
        >
          <div class="inspector-header">
            <div class="kind">{selectedNode.kind}{selectedNode.entityKind ? ` · ${selectedNode.entityKind}` : ""}</div>
            {#if selectedNode.kind === "chunk"}
              <div class="inspector-actions">
                {#if inspectorExpanded}
                  <button
                    class="btn btn-sm inspector-toggle"
                    type="button"
                    disabled={!selectedNode.chunkId ||
                      savingChunkId === chunkSaveKey(selectedNode)}
                    onclick={openSaveChunkDialog}
                  >
                    <Icon name="bookmark_add" size={14} />
                    Save Chunk
                  </button>
                {/if}
                <button
                  class="btn btn-sm inspector-toggle"
                  type="button"
                  aria-expanded={inspectorExpanded}
                  onclick={toggleInspectorExpanded}
                >
                  <Icon name={inspectorExpanded ? "close_fullscreen" : "open_in_full"} size={14} />
                  {inspectorExpanded ? "Collapse details" : "Expand details"}
                </button>
              </div>
            {/if}
          </div>
          <h3>{selectedNode.label}</h3>

          {#if selectedNode.kind === "chunk" && inspectorExpanded}
            <dl class="chunk-metadata">
              <div>
                <dt>Retrieval score</dt>
                <dd>{selectedNode.retrievalScore == null ? "Graph expansion" : selectedNode.retrievalScore.toFixed(4)}</dd>
              </div>
              {#if selectedNode.hybridScore != null}
                <div><dt>Hybrid score</dt><dd>{selectedNode.hybridScore.toFixed(4)}</dd></div>
              {/if}
              {#if selectedNode.graphScore != null}
                <div><dt>Graph score</dt><dd>{selectedNode.graphScore.toFixed(4)}</dd></div>
              {/if}
              {#if selectedNode.sourceTitle}
                <div><dt>Document</dt><dd>{selectedNode.sourceTitle}</dd></div>
              {/if}
              {#if selectedNode.pageIndex != null}
                <div><dt>Page</dt><dd>{selectedNode.pageIndex + 1}</dd></div>
              {/if}
              {#if selectedNode.chunkIndex != null}
                <div><dt>Chunk index</dt><dd>{selectedNode.chunkIndex}</dd></div>
              {/if}
              {#if selectedNode.chunkType}
                <div><dt>Chunk type</dt><dd>{selectedNode.chunkType}</dd></div>
              {/if}
            </dl>

            {#if selectedNode.matchedEntities?.length}
              <section class="chunk-detail-section">
                <h4>Matched entities</h4>
                <p>{selectedNode.matchedEntities.join(", ")}</p>
              </section>
            {/if}
            {#if selectedNode.relations?.length}
              <section class="chunk-detail-section">
                <h4>Relations</h4>
                <p>{selectedNode.relations.join(", ")}</p>
              </section>
            {/if}

            <section class="chunk-detail-section chunk-content">
              <h4>Chunk content</h4>
              <p>{selectedNode.content || selectedNode.preview || "No chunk text is available."}</p>
            </section>

            {#if selectedNode.documentId}
              <div class="identifier-row">
                <span>Document ID</span>
                <code>{selectedNode.documentId}</code>
              </div>
            {/if}
            {#if selectedNode.chunkId}
              <div class="identifier-row">
                <span>Chunk ID</span>
                <code>{selectedNode.chunkId}</code>
              </div>
            {/if}
          {:else}
            {#if selectedNode.score != null}
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
</WorkspaceWindow>

<style>
  :global(.miniwin[data-window-id="graph-galaxy-window"]:not(.collapsed)) {
    min-height: 480px;
  }

  :global(.miniwin[data-window-id="graph-galaxy-window"] .content-inner) {
    height: 100%;
    overflow: hidden;
  }

  .galaxy-window {
    position: relative;
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

  .toolbar :disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .locked .stage > :not(.graph-disabled-overlay) {
    opacity: 0.22;
    filter: grayscale(1);
    pointer-events: none;
  }

  .graph-disabled-overlay {
    position: absolute;
    z-index: 20;
    inset: 0;
    display: flex;
    padding: 24px;
    background: rgb(5 8 22 / 78%);
    color: rgb(226 232 240);
    text-align: center;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
  }

  .graph-disabled-overlay strong {
    font-size: 14px;
  }

  .graph-disabled-overlay span {
    max-width: 320px;
    color: rgb(148 163 184);
    font-size: 12px;
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
    top: 58px;
    right: 10px;
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
    margin: 46px -46px;
    accent-color: rgb(125 211 252);
    cursor: pointer;
    transform: rotate(-90deg);
    transform-origin: center;
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
    z-index: 5;
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

  .inspector.expanded {
    top: 12px;
    width: min(680px, max(320px, 52%));
    max-width: calc(100% - 24px);
    max-height: calc(100% - 24px);
    gap: 10px;
    background: rgb(8 13 28 / 94%);
  }

  .inspector-header {
    position: sticky;
    z-index: 1;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 4px;
    background: linear-gradient(rgb(8 13 28 / 98%) 75%, transparent);
  }

  .inspector-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
  }

  .inspector-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
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

  .chunk-metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  .chunk-metadata div {
    min-width: 0;
    padding: 8px;
    border: 1px solid rgb(148 163 184 / 18%);
    border-radius: 9px;
    background: rgb(15 23 42 / 62%);
  }

  .chunk-metadata dt,
  .identifier-row span,
  .chunk-detail-section h4 {
    margin: 0 0 3px;
    color: rgb(148 163 184);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chunk-metadata dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: rgb(238 244 255);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .chunk-detail-section {
    display: grid;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid rgb(148 163 184 / 18%);
  }

  .chunk-detail-section h4 {
    margin: 0;
  }

  .chunk-content p {
    white-space: pre-wrap;
  }

  .identifier-row {
    display: grid;
    gap: 3px;
  }

  .identifier-row code {
    overflow-wrap: anywhere;
    color: rgb(203 213 225);
    font-size: 11px;
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

  .relationship-menu {
    display: grid;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid rgb(148 163 184 / 18%);
  }

  .relationship-menu button {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid rgb(148 163 184 / 20%);
    border-radius: 10px;
    background: rgb(15 23 42 / 58%);
    color: rgb(226 232 240 / 94%);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .relationship-menu button:hover {
    border-color: rgb(125 211 252 / 46%);
    background: rgb(30 41 59 / 78%);
  }

  .relationship-menu span,
  .relationship-menu small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .relationship-menu span {
    font-size: 12px;
    font-weight: 700;
  }

  .relationship-menu small {
    color: rgb(148 163 184);
    font-size: 11px;
  }

  .edge-inspector {
    border-color: rgb(125 211 252 / 46%);
  }

  .edge-path {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid rgb(148 163 184 / 18%);
    border-radius: 10px;
    background: rgb(15 23 42 / 56%);
    color: rgb(226 232 240 / 92%);
    font-size: 12px;
  }

  .edge-path span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edge-path strong {
    color: rgb(125 211 252);
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

    .chunk-metadata {
      grid-template-columns: 1fr;
    }

  }
</style>
