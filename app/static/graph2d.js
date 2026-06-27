// 🗺️ the lightweight knowledge 🎓 graph 🕸️ viewer 🖼️ — NotebookLM‑style, but with NO
// Neo4j 🔷. the browser 🔭 only ever asks the app 🪧 for a small, server‑bounded slice 🍰
// (/graph/subgraph), so it stays smooth and works on ANY deploy ☁️ (even a plain http
// tunnel 🕳️). search 🔎 to centre, double‑click to grow 🦘, click a node ⚪ for a card 🪪.
//
// TypeScript source 🗞️ — compiled to graph2d.js (committed). recompile:
//   npx -y -p typescript@5 tsc app/static/graph2d.ts --target es2018 --lib es2018,dom --outDir app/static
const KIND_COLORS = { entity: "#4f9cf0", acronym: "#3fb27f", measure: "#e0a23c" };
const el = (id) => document.getElementById(id);
const setStatus = (m) => { el("status").textContent = m; };
let network, nodes, edges;
const seenNodes = new Set(), seenEdges = new Set();
const nodeObj = (n) => ({
    id: n.id, label: n.id, value: Math.max(1, n.degree), group: n.kind,
    title: `${n.id} · ${n.kind} · seen ${n.count}× · ${n.degree} links`,
});
const edgeKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
// merge a fresh slice 🍰 into what's already on screen (so expanding grows the map 🗺️).
function merge(data) {
    for (const n of data.nodes || []) {
        if (!seenNodes.has(n.id)) {
            seenNodes.add(n.id);
            nodes.add(nodeObj(n));
        }
        else
            nodes.update({ id: n.id, value: Math.max(1, n.degree) });
    }
    for (const l of data.links || []) {
        const k = edgeKey(l.source, l.target);
        if (!seenEdges.has(k)) {
            seenEdges.add(k);
            edges.add({ from: l.source, to: l.target, value: l.weight });
        }
    }
}
async function fetchSub(focus) {
    const u = focus ? `/graph/subgraph?focus=${encodeURIComponent(focus)}&limit=120` : "/graph/subgraph?limit=140";
    return (await fetch(u, { credentials: "same-origin" })).json();
}
function reset(data) {
    nodes.clear();
    edges.clear();
    seenNodes.clear();
    seenEdges.clear();
    merge(data);
    setTimeout(() => { try {
        network.fit({ animation: false });
    }
    catch (e) { } }, 120);
}
// the click 🖱️ card 🪪 — kind, frequency, source 🗞️ docs + a link 🔗 to the exact page 📃.
async function showDetail(name) {
    const panel = el("panel");
    panel.style.display = "block";
    panel.innerHTML = `<div class="muted">loading ${name}…</div>`;
    try {
        const d = await (await fetch("/graph/entity?name=" + encodeURIComponent(name), { credentials: "same-origin" })).json();
        if (!d.found) {
            panel.innerHTML = `<b>${name}</b><div class="muted">no detail</div>`;
            return;
        }
        const srcs = (d.sources || []).map((s) => `<li>${s}</li>`).join("");
        const seg = (d.segments || [])[0];
        const prov = seg ? `<a href="/static/doc_at.html?segment=${encodeURIComponent(seg)}" target="_blank" rel="noopener">open a source passage →</a>` : "";
        panel.innerHTML =
            `<button class="x" onclick="this.parentElement.style.display='none'">✕</button>` +
                `<h3>${d.name}</h3><div class="muted">${d.kind} · seen ${d.count}× · ${d.degree} links</div>` +
                `<div class="lbl">source documents</div><ul>${srcs}</ul><div class="prov">${prov}</div>` +
                `<div class="hint">double-click any node to grow its neighbourhood</div>`;
    }
    catch (e) {
        panel.innerHTML = `<b>${name}</b><div class="muted">detail unavailable</div>`;
    }
}
async function main() {
    setStatus("loading graph…");
    nodes = new vis.DataSet([]);
    edges = new vis.DataSet([]);
    const options = {
        nodes: { shape: "dot", scaling: { min: 6, max: 42 }, font: { color: "#e6edf3", size: 13 } },
        edges: { color: { color: "#5a6b78", opacity: 0.4 }, smooth: false },
        groups: { entity: { color: KIND_COLORS.entity }, acronym: { color: KIND_COLORS.acronym }, measure: { color: KIND_COLORS.measure } },
        physics: { stabilization: { iterations: 150 }, barnesHut: { springLength: 120, gravitationalConstant: -9000 } },
        interaction: { hover: true, tooltipDelay: 120, multiselect: true },
    };
    network = new vis.Network(el("viz"), { nodes, edges }, options);
    window.dkMap = { network, nodes, edges }; // debug 🔭 handle + console power‑use.
    network.on("click", (p) => { if (p.nodes && p.nodes.length)
        showDetail(p.nodes[0]); });
    network.on("doubleClick", async (p) => {
        if (p.nodes && p.nodes.length) {
            setStatus("expanding " + p.nodes[0] + " …");
            merge(await fetchSub(p.nodes[0]));
        }
    });
    reset(await fetchSub(null));
    setStatus("ready — drag · scroll to zoom · click a node for detail · double-click to expand");
    el("go").addEventListener("click", async () => {
        const q = el("q").value.trim();
        if (q) {
            setStatus("searching “" + q + "” …");
            reset(await fetchSub(q));
        }
    });
    el("q").addEventListener("keydown", (e) => { if (e.key === "Enter")
        el("go").click(); });
    el("reset").addEventListener("click", async () => { el("panel").style.display = "none"; reset(await fetchSub(null)); });
}
main();
