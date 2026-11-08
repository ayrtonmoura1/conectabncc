window.BnccGraph = (() => {
  const memo = new Map();
  function neighborhood(state, code, options) {
    const key = JSON.stringify([code, options.back, options.forward, [...options.strengths].sort(), options.trail]);
    if (memo.has(key)) return memo.get(key);
    const allowed = e => options.strengths.has(e.forca);
    let codes, edges, reduced = false, truncated = false, back = options.back, forward = options.forward;
    if (options.trail) {
      codes = new Set([code]); for (const t of state.trails.get(code) || []) for (const c of t.membros) codes.add(c);
      edges = state.data.relacoes.filter(e => codes.has(e.o) && codes.has(e.d) && allowed(e));
    } else {
      function walk(b, f) {
        const found = new Set([code]), selected = new Map();
        function side(index, depth, endpoint) {
          let frontier = [code], seen = new Set(frontier);
          for (let i=0; i<depth && frontier.length; i++) {
            const next = [];
            for (const node of frontier) for (const e of index.get(node) || []) if (allowed(e)) {
              selected.set(e.o + '→' + e.d, e); const neighbor = e[endpoint]; found.add(neighbor);
              if (!seen.has(neighbor)) { seen.add(neighbor); next.push(neighbor); }
            }
            frontier = next;
          }
        }
        side(state.incoming,b,'o'); side(state.outgoing,f,'d');
        return {codes:found, edges:[...selected.values()]};
      }
      let result = walk(back, forward);
      while (result.codes.size > 60 && (back > 1 || forward > 1)) {
        if (back >= forward && back > 1) back--; else if (forward > 1) forward--; else back--;
        reduced = true; result = walk(back, forward);
      }
      codes = result.codes; edges = result.edges;
      if (codes.size > 60) { truncated = true; codes = new Set([...codes].slice(0,60)); edges = edges.filter(e => codes.has(e.o) && codes.has(e.d)); }
    }
    const result = {codes:[...codes], edges, reduced, truncated, back, forward};
    memo.set(key,result); if (memo.size > 100) memo.delete(memo.keys().next().value); return result;
  }
  function stage(n) { if(n.doc === 'computacao-2022') return 'computacao'; if(n.etapa === 'EI') return 'infantil'; if(n.etapa === 'EM') return 'medio'; return n.ordem[0] <= 8 ? 'iniciais' : 'finais'; }
  function maxDepth(state, code, direction, strengths) {
    const index=direction==='back'?state.incoming:state.outgoing,endpoint=direction==='back'?'o':'d',memo=new Map(),visiting=new Set();
    function longest(current){if(memo.has(current))return memo.get(current);if(visiting.has(current))return 0;visiting.add(current);let depth=0;for(const edge of index.get(current)||[])if(strengths.has(edge.forca))depth=Math.max(depth,1+longest(edge[endpoint]));visiting.delete(current);memo.set(current,depth);return depth;}
    return longest(code);
  }
  function elements(state, center, result, showStructure, textScale=1) {
    const contextsByCode=new Map();
    if(showStructure)for(const code of result.codes)for(const edge of state.structural.get(code)||[]){const [,id]=edge,s=state.data.estrutura;if(!(s.contextos[id]||s.campos_experiencia[id]||s.computacao.eixos[id]||s.computacao.objetos_conhecimento[id]))continue;const obj=BnccData.lookup(id,s);if(!obj)continue;const types={objeto_conhecimento:'Objeto de conhecimento',unidade_tematica:'Unidade temática',campo_atuacao:'Campo de atuação',pratica_linguagem:'Prática de linguagem',eixo:'Eixo curricular'},kind=types[obj.tipo]||(s.campos_experiencia[id]?'Campo de experiência':s.computacao.eixos[id]?'Eixo de Computação':'Organização curricular'),entry={id,kind,name:obj.nome||obj.texto||''};if(!contextsByCode.has(code))contextsByCode.set(code,[]);if(!contextsByCode.get(code).some(x=>x.id===id))contextsByCode.get(code).push(entry);}
    const nodes = result.codes.map(code => { const n=state.nodes.get(code);if(!n)return null;const contexts=contextsByCode.get(code)||[],text=n.texto.length>112?n.texto.slice(0,109).trim()+'…':n.texto,summary=contexts.map(x=>'• '+x.kind+': '+x.name).join('\n'),shortSummary=summary.length>154?summary.slice(0,151).trim()+'…':summary,label=code+'\n'+text+(showStructure&&contexts.length?'\n\nCONTEXTO CURRICULAR\n'+shortSummary:'');return {data:{id:code,label,full:n.texto,contexts,period:BnccData.period(n,state.data.estrutura),order:n.ordem[0],cardWidth:(showStructure?520:450)*textScale,cardHeight:(showStructure?360:220)*textScale},classes:stage(n)+(code===center?' selected':'')};}).filter(Boolean);
    const edges = result.edges.map((e,i)=>({data:{id:'edge-'+i,source:e.o,target:e.d,relation:e},classes:e.forca}));
    return nodes.concat(edges);
  }
  return {neighborhood, elements, stage, maxDepth};
})();
