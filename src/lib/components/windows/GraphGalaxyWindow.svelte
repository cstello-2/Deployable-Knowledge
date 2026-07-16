<script lang="ts">
  import { getContext, onMount, tick } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import type { AppState } from "$lib/state.svelte";
  import type { NotebookWithPages } from "$lib/server/database/schema";
  import { showWindow } from "$lib/utils/workspaceState";
  import type { WindowInstanceProps } from "./index";

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

  const appState = getContext<AppState>("appState");
  const MIN_ZOOM = 0.18;
  const DEFAULT_ZOOM = 0.82;
  const WIDE_ZOOM = 0.42;
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
  let inspectorExpanded = $state(false);
  let savingChunkId = $state<string | null>(null);
  let saveDialogOpen = $state(false);
  let saveDialogLoading = $state(false);
  let saveDialogError = $state("");
  let pendingChunk = $state<VisualNode | null>(null);
  let destinationNotebookId = $state("");
  let destinationPageId = $state("");
  let existingNotebookNewPageTitle = $state("");
  let newNotebookTitle = $state("");
  let newPageTitle = $state("");
  let yaw = $state(0.42);
  let pitch = $state(-0.18);
  let zoom = $state(DEFAULT_ZOOM);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let graphAbortController: AbortController | null = null;
  let latestRequestId = -1;
  let loadGeneration = 0;
  let activeSessionId = $state<string | null>(null);
  let activeDocumentIds: string[] = [];
  let activeTopK = appState.ragTopK || 8;
  let cameraAnimation: CameraAnimation | null = null;
  let pendingFocusRequest: { chunkId?: string; nodeId?: string } | null = null;

  const nodeById = $derived(new Map(nodes.map((node) => [node.id, node])));
  const destinationNotebook = $derived(
    appState.notebooks.find((notebook) => notebook.id === destinationNotebookId) ?? null,
  );
  const destinationPage = $derived(
    destinationNotebook?.pages.find((page) => page.id === destinationPageId) ?? null,
  );

  onMount(() => {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (canvas?.parentElement) resizeObserver.observe(canvas.parentElement);
    frame = requestAnimationFrame(draw);

    function handleVisualize(event: Event) {
      const detail = (event as CustomEvent<{
        query?: string;
        documentIds?: string[];
        requestId?: number;
        sessionId?: string;
        topK?: number;
        phase?: "loading" | "ready" | "error";
      }>).detail;
      const nextQuery = detail?.query?.trim() ?? "";
      const requestId = detail?.requestId ?? 0;
      if (requestId < latestRequestId) return;

      latestRequestId = requestId;
      activeSessionId = detail?.sessionId ?? activeSessionId;
      activeDocumentIds = [...(detail?.documentIds ?? [])];
      activeTopK = detail?.topK ?? appState.ragTopK ?? 8;
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
      loadGraph(nextQuery, detail?.documentIds ?? [], requestId).catch(() => {});
    }

    function handleRestoreQuery(event: Event) {
      const detail = (event as CustomEvent<{
        sessionId: string;
        query: string;
        documentIds: string[];
        requestId: number;
        topK?: number;
      }>).detail;
      if (!detail?.sessionId || detail.requestId < latestRequestId) return;
      latestRequestId = detail.requestId;
      activeSessionId = detail.sessionId;
      activeDocumentIds = [...detail.documentIds];
      activeTopK = detail.topK ?? appState.ragTopK ?? 8;
      closeSaveDialog();

      const stored = readGraphSnapshot(detail.sessionId);
      if (stored && stored.query === detail.query) {
        graphAbortController?.abort();
        activeDocumentIds = [...(stored.documentIds ?? detail.documentIds)];
        activeTopK = stored.topK ?? detail.topK ?? appState.ragTopK ?? 8;
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

      loadGraph(detail.query, detail.documentIds, detail.requestId).catch(() => {});
    }

    function handleFocusChunk(event: Event) {
      const detail = (event as CustomEvent<{ chunkId?: string; nodeId?: string }>).detail ?? {};
      if (!detail.chunkId && !detail.nodeId) return;
      pendingFocusRequest = detail;
      focusMatchingNode(detail);
    }

    function handleSaveExternalChunk(event: Event) {
      const detail = (event as CustomEvent<{ chunk?: VisualNode; query?: string }>).detail;
      if (!detail?.chunk?.chunkId) return;
      if (detail.query?.trim()) query = detail.query.trim();
      void openSaveChunkDialogFor(detail.chunk);
    }

    function handleClearGraph(event: Event) {
      const requestId = (event as CustomEvent<{ requestId?: number }>).detail?.requestId ?? 0;
      if (requestId < latestRequestId) return;
      latestRequestId = requestId;
      graphAbortController?.abort();
      loadGeneration += 1;
      graph = null;
      nodes = [];
      query = "";
      loading = false;
      status = "";
      selectedNode = null;
      inspectorExpanded = false;
      cameraAnimation = null;
      pendingFocusRequest = null;
      panX = 0;
      panY = 0;
      savingChunkId = null;
      closeSaveDialog();
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
    inspectorExpanded = false;
    cameraAnimation = null;
    pendingFocusRequest = null;
    panX = 0;
    panY = 0;
    savingChunkId = null;
    closeSaveDialog();
    status = `Building or updating the graph for “${nextQuery}”…`;
  }

  async function loadGraph(nextQuery: string, documentIds: string[], requestId: number) {
    graphAbortController?.abort();
    const controller = new AbortController();
    graphAbortController = controller;
    const generation = ++loadGeneration;
    loading = true;
    status = "";
    selectedNode = null;
    inspectorExpanded = false;
    cameraAnimation = null;
    try {
      const params = new URLSearchParams({
        topK: String(activeTopK),
      });
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      for (const documentId of documentIds) params.append("documentIds", documentId);
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

  function setWideView() {
    cameraAnimation = null;
    zoom = WIDE_ZOOM;
    pitch = -0.12;
    panX = 0;
    panY = 0;
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
    cameraAnimation = null;
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
    persistGraphSnapshot();
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    cameraAnimation = null;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY > 0 ? 0.88 : 1.1)));
    persistGraphSnapshot();
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
    if (best?.id !== selectedNode?.id) inspectorExpanded = false;
    selectedNode = best;
    cameraAnimation = null;
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

  function formatChunkNotebookEntry(node: VisualNode) {
    const scoreLines = [
      node.retrievalScore == null ? null : `Retrieval score: ${node.retrievalScore.toFixed(4)}`,
      node.hybridScore == null ? null : `Hybrid score: ${node.hybridScore.toFixed(4)}`,
      node.graphScore == null ? null : `Graph score: ${node.graphScore.toFixed(4)}`,
      node.score == null ? null : `Galaxy score: ${node.score.toFixed(4)}`,
    ].filter((line): line is string => Boolean(line));
    const metadata = [
      query ? `Query: ${query}` : null,
      node.sourceTitle ? `Document: ${node.sourceTitle}` : null,
      node.pageIndex == null ? null : `Page: ${node.pageIndex + 1}`,
      node.chunkIndex == null ? null : `Chunk index: ${node.chunkIndex}`,
      node.chunkType ? `Chunk type: ${node.chunkType}` : null,
      node.documentId ? `Document ID: ${node.documentId}` : null,
      node.chunkId ? `Chunk ID: ${node.chunkId}` : null,
      node.matchedEntities?.length ? `Matched entities: ${node.matchedEntities.join(", ")}` : null,
      node.relations?.length ? `Relations: ${node.relations.join(", ")}` : null,
      ...scoreLines,
    ].filter((line): line is string => Boolean(line));

    return [
      `[Knowledge Graph Chunk] ${node.label}`,
      ...metadata,
      "",
      node.content || node.preview || "No chunk text is available.",
    ].join("\n");
  }

  function applyNotebookState(data: {
    activeNotebookId: string | null;
    notebooks: NotebookWithPages[];
  }) {
    appState.notebooks = data.notebooks ?? [];
    appState.activeNotebookId = data.activeNotebookId ?? appState.notebooks[0]?.id ?? null;
    appState.activeNotebook =
      appState.notebooks.find((notebook) => notebook.id === appState.activeNotebookId) ??
      appState.notebooks[0] ??
      null;
    appState.activePage =
      appState.activeNotebook?.pages.find(
        (page) => page.id === appState.activeNotebook?.activePageId,
      ) ?? appState.activeNotebook?.pages[0] ?? null;
  }

  function chooseDestinationNotebook(notebookId: string, preferredPageId?: string | null) {
    destinationNotebookId = notebookId;
    const notebook = appState.notebooks.find((candidate) => candidate.id === notebookId);
    destinationPageId =
      notebook?.pages.find((page) => page.id === preferredPageId)?.id ??
      notebook?.pages.find((page) => page.id === notebook.activePageId)?.id ??
      notebook?.pages[0]?.id ??
      "";
  }

  async function loadSaveDestinations() {
    saveDialogLoading = true;
    saveDialogError = "";
    try {
      const response = await fetch("/notebooks");
      if (!response.ok) throw new Error("Notebook destinations could not be loaded.");
      const data = await response.json() as {
        activeNotebookId: string | null;
        notebooks: NotebookWithPages[];
      };
      applyNotebookState(data);
      const notebookId =
        data.notebooks.find((notebook) => notebook.id === data.activeNotebookId)?.id ??
        data.notebooks[0]?.id ??
        "";
      chooseDestinationNotebook(notebookId);
    } catch (error) {
      saveDialogError = error instanceof Error ? error.message : "Notebook destinations could not be loaded.";
    } finally {
      saveDialogLoading = false;
    }
  }

  async function openSaveChunkDialog() {
    const node = selectedNode;
    if (node?.kind !== "chunk") return;
    await openSaveChunkDialogFor(node);
  }

  async function openSaveChunkDialogFor(node: VisualNode) {
    pendingChunk = node;
    saveDialogOpen = true;
    saveDialogError = "";
    existingNotebookNewPageTitle = "";
    newNotebookTitle = "";
    newPageTitle = "";
    await loadSaveDestinations();
  }

  function closeSaveDialog() {
    if (savingChunkId) return;
    saveDialogOpen = false;
    saveDialogError = "";
    pendingChunk = null;
    existingNotebookNewPageTitle = "";
    newNotebookTitle = "";
    newPageTitle = "";
  }

  function notifyNotebookChanged() {
    window.dispatchEvent(new CustomEvent("dk:notebooks-updated"));
  }

  async function createPageInExistingNotebook() {
    const notebookId = destinationNotebookId;
    const pageTitle = existingNotebookNewPageTitle.trim();
    if (saveDialogLoading) return;
    if (!notebookId) {
      saveDialogError = "Choose a notebook before creating a page.";
      return;
    }
    if (!pageTitle) {
      saveDialogError = "Enter a page name.";
      return;
    }

    saveDialogLoading = true;
    saveDialogError = "";
    try {
      const response = await fetch(`/notebooks/${notebookId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pageTitle }),
      });
      const data = await response.json() as {
        message?: string;
        activeNotebookId: string | null;
        notebooks: NotebookWithPages[];
        createdPageId?: string;
      };
      if (!response.ok) throw new Error(data.message || "The page could not be created.");

      applyNotebookState(data);
      chooseDestinationNotebook(notebookId, data.createdPageId);
      existingNotebookNewPageTitle = "";
      notifyNotebookChanged();
      showToast("Page created and selected");
    } catch (error) {
      saveDialogError = error instanceof Error ? error.message : "The page could not be created.";
    } finally {
      saveDialogLoading = false;
    }
  }

  async function createDestination() {
    const notebookTitle = newNotebookTitle.trim();
    const pageTitle = newPageTitle.trim();
    if (saveDialogLoading) return;
    if (!notebookTitle || !pageTitle) {
      saveDialogError = "Enter both a notebook name and a page name.";
      return;
    }
    saveDialogLoading = true;
    saveDialogError = "";
    try {
      const response = await fetch("/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: notebookTitle, pageTitle }),
      });
      const data = await response.json() as {
        message?: string;
        activeNotebookId: string | null;
        notebooks: NotebookWithPages[];
        createdNotebookId?: string;
        createdPageId?: string;
      };
      if (!response.ok) throw new Error(data.message || "The destination could not be created.");
      applyNotebookState(data);
      chooseDestinationNotebook(
        data.createdNotebookId ?? data.activeNotebookId ?? "",
        data.createdPageId,
      );
      newNotebookTitle = "";
      newPageTitle = "";
      notifyNotebookChanged();
    } catch (error) {
      saveDialogError = error instanceof Error ? error.message : "The destination could not be created.";
    } finally {
      saveDialogLoading = false;
    }
  }

  async function saveChunkToDestination() {
    const node = pendingChunk;
    if (node?.kind !== "chunk" || !destinationNotebook || !destinationPage) return;
    const saveKey = chunkSaveKey(node);
    if (savingChunkId) return;

    savingChunkId = saveKey;
    saveDialogError = "";
    try {
      const response = await fetch(
        `/notebooks/${destinationNotebook.id}/pages/${destinationPage.id}/chunks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chunkId: saveKey,
            text: formatChunkNotebookEntry(node),
          }),
        },
      );
      const data = await response.json() as {
        message?: string;
        activeNotebookId: string | null;
        notebooks: NotebookWithPages[];
        duplicate?: boolean;
      };
      if (!response.ok) throw new Error(data.message || "The chunk could not be saved.");

      applyNotebookState(data);
      showWindow("notebook-window");
      await tick();
      notifyNotebookChanged();
      const destination = `${destinationNotebook.title} → ${destinationPage.title}`;
      showToast(data.duplicate ? `Chunk already exists in ${destination}` : `Chunk saved to ${destination}`);
      saveDialogOpen = false;
      pendingChunk = null;
    } catch (error) {
      saveDialogError = error instanceof Error ? error.message : "The chunk could not be saved.";
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
      <span class="toolbar-query" title={query}>
        {query ? `Query: ${query}` : "Ask a Knowledge Graph question in Chat to populate the Galaxy."}
      </span>
      <button class="btn btn-sm" type="button" onclick={setWideView}>Wide view</button>
      <button class="btn btn-sm" type="button" onclick={resetCamera}>Reset</button>
    </div>

    <div class="meta-row">
      <span>{status || "The Galaxy refreshes automatically after each graph question."}</span>
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
                    disabled={savingChunkId === chunkSaveKey(selectedNode)}
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
        </aside>
      {/if}
    </div>

    {#if saveDialogOpen}
      <div class="save-dialog-backdrop">
        <div
          class="save-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Save chunk destination"
        >
          <header class="save-dialog-header">
            <div>
              <div class="kind">Save Chunk</div>
              <h3>{pendingChunk?.label ?? "Selected chunk"}</h3>
            </div>
            <button
              class="icon-action"
              type="button"
              aria-label="Close save destination"
              disabled={Boolean(savingChunkId)}
              onclick={closeSaveDialog}
            >
              <Icon name="close" size={17} />
            </button>
          </header>

          {#if saveDialogLoading && !appState.notebooks.length}
            <div class="save-dialog-loading" role="status">Loading notebook destinations...</div>
          {:else}
            <div class="destination-choice-label">1. Save to an existing notebook and page</div>
            <div class="destination-grid">
              <label>
                <span>Notebook</span>
                <select
                  class="input"
                  aria-label="Destination notebook"
                  value={destinationNotebookId}
                  onchange={(event) => chooseDestinationNotebook(event.currentTarget.value)}
                >
                  {#each appState.notebooks as notebook (notebook.id)}
                    <option value={notebook.id}>{notebook.title}</option>
                  {/each}
                </select>
              </label>

              <label>
                <span>Page</span>
                <select
                  class="input"
                  aria-label="Destination page"
                  bind:value={destinationPageId}
                  disabled={!destinationNotebook?.pages.length}
                >
                  {#each destinationNotebook?.pages ?? [] as page (page.id)}
                    <option value={page.id}>{page.title}</option>
                  {/each}
                </select>
              </label>
            </div>

            <div class="destination-summary" role="status">
              {#if destinationNotebook && destinationPage}
                Destination: <strong>{destinationNotebook.title} → {destinationPage.title}</strong>
              {:else}
                Choose or create a notebook page before saving.
              {/if}
            </div>

            <section class="destination-create-section">
              <h4>2. Create a new page in the selected notebook</h4>
              <div class="destination-create-page-row">
                <input
                  class="input"
                  type="text"
                  aria-label="New page name in selected notebook"
                  placeholder="New page name"
                  bind:value={existingNotebookNewPageTitle}
                  disabled={!destinationNotebookId || saveDialogLoading}
                />
                <button
                  class="btn btn-sm"
                  type="button"
                  disabled={!destinationNotebookId || !existingNotebookNewPageTitle.trim() || saveDialogLoading}
                  onclick={createPageInExistingNotebook}
                >Create page</button>
              </div>
            </section>

            <section class="destination-create-section">
              <h4>3. Create a new notebook and page</h4>
              <div class="destination-create-fields">
                <input
                  class="input"
                  type="text"
                  aria-label="New notebook name"
                  placeholder="New notebook name"
                  bind:value={newNotebookTitle}
                />
                <input
                  class="input"
                  type="text"
                  aria-label="New page name"
                  placeholder="New page name"
                  bind:value={newPageTitle}
                />
              </div>
              <div class="destination-create-actions">
                <button
                  class="btn btn-sm"
                  type="button"
                  disabled={!newNotebookTitle.trim() || !newPageTitle.trim() || saveDialogLoading}
                  onclick={createDestination}
                >{saveDialogLoading ? "Creating..." : "Create notebook and page"}</button>
              </div>
            </section>
          {/if}

          {#if saveDialogError}
            <div class="save-dialog-error" role="alert">{saveDialogError}</div>
          {/if}

          <footer class="save-dialog-footer">
            <button
              class="btn btn-sm"
              type="button"
              disabled={Boolean(savingChunkId)}
              onclick={closeSaveDialog}
            >Cancel</button>
            <button
              class="btn btn-sm save-dialog-primary"
              type="button"
              disabled={!destinationNotebook || !destinationPage || saveDialogLoading || Boolean(savingChunkId)}
              onclick={saveChunkToDestination}
            >{savingChunkId ? "Saving..." : "Save Chunk"}</button>
          </footer>
        </div>
      </div>
    {/if}
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

  .toolbar-query {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .save-dialog-backdrop {
    position: absolute;
    z-index: 20;
    inset: 0;
    display: grid;
    overflow: auto;
    padding: 18px;
    background: rgb(2 6 23 / 72%);
    place-items: center;
    backdrop-filter: blur(5px);
  }

  .save-dialog {
    display: grid;
    width: min(620px, 100%);
    max-height: 100%;
    overflow: auto;
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in oklab, var(--accent) 44%, var(--border));
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
  }

  .save-dialog-header,
  .save-dialog-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .save-dialog-header {
    justify-content: space-between;
  }

  .save-dialog-header h3,
  .destination-create-section h4 {
    margin: 2px 0 0;
  }

  .destination-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .destination-grid label {
    display: grid;
    min-width: 0;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .destination-grid select {
    width: 100%;
  }

  .destination-summary,
  .save-dialog-loading,
  .save-dialog-error {
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    color: var(--muted);
    font-size: 12px;
  }

  .destination-summary strong {
    color: var(--text);
  }

  .save-dialog-error {
    border-color: color-mix(in oklab, #ef4444 50%, var(--border));
    color: #fca5a5;
  }

  .destination-create-section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .destination-create-section h4 {
    font-size: 12px;
  }

  .destination-choice-label {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }

  .destination-create-page-row {
    display: flex;
    gap: 8px;
  }

  .destination-create-page-row .input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .destination-create-page-row .btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .destination-create-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .destination-create-fields .input {
    min-width: 0;
  }

  .destination-create-actions {
    display: flex;
    justify-content: flex-end;
  }

  .destination-create-actions .btn {
    white-space: nowrap;
  }

  .save-dialog-footer {
    justify-content: flex-end;
  }

  .save-dialog-primary {
    border-color: color-mix(in oklab, var(--accent) 60%, var(--border));
    background: color-mix(in oklab, var(--accent) 20%, transparent);
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

    .toolbar-query {
      grid-column: 1 / -1;
    }

    .meta-row {
      flex-direction: column;
      gap: 3px;
    }

    .chunk-metadata {
      grid-template-columns: 1fr;
    }

    .destination-grid {
      grid-template-columns: 1fr;
    }

    .destination-create-fields {
      grid-template-columns: 1fr;
    }

    .destination-create-page-row {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
