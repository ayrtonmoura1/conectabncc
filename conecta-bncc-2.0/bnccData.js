/* Dados do grafo: carregados uma vez, sem alterar os arquivos originais. */
window.BnccData = (() => {
  let pending, state;
  async function load() {
    if (state) return state;
    if (!pending) pending = (async () => {
      const url='./dados/bncc-grafo.json'; let cache;
      try { if ('caches' in window) cache=await caches.open('conecta-bncc-grafo-dados-2026-08-v1'); } catch (_) {}
      let response=cache && await cache.match(url);
      if (!response) { response=await fetch(url); if (response.ok && cache) try { await cache.put(url,response.clone()); } catch (_) {} }
      return response;
    })().then(r => {
      if (!r.ok) throw new Error('Não foi possível carregar o grafo local (' + r.status + ').');
      return r.json();
    }).then(data => {
      const nodes = new Map(data.aprendizagens.map(n => [n.codigo, n]));
      const incoming = new Map(), outgoing = new Map(), trails = new Map(), structural = new Map();
      const add = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
      for (const e of data.relacoes) { add(outgoing, e.o, e); add(incoming, e.d, e); }
      for (const [id, trail] of Object.entries(data.trilhas)) trail.membros.forEach((code, i) => add(trails, code, {id, ...trail, position:i + 1}));
      for (const e of data.arestas_estruturais) add(structural, e[0], e);
      state = {data, nodes, incoming, outgoing, trails, structural}; return state;
    }).catch(error => { pending = null; throw error; });
    return pending;
  }
  function lookup(id, structure) {
    if (!id) return null;
    const c = structure.computacao || {};
    for (const map of [structure.contextos, structure.campos_experiencia, structure.componentes, structure.areas, structure.recortes_temporais, structure.competencias_especificas, c.eixos, c.objetos_conhecimento, c.competencias]) {
      const v = map && map[id]; if (v) return typeof v === 'string' ? {nome:v} : v;
    }
    return null;
  }
  function period(node, structure) {
    const group = lookup(node.grupo_etario, structure);
    if (group) return group.nome + (group.faixa ? ' (' + group.faixa + ')' : '');
    if (node.etapa === 'EM') return 'Ensino Médio';
    const a = node.anos || []; if (a.length === 1) return a[0] + 'º ano';
    if (a.length > 1) return a[0] + 'º ao ' + a[a.length - 1] + 'º ano';
    return node.etapa === 'EI' ? 'Educação Infantil' : 'Ensino Fundamental';
  }
  return {load, lookup, period};
})();
