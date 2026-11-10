window.SkillPanel = (() => {
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const warning = 'Relações marcadas como sugeridas foram geradas automaticamente e ainda não foram validadas por especialistas. A BNCC não define progressão formal entre habilidades.';
  const PALETTE = ["#60c7b4","#d991f1","#7bb9ff","#f0ad68","#ee83ad","#d8c45f","#a49aff","#7dc9e8","#ef8b75","#9dcc72"];
  const COMPONENT_COLORS = {
    "Espaços, tempos, quantidades, relações e transformações":"#60c7b4",
    "Traços, sons, cores e formas":"#ee83ad",
    "Matemática":"#d8c45f",
    "Língua Portuguesa":"#f083b4",
    "Língua Inglesa":"#ef8b75",
    "Arte":"#ffb86b",
    "Educação Física":"#ead06c",
    "Ciências":"#75d5aa",
    "Ciências da Natureza":"#75d5aa",
    "História":"#ffb86b",
    "Geografia":"#ead06c",
    "Ensino Religioso":"#b5a0ff",
    "Educação Infantil":"#f083b4",
    "Computação":"#61b8ff",
    "CIEB":"#61b8ff",
    "Matemática e suas Tecnologias":"#d8c45f",
    "CIEB · Tecnologia Digital":"#7dc9e8"
  };
  function getCompColor(s){
    if(!s) return "#b5a0ff";
    if(COMPONENT_COLORS[s]) return COMPONENT_COLORS[s];
    let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))>>>0;
    return PALETTE[h%PALETTE.length];
  }
  function relationList(state, edges, direction, label) {
    if (!edges.length) return '<p class="graph-empty">Nenhuma relação de progressão mapeada ainda.</p>';
    return '<div class="row-rail detail-row-rail">'
      +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Relações anteriores"'+(edges.length<=1?' hidden':'')+'>‹</button>'
      +'<div class="row-track" role="region" aria-label="Habilidades que '+esc(label)+'">'
      +[...edges].sort((a,b)=>b.conf-a.conf).map(e=>{
        const code=e[direction],n=state.nodes.get(code);
        if(!n)return '';
        const component=BnccData.lookup(n.componente||n.area||n.campo_experiencia,state.data.estrutura)?.nome||n.componente||n.area||'',period=BnccData.period(n,state.data.estrutura),confidence=Number.isFinite(e.conf)?Math.round(e.conf*100):null;
        const co=getCompColor(component);
        const extraTag=confidence!==null?(confidence+'% similaridade'):(n.unidade_tematica||'');
        const extraHtml=extraTag?'<span class="skill-tag skill-tag--extra">'+esc(extraTag)+'</span>':'';
        return '<article class="skill-card progress-relation-card detail-rail-card '+(e.fonte==='oficial'?'is-official':'is-suggested')+'" role="button" tabindex="0" data-code="'+esc(code)+'" data-graph-code="'+esc(code)+'" data-component="'+esc(component)+'" data-detail-kind="skill" data-rel-type="'+(e.fonte==='oficial'?'Relação oficial de progressão':'Relação sugerida de progressão')+'" data-rel-basis="'+esc(e.base)+'" data-rel-conf="'+(confidence!==null?confidence+'%':'')+'" style="--accent:'+co+'">'
          +'<div class="card-top"><span class="skill-code">'+esc(code)+'</span><span class="skill-group">'+esc(period||(n.etapa||'BNCC'))+'</span></div>'
          +'<div class="card-identity"><span class="skill-tag">'+esc(component)+'</span>'+extraHtml+'</div>'
          +'<p class="card-text">'+esc(n.texto)+'</p>'
          +'<div class="card-foot"><span>1 clique: detalhes · 2 cliques: abrir</span><span aria-hidden="true">↗</span></div>'
          +'</article>';
      }).join('')
      +'</div>'
      +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximas relações"'+(edges.length<=1?' hidden':'')+'>›</button>'
      +'</div>';
  }
  function progressChips(state, edges, direction) {
    if (!edges || edges.length <= 3) return '';
    const counts = new Map();
    for (const e of edges) {
      const code = e[direction], n = state.nodes.get(code);
      if (!n) continue;
      const comp = BnccData.lookup(n.componente||n.area||n.campo_experiencia, state.data.estrutura)?.nome || n.componente || n.area || 'Outros';
      counts.set(comp, (counts.get(comp) || 0) + 1);
    }
    const chips = [
      '<button type="button" class="component-chip active" data-detail-chip="" aria-pressed="true">'
      + '<span class="component-chip-dot" aria-hidden="true"></span>'
      + '<span>Todos</span>'
      + '<span class="component-chip-count">' + edges.length + '</span>'
      + '</button>'
    ];
    for (const [name, count] of counts.entries()) {
      chips.push(
        '<button type="button" class="component-chip" data-detail-chip="' + esc(name) + '" aria-pressed="false" style="--chip-accent:' + getCompColor(name) + '">'
        + '<span class="component-chip-dot" aria-hidden="true"></span>'
        + '<span>' + esc(name) + '</span>'
        + '<span class="component-chip-count">' + count + '</span>'
        + '</button>'
      );
    }
    return '<div class="row-components detail-chips-row"><div class="component-rail"><div class="row-component-list" role="group" aria-label="Filtrar por componente">' + chips.join('') + '</div></div></div>';
  }
  function relacoesHtml(state, node) {
    const trails=state.trails.get(node.codigo)||[], incoming=state.incoming.get(node.codigo)||[], outgoing=state.outgoing.get(node.codigo)||[];
    const inChips = progressChips(state, incoming, 'o');
    const outChips = progressChips(state, outgoing, 'd');
    return '<div class="progress-page"><div class="progress-copy">'
      +'<a class="graph-jump" href="#skillGraph">Ir para o mapa de progressão ↓</a>'
      +'<div class="progress-block detail-faixa-group"><div class="faixa-head"><h4>Vem antes <small>'+incoming.length+'</small></h4>'+inChips+'</div>'+relationList(state,incoming,'o','vêm antes')+'</div>'
      +'<div class="progress-block detail-faixa-group"><div class="faixa-head"><h4>Vem depois <small>'+outgoing.length+'</small></h4>'+outChips+'</div>'+relationList(state,outgoing,'d','vêm depois')+'</div>'+
    (trails.length?'<div class="progress-block"><h4>Trilhas</h4><ul class="context-list">'+trails.map(t=>'<li>'+esc(t.nome)+' <small>· '+t.position+' de '+t.membros.length+'</small></li>').join('')+'</ul></div>':'')+
    ((incoming.concat(outgoing).some(e=>e.fonte==='inferida'))?'<p class="graph-warning">'+warning+'</p>':'')+
    '</div></div>';
  }
  function mapaHtml(){return '<div class="graph-column" id="skillGraph"></div>';}
  function html(state, node){return relacoesHtml(state,node)+mapaHtml();}
  return {html, relacoesHtml, mapaHtml, warning};
})();