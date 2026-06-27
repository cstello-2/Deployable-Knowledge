// graph 🕸️ viewer 🖼️ — the interactive 🕹️ knowledge 🎓 graph for Deployable Knowledge.
// the browser 🔭 talks to neo4j 🔷 directly through neovis (vendored, offline 📴); this
// file 📃 is the thin glue 🧵: search 🔎, double-click to expand 🦘, click for a card 🪪.
//
// TypeScript source 🗞️ — compiled once to graph.js (committed) so users run 🏗️ it with
// no build 🔨 step. recompile: `npx -y typescript tsc app/static/graph.ts --target es2018 --lib es2018,dom --outDir app/static`

declare const NeoVis: any; // vendored global 🔭 (app/static/js/vendor/neovis.js)

// one color 🎨 per entity 🏷️ kind so the graph reads at a glance.
const KIND_COLORS: Record<string, string> = {
  entity: "#4f9cf0",   // proper nouns (orgs, places, programs)
  acronym: "#3fb27f",  // USAF, DAF, T-38C …
  measure: "#e0a23c",  // 13,968 lbs …
};

const el = (id: string) => document.getElementById(id) as HTMLElement;
const setStatus = (msg: string) => { el("status").textContent = msg; };

let viz: any = null;
let initialCypher = "";

// pull an entity 🏷️ name 🪪 off whatever node ⚪ vis just handed us.
function nodeName(id: any): string {
  const n = viz && viz.nodes && viz.nodes.get(id);
  if (!n) return "";
  return n.label || (n.raw && n.raw.properties && n.raw.properties.name) || "";
}

// the click 🖱️ card 🪪 — who is this entity, where does it come from, jump to the page 📃.
async function showDetail(name: string): Promise<void> {
  if (!name) return;
  const panel = el("panel");
  panel.style.display = "block";
  panel.innerHTML = `<div class="muted">loading ${name}…</div>`;
  try {
    const r = await fetch("/graph/entity?name=" + encodeURIComponent(name), { credentials: "same-origin" });
    const d = await r.json();
    if (!d.found) { panel.innerHTML = `<b>${name}</b><div class="muted">no detail</div>`; return; }
    const srcs = (d.sources || []).map((s: string) => `<li>${s}</li>`).join("");
    const seg = (d.segments || [])[0];
    const prov = seg
      ? `<a href="/static/doc_at.html?segment=${encodeURIComponent(seg)}" target="_blank" rel="noopener">open a source passage →</a>`
      : "";
    panel.innerHTML =
      `<button class="x" onclick="this.parentElement.style.display='none'">✕</button>` +
      `<h3>${d.name}</h3>` +
      `<div class="muted">${d.kind} · seen ${d.count}× · ${d.degree} links</div>` +
      `<div class="lbl">source documents</div><ul>${srcs}</ul>` +
      `<div class="prov">${prov}</div>` +
      `<div class="hint">double-click any node to grow its neighbourhood</div>`;
  } catch (e) {
    panel.innerHTML = `<b>${name}</b><div class="muted">detail unavailable</div>`;
  }
}

// double-click 🦘 grows the graph: pull this entity's neighbours and merge them in.
function expand(name: string): void {
  if (!name || !viz) return;
  const safe = name.replace(/['\\]/g, "");
  setStatus("expanding " + name + " …");
  viz.updateWithCypher(
    `MATCH (n:Entity {name:'${safe}'})-[r:CO_OCCURS]-(m:Entity) RETURN n, r, m LIMIT 40`
  );
}

// search 🔎 jumps the view to one entity + its strongest neighbours.
function search(term: string): void {
  term = (term || "").trim();
  if (!term || !viz) return;
  const safe = term.replace(/['\\]/g, "");
  setStatus("searching “" + term + "” …");
  viz.renderWithCypher(
    `MATCH (n:Entity) WHERE toLower(n.name) CONTAINS toLower('${safe}') ` +
    `WITH n ORDER BY n.count DESC LIMIT 1 ` +
    `OPTIONAL MATCH (n)-[r:CO_OCCURS]-(m:Entity) RETURN n, r, m LIMIT 120`
  );
}

// re-attach vis handlers after every (re)render — neovis rebuilds the network each time.
function wireNetwork(): void {
  const net = viz && viz.network;
  if (!net) return;
  net.off("click"); net.off("doubleClick");
  net.on("click", (p: any) => { if (p.nodes && p.nodes.length) showDetail(nodeName(p.nodes[0])); });
  net.on("doubleClick", (p: any) => { if (p.nodes && p.nodes.length) expand(nodeName(p.nodes[0])); });
}

async function main(): Promise<void> {
  setStatus("connecting to Neo4j …");
  let cfg: any;
  try {
    cfg = await (await fetch("/graph/viz-config", { credentials: "same-origin" })).json();
  } catch (e) {
    setStatus("could not read /graph/viz-config"); return;
  }
  initialCypher = cfg.initialCypher;

  const labelCfg: any = { label: "name", value: "count", group: "kind" };
  // hover 👀 preview via neovis advanced config, when the symbol is available.
  if (NeoVis.NEOVIS_ADVANCED_CONFIG) {
    labelCfg[NeoVis.NEOVIS_ADVANCED_CONFIG] = {
      function: {
        title: (node: any) =>
          `${node.properties.name} · ${node.properties.kind} · seen ${node.properties.count}×`,
      },
    };
  }

  const config: any = {
    containerId: "viz",
    neo4j: { serverUrl: cfg.uri, serverUser: cfg.user, serverPassword: cfg.password },
    labels: { Entity: labelCfg },
    relationships: { CO_OCCURS: { value: "weight" } },
    visConfig: {
      nodes: { shape: "dot", scaling: { min: 8, max: 40 }, font: { color: "#e6edf3", size: 13 } },
      edges: { color: { color: "#5a6b78", opacity: 0.45 }, smooth: false },
      groups: {
        entity: { color: KIND_COLORS.entity },
        acronym: { color: KIND_COLORS.acronym },
        measure: { color: KIND_COLORS.measure },
      },
      physics: { stabilization: { iterations: 200 }, barnesHut: { springLength: 130, gravitationalConstant: -9000 } },
      interaction: { hover: true, tooltipDelay: 120, multiselect: true },
    },
    initialCypher,
  };

  const NeoVisClass = NeoVis.default || NeoVis;
  viz = new NeoVisClass(config);
  (window as any).dkGraph = viz; // debug 🔭 handle — also handy for power users in the console.
  viz.registerOnEvent("completed", () => {
    setStatus("ready — drag to move · scroll to zoom · click a node for detail · double-click to expand");
    wireNetwork();
    // re-centre 🎯 after every (re)render so a search lands framed, not in a corner.
    setTimeout(() => { try { viz.network.fit({ animation: false }); } catch (e) {} }, 150);
  });
  viz.registerOnEvent("error", (e: any) => setStatus("Neo4j error: " + ((e && e.message) || e) + " — is `docker compose up -d neo4j` running and loaded?"));
  viz.render();

  el("go").addEventListener("click", () => search((el("q") as HTMLInputElement).value));
  el("q").addEventListener("keydown", (e: any) => { if (e.key === "Enter") search((el("q") as HTMLInputElement).value); });
  el("reset").addEventListener("click", () => { el("panel").style.display = "none"; viz.renderWithCypher(initialCypher); });
}

main();
