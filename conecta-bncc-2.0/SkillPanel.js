window.SkillPanel = (() => {
 const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const warning = 'Relações marcadas como sugeridas foram geradas automaticamente e ainda não foram validadas por especialistas. A BNCC não define progressão formal entre habilidades.';
 function relationList(state, edges, direction) {
   if (!edges.length) return '<p class="graph-empty">Nenhuma relação de progressão mapeada ainda.</p>';
   return '<ul class="progress-list">'+[...edges].sort((a,b)=>b.conf-a.conf).map(e=>{const code=e[direction],n=state.nodes.get(code);if(!n)return '';const component=BnccData.lookup(n.componente||n.area||n.campo_experiencia,state.data.estrutura)?.nome||'',period=BnccData.period(n,state.data.estrutura),confidence=Number.isFinite(e.conf)?Math.round(e.conf*100):null;return '<li><button type="button" class="progress-relation-card '+(e.fonte==='oficial'?'is-official':'is-suggested')+'" data-graph-code="'+esc(code)+'"><span class="progress-card-top"><strong>'+esc(code)+'</strong>'+(confidence!==null?'<span class="progress-badge">'+confidence+'%</span>':'<span class="progress-badge relation-kind">'+(e.fonte==='oficial'?'OFICIAL':'SUGERIDA')+'</span>')+'</span><span class="progress-card-context">'+esc([component,period].filter(Boolean).join(' · '))+'</span><span class="progress-card-description">'+esc(n.texto)+'</span><small class="progress-card-reason">'+esc(e.base)+'</small></button></li>';}).join('')+'</ul>';
 }
 function html(state, node) {
   const trails=state.trails.get(node.codigo)||[], incoming=state.incoming.get(node.codigo)||[], outgoing=state.outgoing.get(node.codigo)||[];
   return '<div class="progress-page"><div class="progress-copy"><div class="progress-heading"><span class="progress-kicker">PERCURSO CURRICULAR</span><h3>Relações de progressão</h3><p>As referências anteriores e posteriores ficam organizadas abaixo; o mapa mostra como se conectam.</p><a class="graph-jump" href="#skillGraph">Ir para o mapa de progressão ↓</a></div><div class="progress-block"><h4>Vem antes <small>'+incoming.length+'</small></h4>'+relationList(state,incoming,'o')+'</div><div class="progress-block"><h4>Vem depois <small>'+outgoing.length+'</small></h4>'+relationList(state,outgoing,'d')+'</div>'+
   (trails.length?'<div class="progress-block"><h4>Trilhas</h4><ul class="context-list">'+trails.map(t=>'<li>'+esc(t.nome)+' <small>· '+t.position+' de '+t.membros.length+'</small></li>').join('')+'</ul></div>':'')+
   ((incoming.concat(outgoing).some(e=>e.fonte==='inferida'))?'<p class="graph-warning">'+warning+'</p>':'')+
   '</div><div class="graph-column" id="skillGraph"></div></div>';
 }
 return {html, warning};
})();
