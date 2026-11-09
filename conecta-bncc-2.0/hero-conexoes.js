/* Constelação do banner: habilidades (nós com códigos BNCC) unidas por fios
   que se desenham na entrada, com pulsos de luz discretos cruzando a rede.
   Os nós são posicionados automaticamente apenas nos espaços vazios do
   banner: o script mede as áreas ocupadas (título, texto, carta em destaque,
   nota BNCC, controles) e evita sobrepor qualquer conteúdo. */
(function () {
  const hero = document.querySelector(".hero");
  if (!hero || typeof ResizeObserver === "undefined") return;

  const NS = "http://www.w3.org/2000/svg";
  const codes = [
    ["EF03MA05", "purple"], ["EI03EF01", "green"], ["EF07LP14", "blue"],
    ["EM13MAT103", "gold"], ["EF06CO02", "pink"], ["EI01CG05", "purple"],
    ["EF09LP05", "blue"], ["EF01CI04", "green"], ["EM12CO06", "gold"],
    ["EF04HI10", "pink"]
  ];
  // Liga cada nó ao seguinte e alguns saltos, formando a malha.
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [0, 4], [2, 6]];

  const wrap = document.createElement("div");
  wrap.className = "hero-constellation";
  wrap.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(NS, "svg");
  wrap.appendChild(svg);
  hero.insertBefore(wrap, hero.firstChild);

  const wireEls = links.map(([a, b], i) => {
    const w = document.createElementNS(NS, "path");
    w.setAttribute("class", "hn-wire");
    w.setAttribute("pathLength", "100");
    w.style.setProperty("--wd", (0.4 + (i % 6) * 0.16).toFixed(2) + "s");
    svg.appendChild(w);
    return w;
  });
  const flowEls = links.map(([a, b], i) => {
    if (i % 2) return null;
    const f = document.createElementNS(NS, "path");
    f.setAttribute("class", "hn-flow hn-" + codes[a][1]);
    f.setAttribute("pathLength", "100");
    f.style.setProperty("--fd", (2.5 + (i % 5) * 1.4).toFixed(2) + "s");
    f.style.setProperty("--fdur", (9 + (i % 4) * 2) + "s");
    svg.appendChild(f);
    return f;
  });
  const nodeEls = codes.map(([c, k], i) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "hn-node hn-" + k);
    g.dataset.code = c;
    g.style.setProperty("--nd", (0.1 + (i % 8) * 0.12).toFixed(2) + "s");
    const halo = document.createElementNS(NS, "circle");
    halo.setAttribute("class", "hn-halo");
    halo.setAttribute("r", 20);
    const core = document.createElementNS(NS, "circle");
    core.setAttribute("class", "hn-core");
    core.setAttribute("r", 5);
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "hn-label");
    label.textContent = c;
    g.appendChild(halo); g.appendChild(core); g.appendChild(label);
    svg.appendChild(g);
    return { g, halo, core, label };
  });

  // Áreas a evitar: textos, botões, carta em destaque e nota BNCC.
  function blockedRects() {
    const sel = ".hero-copy,.spotlight-card,.spotlight-note,.hero-catalog";
    return [...hero.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    });
  }
  const pad = 26;
  function fits(x, y, blocked) {
    return blocked.every(b => x < b.x0 - pad || x > b.x1 + pad || y < b.y0 - pad || y > b.y1 + pad);
  }

  // Busca determinística (mesma semente) por posições livres, variando de
  // centro para fora em anéis, mantendo distância entre os próprios nós.
  function place(W, H, blocked) {
    const pts = [];
    const minGap = Math.min(W, H) * 0.16;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [c, k] of codes) {
      let best = null, bestScore = -1;
      for (let t = 0; t < 260; t++) {
        const x = W * (0.04 + rnd() * 0.92);
        const y = H * (0.04 + rnd() * 0.92);
        if (!fits(x, y, blocked)) continue;
        // distância mínima entre nós: evita aglomerado ilegível
        let clear = true, nearest = 1e9;
        for (const p of pts) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < minGap) { clear = false; break; }
          nearest = Math.min(nearest, d);
        }
        if (!clear) continue;
        // prefere pontos mais afastados de tudo (centro do espaço vazio)
        let wall = 1e9;
        for (const b of blocked) {
          wall = Math.min(wall, Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1, 0));
        }
        const score = Math.min(wall, nearest) + rnd() * 8;
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
      if (!best) best = { x: W * 0.5, y: H * 0.5 }; // fallback improvável
      pts.push(best);
    }
    return pts;
  }

  let lastW = 0, lastH = 0;
  function layout() {
    const rect = hero.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (Math.abs(rect.width - lastW) < 2 && Math.abs(rect.height - lastH) < 2) return;
    lastW = rect.width; lastH = rect.height;
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    const blocked = blockedRects();
    const pts = place(rect.width, rect.height, blocked);
    const d = (a, b) => "M" + pts[a].x.toFixed(1) + " " + pts[a].y.toFixed(1) +
      "L" + pts[b].x.toFixed(1) + " " + pts[b].y.toFixed(1);
    links.forEach(([a, b], i) => {
      wireEls[i].setAttribute("d", d(a, b));
      if (flowEls[i]) flowEls[i].setAttribute("d", d(a, b));
    });
    pts.forEach((p, i) => {
      const { halo, core, label } = nodeEls[i];
      halo.setAttribute("cx", p.x); halo.setAttribute("cy", p.y);
      core.setAttribute("cx", p.x); core.setAttribute("cy", p.y);
      label.setAttribute("x", p.x + 13); label.setAttribute("y", p.y - 11);
    });
  }
  layout();

  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  }).observe(hero);
  // A carta muda de tamanho ao trocar de habilidade; realoca quando estável.
  window.addEventListener("resize", () => { lastW = 0; requestAnimationFrame(layout); });

  // A carta em destaque acende discretamente o nó correspondente da rede.
  window.heroSpotlight = function (code) {
    svg.querySelectorAll(".hn-node.hn-active").forEach(g => g.classList.remove("hn-active"));
    const match = svg.querySelector('.hn-node[data-code="' + code + '"]');
    if (match) match.classList.add("hn-active");
  };
  const current = document.getElementById("featuredCode");
  if (current && current.textContent) window.heroSpotlight(current.textContent.trim());
})();
