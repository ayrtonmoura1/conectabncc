const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'dados', file), 'utf8'));
const original = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const instrumented = original.replace(/load\(\);\s*\}\)\(\);\s*$/, 'globalThis.detailApi={normalize,S,E,relations,detailRelations,detailHeaderHtml,detailNavItems,relatedMapListHtml,mapWorkspaceHtml,ciebHtml,aiHtml,reunaHtml,competenciasHtml,relationCard,initializeDetailRails,shortcuts,ROWS,rowItems,modalAbrirInfo,habilidadeModalAbrir,openCardDetailModal,periods,printBarHtml,syncDetailNavScrollspy,setActiveDetailNavLink,rowView,rowPeriodChips,card,skillConnectionCount,getSkillConnectionsData,arrangeGraphPositions};})();');
assert.notEqual(instrumented, original, 'Não foi possível preparar o módulo da página para verificação');
const sandbox = {document:{body:{dataset:{}}},localStorage:{getItem:()=>null},console};
vm.runInNewContext(instrumented, sandbox, {filename:'app.js'});
const api = sandbox.detailApi;
api.normalize({ei:read('educacao-infantil.json'),ef:read('ensino-fundamental.json'),em:read('ensino-medio.json'),structure:read('estrutura.json'),comp:read('computacao.json'),cieb:read('curriculo_cieb_computacao.json'),ai:read('sugestoes_interdisciplinares_ia.json'),reuna:read('hierarquia_reuna.json')});

test('o cabeçalho reúne a organização e a fonte completa da habilidade',()=>{
 const x=api.S.by.get('EF06LP03'),html=api.detailHeaderHtml(x);
 assert.equal((html.match(/id="detalhe-organizacao"/g)||[]).length,1);
 assert.equal((html.match(/id="detalhe-fonte"/g)||[]).length,1);
 for(const text of ['Língua Portuguesa','Objeto de conhecimento','Campo de atuação','Prática de linguagem','Base Nacional Comum Curricular · 2018','dados-2026.07.1'])assert.ok(html.includes(text),text);
 for(const value of [x.source.arquivo,x.source.localizador,x.source.localizador_pdf,x.source.proveniencia].filter(Boolean))assert.ok(html.includes(api.E(value)),value);
 assert.ok(html.includes('detail-header-fact-source'));
});

test('os dados essenciais de cada etapa permanecem no cabeçalho',()=>{
 for(const code of ['EI03ET07','EF06MA01','EM13LP36','EF15CO02','CDEILD01']){
  const x=api.S.by.get(code);assert.ok(x,code+' ausente no catálogo');const html=api.detailHeaderHtml(x),raw=x.raw||{};
  for(const value of [x.group||x.stage,x.discipline,x.area&&x.area!==x.discipline?x.area:null].filter(Boolean))assert.ok(html.includes(api.E(value)),code+' perdeu '+value);
  for(const id of [...(raw.competencias_especificas||[]),...(raw.competencia?[raw.competencia]:[])]){const comp=api.S.data.bnccCompetencies.get(id)||api.S.data.compCompetencies.get(id);if(comp?.texto)assert.ok(html.includes(api.E(comp.texto)),code+' perdeu competência '+id);}
  for(const value of [x.source?.arquivo,x.source?.localizador,x.source?.localizador_pdf,x.source?.proveniencia].filter(Boolean))assert.ok(html.includes(api.E(value)),code+' perdeu fonte '+value);
 }
});

test('a seção Computação mostra só a outra família e mantém as sugestões CIEB',()=>{
 for(const code of ['EF06LP03','EF06MA01','EI03ET07','CDEILD01','EF15CO02']){
  const x=api.S.by.get(code),original=api.relations(x,Infinity),groups=api.detailRelations(x);
  const computacao=x.kind==='computacao'||x.kind==='cieb';
  const outra=r=>computacao?r.item.kind==='bncc':(r.item.kind==='computacao'||r.item.kind==='cieb');
  assert.deepEqual(new Set(groups.curriculo.map(r=>r.item.code)),new Set(original.filter(outra).map(r=>r.item.code)),code+': seção com a outra família');
  assert.ok(groups.curriculo.every(outra),code+': item da mesma família na seção');
  const cieb=new Set(groups.cieb.map(r=>r.item.code));
  const previous=api.S.data.cieb.filter(y=>y.code!==x.code).map(y=>({y,explicit:(y.bnccLinks||[]).some(h=>h.codigo===x.code)})).filter(o=>o.explicit).sort((a,b)=>a.y.code.localeCompare(b.y.code));
  for(const {y} of previous)assert.ok(cieb.has(y.code),code+' perdeu referência CIEB '+y.code);
  assert.equal(cieb.size,groups.cieb.length);
  assert.ok(groups.cieb.every(r=>r.item.kind==='cieb'));
  if(groups.cieb.length>6)assert.ok(api.ciebHtml(x,groups.cieb).includes('data-relation-kind="cieb"'));
  if(groups.curriculo.length>6)assert.ok(api.relatedMapListHtml(groups.curriculo).includes('data-relation-kind="curriculo"'));
 }
});

test('o detalhe CIEB mantém competências, práticas, avaliações, nível de maturidade, materiais com links e códigos BNCC indicados',()=>{
 const x=api.S.by.get('CDEILD01'),groups=api.detailRelations(x),header=api.detailHeaderHtml(x),section=api.ciebHtml(x,groups.cieb);
 for(const item of x.raw.generalCompetencies)assert.ok(header.includes(api.E(item.codigo)));
 for(const text of [...x.raw.practices,...x.raw.evaluations])assert.ok(section.includes(api.E(text)));
 for(const link of x.raw.bnccLinks){if(api.S.by.has(link.codigo))assert.ok(groups.curriculo.some(r=>r.item.code===link.codigo));else assert.ok(header.includes(api.E(link.codigo)));}
 assert.ok(header.includes('Nível de maturidade sugerido'), 'cabeçalho CIEB deve conter nível de maturidade');
 assert.ok(header.includes('Básico'), 'cabeçalho CIEB deve conter nível Básico');
 assert.ok(section.includes('Materiais e referências de apoio'), 'ciebHtml deve renderizar seção de materiais de referência');
 for(const mat of x.raw.materials){
  assert.ok(section.includes(api.E(mat.nome)), 'material deve conter nome '+mat.nome);
  assert.ok(section.includes(api.E(mat.link)), 'material deve conter link '+mat.link);
 }
 for(const kw of x.raw.keywords){
  assert.ok(section.includes(api.E(kw)), 'deve conter palavra-chave '+kw);
 }
});

test('habilidades BNCC sem vínculo oficial declarado no CIEB possuem zero relações CIEB (ex: EF06LP02)',()=>{
 const x = api.S.by.get('EF06LP02');
 const rels = api.relations(x, Infinity);
 const ciebRels = rels.filter(r => r.item.kind === 'cieb');
 assert.equal(ciebRels.length, 0, 'EF06LP02 não deve possuir relações CIEB por inferência indevida');

 const groups = api.detailRelations(x);
 assert.equal(groups.cieb.length, 0, 'detailRelations(EF06LP02).cieb deve ser vazio');

 const count = api.skillConnectionCount(x);
 assert.equal(typeof count, 'number');
 assert.ok(count < 186, 'contagem de conexões de EF06LP02 deve cair com remoção das relações falsas do CIEB (antes: 186)');
});

test('alinhamentos da Educação Infantil continuam no mapa de progressão e indicações BNCC do CIEB continuam acessíveis',()=>{
 const grafo=read('bncc-grafo.json'),vizinhos=new Map();
 grafo.relacoes.filter(a=>a.fonte==='oficial'&&String(a.base||'').startsWith('alinhamento EI')).forEach(a=>{for(const [p,q] of [[a.o,a.d],[a.d,a.o]]){if(!vizinhos.has(p))vizinhos.set(p,new Set());vizinhos.get(p).add(q);}});
 const alcancaveis=c=>{const v=new Set([c]),f=[c];while(f.length){const k=f.pop();(vizinhos.get(k)||new Set()).forEach(w=>{if(!v.has(w)){v.add(w);f.push(w);}});}return v;};
 for(const x of api.S.all.filter(item=>item.stage==='EI'&&item.raw?.alinhamento)){
  const ligados=alcancaveis(x.code);
  for(const y of api.S.all.filter(item=>item.code!==x.code&&item.raw?.alinhamento===x.raw.alinhamento))assert.ok(ligados.has(y.code),x.code+' sem caminho no mapa de progressão até '+y.code);
 }
 for(const x of api.S.all.filter(item=>item.kind==='cieb'&&(item.raw?.bnccLinks||[]).length)){
  const groups=api.detailRelations(x),visible=new Set([...groups.curriculo,...groups.cieb].map(r=>r.item.code)),header=api.detailHeaderHtml(x);
  for(const link of x.raw.bnccLinks){if(api.S.by.has(link.codigo))assert.ok(visible.has(link.codigo),x.code+' perdeu vínculo '+link.codigo);else assert.ok(header.includes(api.E(link.codigo)),x.code+' omitiu código '+link.codigo);}
 }
});

test('referência Reúna não repete a posição e sugestões interdisciplinares continuam disponíveis',()=>{
 const x=api.S.by.get('EF06LP03'),reuna=api.reunaHtml(x);
 assert.ok(reuna.includes('Focal 3/6'));
 assert.ok(!reuna.includes('Posição 3 de 6'));
 const withAi=api.S.all.find(item=>api.S.data.ai[item.code]?.por_componente);
 assert.ok(withAi);
 assert.ok(api.aiHtml(withAi).includes('SUGESTÃO DE IA'));

 // Validação dos cartões padronizados e comentário expandido no Mapa de Foco
 const x16=api.S.by.get('EF01LP16'),reuna16=api.reunaHtml(x16);
 assert.ok(reuna16.includes('class="reuna-comment" open'),'Comentário pedagógico deve vir expandido por padrão');
 assert.ok(reuna16.includes('Aprendizagem focal (AF)'),'deve conter o título da faixa de Aprendizagem focal (AF)');
 assert.ok(reuna16.includes('class="skill-card relation-card detail-rail-card"'),'Aprendizagem focal (AF) deve renderizar cartões padronizados');
 assert.ok(reuna16.includes('data-code="EF01LP18"'),'cartão padronizado deve conter o código EF01LP18');
 assert.ok(reuna16.includes('1 clique: detalhes · 2 cliques: abrir'),'cartão do Reúna deve conter ação padronizada de 1 e 2 cliques');
});

test('uma sugestão interdisciplinar com várias habilidades mantém os códigos sem repetir justificativa e atividade',()=>{
 const x=api.S.by.get('EF01LP24'),suggestion=api.S.data.ai[x.code].por_componente['Educação Física'],html=api.aiHtml(x);
 const start=html.indexOf('<article class="ai-card" data-ai-component="Educação Física">'),end=html.indexOf('</article>',start);
 assert.ok(start>=0&&end>start);const card=html.slice(start,end);
 for(const code of suggestion.codigos)assert.ok(card.includes('data-code="'+api.E(code)+'"'),code);
 assert.equal(card.split(api.E(suggestion.justificativa)).length-1,1);
 assert.equal(card.split(api.E(suggestion.atividade)).length-1,1);
});

test('o aviso de progressão aparece uma vez e continua visível no mapa expandido',()=>{
 const source=fs.readFileSync(path.join(root,'SkillGraph.js'),'utf8');
 const patched=source.replace('return {mount,detach,refresh(){if(root&&cy)update();},resize(){if(root&&cy)resizeGraph();}};','return {syncMapNotices,setTestState(r,s,c){root=r;state=s;code=c;}};');
 assert.notEqual(patched,source);
 const env={window:{},document:{fullscreenElement:null}};vm.runInNewContext(patched,env,{filename:'SkillGraph.js'});
 const graph=env.window.SkillGraph,notice={dataset:{hasSuggested:'true'},hidden:false},before={textContent:''},after={textContent:''};
 let expanded=false,summaryWarning={};
 const card={classList:{contains:()=>expanded}},rootElement={isConnected:true,querySelector(selector){return selector==='.graph-card'?card:selector==='.graph-map-warning'?notice:selector==='[data-empty="before"]'?before:selector==='[data-empty="after"]'?after:null;},closest(){return {querySelector:()=>summaryWarning};}};
 graph.setTestState(rootElement,{incoming:new Map(),outgoing:new Map([['EF06LP03',[{forca:'fraca'}]]])},'EF06LP03');
 graph.syncMapNotices();assert.equal(notice.hidden,true);assert.equal(before.textContent,'');assert.match(after.textContent,/ocultas pelos filtros/);
 expanded=true;graph.syncMapNotices();assert.equal(notice.hidden,false);assert.match(before.textContent,/Nenhuma relação/);
 expanded=false;summaryWarning=null;graph.syncMapNotices();assert.equal(notice.hidden,false);
 notice.dataset.hasSuggested='false';graph.syncMapNotices();assert.equal(notice.hidden,true);
});

test('as seções de Computação, CIEB, Conceitos e Sugestões interdisciplinares são exibidas em faixas com carrossel igual ao catálogo',()=>{
 for(const code of ['EF06LP03','EF15CO02','CDEILD01']){
  const x=api.S.by.get(code),groups=api.detailRelations(x);
  if(groups.curriculo.length){
   const compHtml=api.relatedMapListHtml(groups.curriculo);
   assert.ok(compHtml.includes('class="row-rail detail-row-rail"'),code+' Computação sem row-rail');
   assert.ok(compHtml.includes('class="row-track"'),code+' Computação sem row-track');
   assert.ok(compHtml.includes('rail-arrow rail-prev'),code+' Computação sem seta prev');
   assert.ok(compHtml.includes('rail-arrow rail-next'),code+' Computação sem seta next');
   for(const r of groups.curriculo){
    assert.ok(compHtml.includes('data-code="'+api.E(r.item.code)+'"'),code+' perdeu código '+r.item.code);
   }
  }
  if(groups.cieb.length){
   const ciebHtml=api.ciebHtml(x,groups.cieb);
   assert.ok(ciebHtml.includes('class="row-rail detail-row-rail"'),code+' CIEB sem row-rail');
   assert.ok(ciebHtml.includes('class="row-track"'),code+' CIEB sem row-track');
   for(const r of groups.cieb){
    assert.ok(ciebHtml.includes('data-code="'+api.E(r.item.code)+'"'),code+' CIEB perdeu código '+r.item.code);
   }
  }
  const aiHtml=api.aiHtml(x),entry=api.S.data.ai[code];
  if(entry?.conceitos?.length){
   assert.ok(aiHtml.includes('id="detalhe-conceitos"'),code+' sem faixa de conceitos');
   assert.ok(aiHtml.includes('data-detail-kind="concept"'),code+' conceitos sem kind');
   for(const c of entry.conceitos){
    assert.ok(aiHtml.includes('data-concept="'+api.E(c)+'"'),code+' perdeu conceito '+c);
   }
  }
  if(entry?.por_componente){
   assert.ok(aiHtml.includes('Sugestões interdisciplinares'),code+' sem título sugestões');
   assert.ok(aiHtml.includes('class="row-track"'),code+' sugestões sem row-track');
  }
 }
});

test('as competências relacionadas são exibidas em faixa horizontal com texto oficial',()=>{
 for(const code of ['EM13LP36','CDEILD01','EF06MA01']){
  const x=api.S.by.get(code),html=api.competenciasHtml(x);
  assert.ok(html.includes('id="detalhe-competencias"'),code+' sem id detalhe-competencias');
  assert.ok(html.includes('class="row-rail detail-row-rail"'),code+' sem row-rail');
  assert.ok(html.includes('class="row-track"'),code+' sem row-track');
  assert.ok(html.includes('data-detail-kind="competency"'),code+' sem data-detail-kind');
 }
});

test('as relações de progressão vêm antes e vêm depois são montadas em faixas com detalhes e ações de 1 e 2 cliques',()=>{
 const panelSource=fs.readFileSync(path.join(root,'SkillPanel.js'),'utf8');
 const panelSandbox={window:{},document:{}};
 vm.runInNewContext(panelSource,panelSandbox,{filename:'SkillPanel.js'});
 const SkillPanel=panelSandbox.window.SkillPanel;
 const fakeState={
  nodes:new Map([
   ['EF06MA01',{codigo:'EF06MA01',texto:'Habilidade de Matemática',componente:'Matemática'}],
   ['EF05MA01',{codigo:'EF05MA01',texto:'Pré-requisito anterior',componente:'Matemática'}],
   ['EF07MA01',{codigo:'EF07MA01',texto:'Habilidade posterior',componente:'Matemática'}]
  ]),
  trails:new Map(),
  incoming:new Map([['EF06MA01',[{o:'EF05MA01',d:'EF06MA01',fonte:'oficial',conf:1,base:'Base oficial'}]]]),
  outgoing:new Map([['EF06MA01',[{o:'EF06MA01',d:'EF07MA01',fonte:'inferida',conf:0.85,base:'Base inferida'}]]]),
  data:{estrutura:{componentes_curriculares:[{id:'Matemática',nome:'Matemática'}]}}
 };
 const fakeBnccData={lookup:(k)=>({nome:k}),period:()=>'6º ano'};
 panelSandbox.BnccData=fakeBnccData;
 const html=SkillPanel.html(fakeState,fakeState.nodes.get('EF06MA01'));
 assert.ok(html.includes('Vem antes'),'sem bloco Vem antes');
 assert.ok(html.includes('Vem depois'),'sem bloco Vem depois');
 assert.ok(html.includes('class="row-rail detail-row-rail"'),'sem carrossel row-rail');
 assert.ok(html.includes('data-graph-code="EF05MA01"'),'sem código anterior');
 assert.ok(html.includes('data-graph-code="EF07MA01"'),'sem código posterior');
 assert.ok(html.includes('1 clique: detalhes · 2 cliques: abrir'),'sem dica de duplo clique');
});

test('as faixas em detalhes não sequestram o scroll do mouse na vertical',()=>{
 const registeredEvents=[];
 const fakeTrack={
  scrollWidth:1000,clientWidth:500,scrollLeft:0,
  closest:()=>({querySelector:()=>({hidden:false})}),
  addEventListener:(type)=>{registeredEvents.push(type);}
 };
 const fakeScope={querySelectorAll:()=>[fakeTrack]};
 api.initializeDetailRails(fakeScope);
 assert.ok(!registeredEvents.includes('wheel'),'initializeDetailRails não deve registrar listener de wheel');
 assert.ok(registeredEvents.includes('scroll'),'initializeDetailRails deve sincronizar setas no scroll');
});

test('os cartões das faixas de detalhes seguem o padrão visual do catálogo com no máximo uma informação extra',()=>{
 const x=api.S.by.get('EF06MA01');
 api.S.currentSkill=x;
 const related=api.detailRelations(x);
 if(related.curriculo.length){
  const cardHtml=api.relationCard(related.curriculo[0]);
  assert.ok(cardHtml.includes('class="card-top"'),'sem card-top');
  assert.ok(cardHtml.includes('class="card-identity"'),'sem card-identity');
  assert.ok(cardHtml.includes('class="card-text"'),'sem card-text');
  assert.ok(cardHtml.includes('class="card-foot"'),'sem card-foot');
  assert.ok(!cardHtml.includes('relation-basis'),'não deve ter relation-basis no cartão');
  const extraCount=(cardHtml.match(/class="skill-tag skill-tag--extra"/g)||[]).length;
  assert.ok(extraCount<=1,'deve ter no máximo uma informação extra');
 }
 const aiHtml=api.aiHtml(x);
 if(aiHtml.includes('ai-card')){
  assert.ok(aiHtml.includes('class="card-top"'),'ai-card sem card-top');
  assert.ok(aiHtml.includes('class="card-identity"'),'ai-card sem card-identity');
  assert.ok(aiHtml.includes('class="card-text"'),'ai-card sem card-text');
  assert.ok(aiHtml.includes('class="card-foot"'),'ai-card sem card-foot');
 }
});

test('o catálogo inclui faixas dedicadas para competências e separa computação de cieb',()=>{
 const rowIds=api.ROWS.map(r=>r.id);
 const emIdx=rowIds.indexOf('em'),compIdx=rowIds.indexOf('competencias'),computacaoIdx=rowIds.indexOf('computacao'),ciebIdx=rowIds.indexOf('cieb'),reunaIdx=rowIds.indexOf('reuna');
 assert.ok(emIdx>=0&&compIdx>emIdx&&computacaoIdx>compIdx&&ciebIdx>computacaoIdx&&reunaIdx>ciebIdx,'ordem incorreta das faixas no catálogo');
 const competencias=api.rowItems('competencias');
 assert.equal(competencias.length,129,'deve conter 129 competências');
 assert.ok(competencias.every(c=>c.kind==='competencia'),'todos os itens da faixa de competências devem ter kind competencia');
 const computacao=api.rowItems('computacao');
 assert.ok(computacao.every(c=>c.kind==='computacao'),'faixa computacao não deve conter cieb');
 const cieb=api.rowItems('cieb');
 assert.ok(cieb.every(c=>c.kind==='cieb'),'faixa cieb deve conter apenas cieb');
});
test('as novas faixas constam na escolha por etapa e os atalhos cobrem todas as faixas',()=>{
 const expectedStages=['ei','iniciais','finais','em','competencias','computacao','cieb','reuna'];
 assert.deepEqual([...api.ROWS.map(r=>r.id)],expectedStages,'as faixas em ROWS devem cobrir exatamente as etapas esperadas');
 
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const stage of expectedStages){
  assert.ok(html.includes('value="'+stage+'"'),'#stageSelect no index.html deve conter a opção '+stage);
 }

 const stageShortcutsEl={innerHTML:''};
 const stageSandbox={
  document:{
   getElementById:(id)=>stageShortcutsEl,
   body:{dataset:{}}
  },
  $:id=>id==='#stageShortcuts'?stageShortcutsEl:null,
  ROWS:api.ROWS,
  S:api.S,
  E:api.E
 };
 const shortcutsFn=new Function('document','$','ROWS','S','E','return '+api.shortcuts.toString())(stageSandbox.document,stageSandbox.$,stageSandbox.ROWS,stageSandbox.S,stageSandbox.E);
 shortcutsFn();
 for(const stage of expectedStages){
  assert.ok(stageShortcutsEl.innerHTML.includes('data-scroll="'+stage+'"'),'atalhos devem conter chip para '+stage);
 }
});

test('itens de competência possuem página de detalhes completa com relações e enquadramento',()=>{
 for(const code of ['CG01','EM-LIN01','CO01','CE-LP01']){
  const x=api.S.by.get(code);
  assert.ok(x,'competência '+code+' deve existir no índice S.by');
  assert.equal(x.kind,'competencia','o item '+code+' deve ser kind competencia');

  const header=api.detailHeaderHtml(x);
  assert.ok(header.includes('id="detalhe-organizacao"'),code+' deve ter seção de enquadramento curricular');
  assert.ok(header.includes('Tipo de competência'),code+' deve exibir tipo de competência nos fatos');
  assert.ok(header.includes('Documento de origem'),code+' deve exibir documento de origem');

  const groups=api.detailRelations(x);
  assert.ok(groups.curriculo.length>0,code+' deve possuir habilidades articuladas vinculadas');
  assert.ok(groups.curriculo.every(r=>r.item.kind==='bncc'||r.item.kind==='computacao'),code+' habilidades articuladas devem ser BNCC ou Computação');

  const compHtml=api.competenciasHtml(x);
  assert.ok(compHtml.includes('id="detalhe-competencias"'),code+' deve renderizar faixa de competências afins');
  assert.ok(compHtml.includes('data-code="'),code+' cartões de competências devem ter data-code para navegação');
  assert.ok(compHtml.includes('2 cliques: abrir'),code+' deve instruir 2 cliques para abrir');

  const mapHtml=api.mapWorkspaceHtml(x,groups.curriculo);
  assert.ok(mapHtml.includes('id="detalhe-articulacoes"'),code+' deve conter container de articulações curriculares');
  assert.ok(!mapHtml.includes('id="detalhe-relacoes"')&&!mapHtml.includes('id="detalhe-mapa-progressao"'),code+' não deve ter seções de relações ou mapa de progressão');
  assert.ok(!mapHtml.includes('id="detalhe-mapa-conteudo"'),code+' não deve incluir container de mapa vazio');
  assert.ok(!mapHtml.includes('<h2>Mapa de progressão</h2>'),code+' não deve ter cabeçalho Mapa de progressão');
  assert.ok(mapHtml.includes('Habilidades articuladas'),code+' deve intitular a faixa como Habilidades articuladas');
 }
});

test('habilidades de Computação, CIEB e Competências não exibem seções de Mapas nem mapa de progressão',()=>{
 for(const code of ['EF15CO02','CDEILD01','CG01','EM-LIN01']){
  const x=api.S.by.get(code);
  const rels=api.detailRelations(x);
  const html=api.mapWorkspaceHtml(x,rels.curriculo);
  assert.ok(!html.includes('id="detalhe-relacoes"')&&!html.includes('id="detalhe-mapa-progressao"'),code+' não deve ter seções de relações ou mapa de progressão');
  assert.ok(!html.includes('id="detalhe-mapa-conteudo"'),code+' não deve ter container de mapa');
  assert.ok(!html.includes('<h2>Mapa de progressão</h2>'),code+' não deve ter cabeçalho Mapa de progressão');
  if(x.kind==='competencia'){
   assert.ok(html.includes('id="detalhe-articulacoes"'),code+' deve ter seção de habilidades articuladas');
  }else if(rels.curriculo.length){
   assert.ok(html.includes('id="detalhe-computacao"'),code+' deve ter seção de habilidades BNCC');
   assert.ok(html.includes('Habilidades da BNCC'),code+' deve intitular como Habilidades da BNCC');
  }
 }
 const regular=api.S.by.get('EF06MA01');
 const regularRels=api.detailRelations(regular);
 const regularHtml=api.mapWorkspaceHtml(regular,regularRels.curriculo);
 assert.ok(regularHtml.includes('id="detalhe-relacoes"')&&regularHtml.includes('id="detalhe-mapa-progressao"'),'habilidade regular BNCC deve ter seções de relações e mapa de progressão');
 assert.ok(regularHtml.includes('id="detalhe-mapa-conteudo"'),'habilidade regular BNCC deve ter container do mapa');
 assert.ok(regularHtml.includes('<h2>Relações de progressão</h2>')&&regularHtml.includes('<h2>Mapa de progressão</h2>'),'habilidade regular BNCC deve ter cabeçalhos Relações de progressão e Mapa de progressão');
});

test('as faixas de detalhes exibem chips de componentes apenas quando têm mais cartões que a área visível (> 3)',()=>{
 const manyItems=[
  {item:api.S.by.get('EF06MA01'),rel:{type:'rel1'}},
  {item:api.S.by.get('EF06MA02')||api.S.by.get('EF06MA01'),rel:{type:'rel2'}},
  {item:api.S.by.get('EF06LP01')||api.S.by.get('EF06LP03'),rel:{type:'rel3'}},
  {item:api.S.by.get('EF06LP02')||api.S.by.get('EF06LP03'),rel:{type:'rel4'}}
 ];
 const fewItems=manyItems.slice(0,2);
 const manyHtml=api.relatedMapListHtml(manyItems);
 assert.ok(manyHtml.includes('class="component-chip active"'),'deve exibir chip Todos ativo com mais de 3 itens');
 assert.ok(manyHtml.includes('data-detail-chip=""'),'deve conter data-detail-chip para Todos');
 assert.ok(manyHtml.includes('data-detail-chip="Matemática"')||manyHtml.includes('data-detail-chip="Língua Portuguesa"'),'deve conter chips para componentes');
 
 const fewHtml=api.relatedMapListHtml(fewItems);
 assert.ok(!fewHtml.includes('component-chip'),'não deve renderizar chips quando há 3 ou menos itens');
});

test('o SkillPanel renderiza chips para relações quando edges > 3 e o sticky summary aplica cor de destaque',()=>{
 const panelSource=fs.readFileSync(path.join(root,'SkillPanel.js'),'utf8');
 const panelSandbox={window:{},document:{}};
 vm.runInNewContext(panelSource,panelSandbox,{filename:'SkillPanel.js'});
 const SkillPanel=panelSandbox.window.SkillPanel;
 const fakeState={
  nodes:new Map([
   ['EF06MA01',{codigo:'EF06MA01',texto:'Habilidade foco',componente:'Matemática'}],
   ['EF05MA01',{codigo:'EF05MA01',texto:'Pré 1',componente:'Matemática'}],
   ['EF05MA02',{codigo:'EF05MA02',texto:'Pré 2',componente:'Matemática'}],
   ['EF05LP01',{codigo:'EF05LP01',texto:'Pré 3',componente:'Língua Portuguesa'}],
   ['EF05CI01',{codigo:'EF05CI01',texto:'Pré 4',componente:'Ciências'}]
  ]),
  trails:new Map(),
  incoming:new Map([['EF06MA01',[
   {o:'EF05MA01',d:'EF06MA01',fonte:'oficial',conf:1,base:'Base oficial'},
   {o:'EF05MA02',d:'EF06MA01',fonte:'oficial',conf:1,base:'Base oficial'},
   {o:'EF05LP01',d:'EF06MA01',fonte:'inferida',conf:0.8,base:'Base inferida'},
   {o:'EF05CI01',d:'EF06MA01',fonte:'inferida',conf:0.7,base:'Base inferida'}
  ]]]),
  outgoing:new Map(),
  data:{estrutura:{componentes_curriculares:[
   {id:'Matemática',nome:'Matemática'},
   {id:'Língua Portuguesa',nome:'Língua Portuguesa'},
   {id:'Ciências',nome:'Ciências'}
  ]}}
 };
 panelSandbox.BnccData={lookup:(k)=>({nome:k}),period:()=>'5º ano'};
 const html=SkillPanel.html(fakeState,fakeState.nodes.get('EF06MA01'));
 assert.ok(html.includes('class="component-chip active"'),'SkillPanel com mais de 3 arestas deve renderizar chips');
 assert.ok(html.includes('data-detail-chip="Matemática"'),'SkillPanel deve conter chip de Matemática');
 assert.ok(html.includes('data-detail-chip="Língua Portuguesa"'),'SkillPanel deve conter chip de Língua Portuguesa');
 assert.ok(html.includes('data-detail-chip="Ciências"'),'SkillPanel deve conter chip de Ciências');

 const css=fs.readFileSync(path.join(root,'responsividade.css'),'utf8');
 assert.ok(css.includes('var(--detail-accent'),'responsividade.css deve usar --detail-accent no sticky summary');
 assert.ok(css.includes('.detail-sticky-summary strong'),'responsividade.css deve estilizar o código no sticky summary');
 assert.ok(css.includes('font-weight:800'),'responsividade.css deve formatar o código maior com peso tipográfico e sem cápsula');
});

test('o modal de 1 clique em cartões de competência e habilidades inclui botão de ação para abrir detalhes e botão de fechar',()=>{
 const dialogMock={
  id:'habilidadeDialog',
  innerHTML:'',
  setAttribute:()=>{},
  addEventListener:()=>{},
  querySelectorAll:()=>[],
  querySelector:()=>null,
  showModal:()=>{dialogMock.open=true;},
  close:()=>{dialogMock.open=false;},
  open:false
 };
 sandbox.document.getElementById=(id)=>id==='habilidadeDialog'?dialogMock:null;
 sandbox.document.createElement=()=>dialogMock;
 sandbox.document.body.appendChild=()=>{};

 // 1. Teste de cartão de competência
 const compCardMock={
  dataset:{
   detailKind:'competency',
   code:'CG01',
   rotulo:'Competência Geral 1',
   tipo:'Competência Geral',
   area:'Educação Básica',
   texto:'Valorizar e utilizar os conhecimentos historicamente construídos...'
  },
  classList:{contains:()=>false},
  querySelector:()=>null,
  querySelectorAll:()=>[]
 };
 api.openCardDetailModal(compCardMock);
 assert.ok(dialogMock.innerHTML.includes('data-hab-abrir="CG01"'),'modal de competência deve ter data-hab-abrir com código da competência');
 assert.ok(dialogMock.innerHTML.includes('Ir para os detalhes da competência →'),'modal deve ter texto de ação para detalhes da competência');
 assert.ok(dialogMock.innerHTML.includes('value="fechar"'),'modal deve ter botão de fechar');

 // 2. Teste de habilidade
 api.habilidadeModalAbrir('EF06MA01');
 assert.ok(dialogMock.innerHTML.includes('data-hab-abrir="EF06MA01"'),'modal de habilidade deve ter data-hab-abrir');
 assert.ok(dialogMock.innerHTML.includes('Ir para os detalhes da habilidade →'),'modal deve ter ação de ir para detalhes da habilidade');
 assert.ok(dialogMock.innerHTML.includes('value="fechar"'),'modal de habilidade deve ter botão de fechar');

 // 3. Teste de habilidade CIEB EM
 api.habilidadeModalAbrir('CDEMAD01');
 assert.ok(dialogMock.innerHTML.includes('data-hab-abrir="CDEMAD01"'),'modal CIEB deve ter data-hab-abrir');
 assert.ok(dialogMock.innerHTML.includes('Ir para os detalhes da habilidade →'),'modal CIEB deve ter botão de ação para página de detalhes');
});

test('as habilidades do CIEB Ensino Médio estão cadastradas com página de detalhes, relações adequadas e filtro na faixa do CIEB',()=>{
 const emHabs=api.S.all.filter(x=>x.kind==='cieb'&&x.raw?.stage==='Ensino Médio');
 assert.equal(emHabs.length,51,'deve carregar todas as 51 habilidades/competências do CIEB Ensino Médio');

 // Competências de eixo presentes
 for(const code of ['CDEM01','CDEM02','TDEM01','TDEM02','PCEM01','PCEM02','PCEM03']){
  const h=api.S.by.get(code);
  assert.ok(h,code+' deve constar em S.by');
  assert.equal(h.kind,'cieb');
  assert.equal(h.raw.stage,'Ensino Médio');
 }

 // Unidade curricular com metadados ricos e relações
 const cdemad01=api.S.by.get('CDEMAD01');
 assert.ok(cdemad01,'CDEMAD01 deve constar em S.by');
 const header=api.detailHeaderHtml(cdemad01);
 assert.ok(header.includes('Autoria digital'),'cabeçalho deve exibir unidade curricular');
 assert.ok(header.includes('Essenciais'),'cabeçalho deve exibir tipo de unidade curricular');
 assert.ok(header.includes('80h'),'cabeçalho deve exibir carga horária');
 assert.ok(header.includes('CDEM01'),'cabeçalho deve exibir competência de eixo');

 // Relação entre unidade e competência de eixo
 const relAxis=api.relations(cdemad01,Infinity).find(r=>r.item.code==='CDEM01');
 assert.ok(relAxis,'CDEMAD01 deve se relacionar com sua competência de eixo CDEM01');
 assert.equal(relAxis.rel.type,'Competência de eixo associada');

 // Relação no mesmo eixo Cultura Digital
 const relSameAxis=api.relations(cdemad01,Infinity).filter(r=>r.item.kind==='cieb'&&r.item.code!=='CDEM01');
 assert.ok(relSameAxis.length>0,'CDEMAD01 deve se articular com outras unidades CIEB do mesmo eixo');

 // ciebHtml renderiza estrutura e práticas
 const rels=api.detailRelations(cdemad01);
 const ciebSection=api.ciebHtml(cdemad01,rels.cieb);
 assert.ok(ciebSection.includes('Estrutura e detalhamento da unidade curricular'),'ciebHtml deve renderizar estrutura da unidade curricular');
 assert.ok(ciebSection.includes('Atitudes e valores'),'ciebHtml deve renderizar atitudes e valores');

 // Faixa do CIEB no catálogo tem o período "em" (Ensino Médio)
 const ciebRow=api.ROWS.find(r=>r.id==='cieb');
 assert.ok(ciebRow,'faixa CIEB deve existir no catálogo');
 const periods=api.periods(cdemad01,'cieb');
 assert.ok(periods.some(p=>p.key==='em'&&p.label==='Ensino Médio'),'CIEB EM deve retornar período em / Ensino Médio');
});

test('Documento de origem aparece recolhido por padrão com summary interativo e botão Imprimir/PDF é integrado às ações de cabeçalho',()=>{
 const x=api.S.by.get('EF06MA01');
 const header=api.detailHeaderHtml(x);
 assert.ok(header.includes('<details class="detail-header-fact detail-header-fact-source" id="detalhe-fonte">'),'Documento de origem deve ser um elemento details com classe e id');
 assert.ok(!header.includes('id="detalhe-fonte" open'),'Documento de origem NÃO deve ter o atributo open por padrão');
 assert.ok(header.includes('<summary class="detail-source-summary">'),'deve conter summary interativo');
 assert.ok(header.includes('Ver origem e proveniência ▾'),'summary deve conter rótulo explicativo de expansão');
 assert.ok(header.includes('Base Nacional Comum Curricular · 2018'),'conteúdo deve conter a fonte oficial');

 // Botão de imprimir integrado exclusivamente às ações do cabeçalho (sem duplicação no final da página)
 assert.ok(original.includes('id="printOpen"'),'ações do cabeçalho devem conter o botão #printOpen');
 assert.ok(original.includes('Imprimir / Salvar em PDF'),'texto de impressão deve estar presente no cabeçalho');
 assert.ok(!original.includes('+reunaHtml(x)+printBarHtml()'),'o final da página não deve conter botão duplicado de impressão');
 assert.equal(api.printBarHtml(),'','printBarHtml não deve injetar botão no rodapé');

 const printCss = fs.readFileSync(path.join(root, 'print.css'), 'utf8');
 assert.ok(printCss.includes('.print-dialog{') && printCss.includes('overflow:hidden'), 'print-dialog deve ter overflow:hidden para preservar bordas arredondadas');
 assert.ok(printCss.includes('margin:16px 0'), 'barra de rolagem do modal de impressão deve ter margem vertical para não quebrar os cantos arredondados');
});

test('os atalhos da barra de navegação recebem destaque ativo (scrollspy) e atualizam a seleção conforme a seção visível',()=>{
 const link1 = {
  getAttribute: (attr) => attr === 'href' ? '#detalhe-organizacao' : null,
  classList: {
   contains: (c) => link1._classes.has(c),
   add: (c) => link1._classes.add(c),
   remove: (c) => link1._classes.delete(c)
  },
  setAttribute: (k, v) => { link1._attrs[k] = v; },
  removeAttribute: (k) => { delete link1._attrs[k]; },
  closest: () => ({ scrollWidth: 500, clientWidth: 500 }),
  _classes: new Set(),
  _attrs: {}
 };
 const link2 = {
  getAttribute: (attr) => attr === 'href' ? '#detalhe-competencias' : null,
  classList: {
   contains: (c) => link2._classes.has(c),
   add: (c) => link2._classes.add(c),
   remove: (c) => link2._classes.delete(c)
  },
  setAttribute: (k, v) => { link2._attrs[k] = v; },
  removeAttribute: (k) => { delete link2._attrs[k]; },
  closest: () => ({ scrollWidth: 500, clientWidth: 500 }),
  _classes: new Set(),
  _attrs: {}
 };
 const allLinks = [link1, link2];

 // Teste setActiveDetailNavLink
 api.setActiveDetailNavLink(allLinks, link1);
 assert.ok(link1.classList.contains('is-active'), 'link 1 deve ter a classe is-active');
 assert.equal(link1._attrs['aria-current'], 'true', 'link 1 deve ter aria-current="true"');
 assert.ok(!link2.classList.contains('is-active'), 'link 2 não deve ter is-active');

 api.setActiveDetailNavLink(allLinks, link2);
 assert.ok(!link1.classList.contains('is-active'), 'link 1 deve perder is-active');
 assert.ok(link2.classList.contains('is-active'), 'link 2 deve receber is-active');
 assert.equal(link2._attrs['aria-current'], 'true', 'link 2 deve ter aria-current="true"');

 // Teste de regras de estilo no CSS
 const refinoCss = fs.readFileSync(path.join(root, 'refino.css'), 'utf8');
 assert.ok(refinoCss.includes('.detail-nav a.is-active'), 'refino.css deve ter regra para .detail-nav a.is-active');
 assert.ok(refinoCss.includes('var(--detail-accent'), 'refino.css deve utilizar --detail-accent no atalho ativo');
 assert.ok(refinoCss.includes('aria-current="true"'), 'refino.css deve estilizar aria-current="true"');
 assert.ok(refinoCss.includes('.detail-nav a.is-active,.detail-nav a[aria-current="true"]{background:color-mix(in srgb,var(--detail-accent,#dfbce9) 12%'), 'refino.css deve aplicar destaque suave no atalho ativo');

 const respCss = fs.readFileSync(path.join(root, 'responsividade.css'), 'utf8');
 assert.ok(respCss.includes('.detail-sticky-summary strong{display:inline-flex;align-items:center;min-width:auto;padding:0;border:none;background:transparent'), 'responsividade.css deve usar destaque tipográfico maior, com peso e sem cápsula envolvente no sticky summary');
 assert.ok(!refinoCss.includes('.detail-nav a.is-active::after'), 'refino.css não deve conter barrinha sublinhada ::after no atalho selecionado');
 assert.ok(respCss.includes('.detail-page.has-compact-summary .detail-sticky-shell{top:120px}'), 'responsividade.css deve colar perfeitamente a barra de navegação no sticky summary sem fresta');
});

test('os chips nas faixas de detalhes (CIEB, Computação, Interdisciplinar, Competências e Percurso) ficam alinhados à esquerda logo após o título da seção',()=>{
 const carrosselCss = fs.readFileSync(path.join(root, 'carrossel.css'), 'utf8');
 assert.ok(carrosselCss.includes('.faixa-head{display:flex;align-items:center;justify-content:flex-start'), 'faixa-head deve alinhar à esquerda com justify-content:flex-start');
 assert.ok(!carrosselCss.includes('.faixa-head{display:flex;align-items:center;justify-content:space-between'), 'faixa-head não deve usar justify-content:space-between');

 const x = api.S.by.get('EF06MA01');
 const groups = api.detailRelations(x);

 // Faixa CIEB
 const ciebHtml = api.ciebHtml(x, groups.cieb);
 assert.ok(ciebHtml.includes('<div class="faixa-head"><h3 class="related-heading">Habilidades CIEB relacionadas'), 'CIEB deve conter faixa-head com h3');

 // Faixa Computação / Articulações
 const mapHtml = api.relatedMapListHtml(groups.curriculo, x);
 assert.ok(mapHtml.includes('<div class="faixa-head"><h3 class="related-heading">'), 'Computação/Articulações deve conter faixa-head com h3');

 // Faixa Interdisciplinar
 const aiHtml = api.aiHtml(x);
 if (aiHtml.includes('ai-suggestions-group')) {
  assert.ok(aiHtml.includes('<div class="faixa-head"><h3 class="related-heading">Sugestões interdisciplinares'), 'Sugestões interdisciplinares deve conter faixa-head com h3');
 }

 // Faixa Competências
 const compHtml = api.competenciasHtml(x);
 assert.ok(compHtml.includes('<div class="faixa-head"><h3 class="related-heading">Competências articuladas'), 'Competências deve conter faixa-head com h3');
});

test('o menu Nesta habilidade reúne a organização curricular sem atalho separado para fonte',()=>{
 for (const code of ['EF06LP03', 'EF06MA01', 'EI03ET07', 'EM13LP36', 'CDEILD01', 'EF15CO02']) {
  const x = api.S.by.get(code);
  const groups = api.detailRelations(x);
  const comps = (x.raw?.competencias_especificas || []).map(id => api.S.data.bnccCompetencies.get(id)).filter(Boolean);
  const nav = api.detailNavItems(x, groups, comps);
  const ids = nav.map(([id]) => id);
  const labels = nav.map(([, label]) => label);

  assert.ok(ids.includes('detalhe-organizacao'), code + ' deve incluir atalho para organização');
  assert.ok(labels.includes(x.kind === 'competencia' ? 'Enquadramento' : 'Organização'), code + ' deve rotular como Organização ou Enquadramento');
  assert.ok(!ids.includes('detalhe-fonte'), code + ' NÃO deve conter atalho separado para detalhe-fonte');
  assert.ok(!labels.includes('Fonte'), code + ' NÃO deve conter rótulo Fonte no menu Nesta habilidade');

  // A fonte permanece acessível dentro da seção de organização
  const headerHtml = api.detailHeaderHtml(x);
  assert.ok(headerHtml.includes('id="detalhe-organizacao"'), code + ' deve conter container detalhe-organizacao');
  assert.ok(headerHtml.includes('id="detalhe-fonte"'), code + ' deve conter detalhe-fonte dentro do cabeçalho de organização');
 }
});

test('práticas sugeridas e avaliação sugerida do CIEB ficam empilhadas uma abaixo da outra',()=>{
 const refinoCss = fs.readFileSync(path.join(root, 'refino.css'), 'utf8');
 assert.ok(refinoCss.includes('.cieb-guidance{display:flex;flex-direction:column'), 'refino.css deve definir .cieb-guidance com flex column para empilhamento vertical');
 assert.ok(refinoCss.includes('.cieb-guidance .info-block{width:100%}'), 'refino.css deve definir blocos de orientação com width:100%');

 const x = api.S.by.get('CDEM01');
 assert.ok(x, 'CDEM01 deve estar presente');
 const groups = api.detailRelations(x);
 const html = api.ciebHtml(x, groups.cieb);
 assert.ok(html.includes('cieb-guidance'), 'deve conter cieb-guidance');
 assert.ok(html.includes('cieb-guidance-stacked'), 'deve conter cieb-guidance-stacked');
 assert.ok(html.includes('Práticas sugeridas'), 'deve conter Práticas sugeridas');
 assert.ok(html.includes('Avaliação sugerida'), 'deve conter Avaliação sugerida');
});

test('a faixa Escolha por etapa é fixa no topo (sticky) com atalhos e scrollspy',()=>{
 const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
 const carrosselCss = fs.readFileSync(path.join(root, 'carrossel.css'), 'utf8');
 const interactionsCss = fs.readFileSync(path.join(root, 'catalog-interactions.css'), 'utf8');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

 // 1. Estrutura do DOM: faixa de etapas fora do .hero e com classe stage-sticky-shell
 assert.ok(indexHtml.includes('class="stage-sticky-shell"'), 'index.html deve conter barra de etapas com classe stage-sticky-shell');
 const heroEnd = indexHtml.indexOf('</section>');
 const stageBarPos = indexHtml.indexOf('class="stage-sticky-shell"');
 assert.ok(stageBarPos > heroEnd, 'a faixa de etapas deve estar fora de <section class="hero"> para viabilizar position:sticky');

 // 2. CSS Sticky e scroll-margin
 assert.ok(carrosselCss.includes('.stage-sticky-shell{position:-webkit-sticky!important;position:sticky!important;top:68px!important'), 'carrossel.css deve fixar a faixa de etapas a top:68px');
 assert.ok(carrosselCss.includes('backdrop-filter:blur'), 'carrossel.css deve incluir backdrop-filter blur na faixa sticky');
 assert.ok(interactionsCss.includes('scroll-margin-top:136px') || interactionsCss.includes('scroll-margin-top: 136px'), 'catalog-interactions.css deve definir scroll-margin-top para .catalog-row');

 // 3. Offset de rolagem e scrollspy
 assert.ok(appJs.includes('stageBar=$(".stage-sticky-shell, #stageBar")'), 'jumpToRow deve considerar o offset da barra de etapas sticky');
 assert.ok(appJs.includes('function syncCatalogNavScrollspy()'), 'app.js deve implementar syncCatalogNavScrollspy');
 assert.ok(appJs.includes('syncCatalogNavScrollspy();'), 'scroll listener deve invocar syncCatalogNavScrollspy');
});

test('cada etapa possui botão de busca à esquerda do chip Todos que filtra por código, descrição e componente',()=>{
 const rowEi = api.ROWS.find(r => r.id === 'ei');
 const viewEi = api.rowView(rowEi);
 const periodHtml = api.rowPeriodChips(rowEi, viewEi);

 // 1. O botão de busca existe e antecede o chip Todos
 assert.ok(periodHtml.includes('class="row-search-wrap'), 'rowPeriodChips deve conter row-search-wrap');
 assert.ok(periodHtml.includes('data-row-search-toggle="ei"'), 'deve conter botão data-row-search-toggle para ei');
 assert.ok(periodHtml.includes('row-search-icon') && periodHtml.includes('<svg'), 'deve renderizar ícone svg de lupa na busca da etapa');
 assert.ok(periodHtml.includes('data-row-search-input="ei"'), 'deve conter input de busca contextual');
 assert.ok(periodHtml.includes('data-row-search-clear="ei"'), 'deve conter botão para limpar busca');
 assert.ok(periodHtml.indexOf('data-row-search-toggle') < periodHtml.indexOf('data-period=""'), 'o botão de busca deve ficar à esquerda do chip Todos');

 // 2. Filtragem local da linha por código
 api.S.rowQueries.set('ei', 'EI01CG01');
 const filteredViewCode = api.rowView(rowEi);
 assert.equal(filteredViewCode.items.length, 1, 'busca por código na etapa deve isolar o cartão correspondente');
 assert.equal(filteredViewCode.items[0].code, 'EI01CG01');

 // 3. Filtragem local da linha por descrição / texto
 api.S.rowQueries.set('ei', 'movimentos');
 const filteredViewText = api.rowView(rowEi);
 assert.ok(filteredViewText.items.length > 0, 'busca por termo de descrição deve retornar cartões');
 assert.ok(filteredViewText.items.every(x => String((x.text||'') + (x.discipline||'') + (x.field||'')).toLowerCase().includes('movimento')), 'todos os itens retornados devem conter o termo');

 // 4. Limpeza da busca restaura todos os itens
 api.S.rowQueries.delete('ei');
 const restoredView = api.rowView(rowEi);
 assert.equal(restoredView.items.length, viewEi.base.length, 'remover query local deve restaurar a quantidade original de itens');
});


test('todos os cartões do catálogo exibem badge no canto inferior direito com a contagem total de conexões',()=>{
 const x=api.S.by.get('EF06MA01');
 assert.ok(x, 'EF06MA01 deve existir');
 const count=api.skillConnectionCount(x);
 assert.ok(typeof count==='number'&&count>0, 'skillConnectionCount deve ser positivo');
 const cardHtml=api.card(x,0,'finais');
 assert.ok(cardHtml.includes('class="card-conn-badge"'), 'cartão deve conter card-conn-badge');
 assert.ok(cardHtml.includes(String(count)), 'cartão deve conter o número de conexões');
});

test('a busca na etapa afeta as contagens de itens do componente e do ano/fase',()=>{
 const rowEi = api.ROWS.find(r => r.id === 'ei');
 const initialView = api.rowView(rowEi);
 const initialCount = initialView.base.length;
 
 // Digitar busca restringe view.base
 api.S.rowQueries.set('ei', 'EI01CG01');
 const filteredView = api.rowView(rowEi);
 assert.equal(filteredView.base.length, 1, 'view.base deve ser filtrado pela query');
 
 const chipsHtml = api.rowPeriodChips(rowEi, filteredView);
 assert.ok(chipsHtml.includes('>1</span>'), 'chip Todos deve refletir a quantidade filtrada');
 
 api.S.rowQueries.delete('ei');
 const restoredView = api.rowView(rowEi);
 assert.equal(restoredView.base.length, initialCount, 'view.base deve ser restaurado');
});

test('a etapa do Ensino Médio possui botão de busca contextual ativo',()=>{
 const rowEm = api.ROWS.find(r => r.id === 'em');
 const viewEm = api.rowView(rowEm);
 const emChipsHtml = api.rowPeriodChips(rowEm, viewEm);
 assert.ok(emChipsHtml.includes('data-row-search-toggle="em"'), 'Ensino Médio deve conter data-row-search-toggle="em"');
 assert.ok(emChipsHtml.includes('data-row-search-input="em"'), 'Ensino Médio deve conter data-row-search-input="em"');
});

test('a estrutura de dados da Proposta Detalhes 2 mapeia nós organizados por categorias',()=>{
 const x=api.S.by.get('EF06MA01');
 const conn=api.getSkillConnectionsData(x);
 assert.ok(conn.allNodes.size > 0, 'deve mapear nós relacionados');
 assert.ok(conn.groups.anteriores.length > 0 || conn.groups.posteriores.length > 0 || conn.groups.competencias.length > 0, 'deve agrupar nós em categorias organizadas');
});
test('a seleção do chip de etapa no catálogo possui estilo de destaque visual perceptível',()=>{
 const refinoCss = fs.readFileSync(path.join(root, 'refino.css'), 'utf8');
 const temaClaroCss = fs.readFileSync(path.join(root, 'tema-claro.css'), 'utf8');
 assert.ok(refinoCss.includes('.stage-chip.is-active') && refinoCss.includes('background:var(--chip-stage'), 'refino.css deve aplicar cor de destaque da etapa no chip ativo');
 assert.ok(refinoCss.includes('font-weight:800'), 'chip ativo de etapa deve ter tipografia em peso 800 para alta legibilidade');
 assert.ok(refinoCss.includes('box-shadow:'), 'chip ativo de etapa deve ter sombra/brilho no dark mode');
 assert.ok(temaClaroCss.includes('.stage-chip.is-active') && temaClaroCss.includes('font-weight:800'), 'tema claro deve manter chip de etapa ativo com peso 800 e destaque');
});

test('a Proposta Detalhes 2 possui nós estáticos, filtros superiores multi-seleção e legenda inferior',()=>{
 const propostaCss = fs.readFileSync(path.join(root, 'proposta-grafo.css'), 'utf8').replace(/\r\n/g, '\n');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
 
 // 1. CSS dos nós deve ser estático (sem animação de pulso ou translação no hover)
 assert.ok(!propostaCss.includes('.graph2-node{cursor:pointer;transition:transform'), 'graph2-node não deve ter transição de transform que cause saltos');
 assert.ok(!propostaCss.includes('animation:hn-pulse 4.5s'), 'graph2-halo não deve pulsar com transform scale');
 assert.ok(!propostaCss.includes('animation:hn-pulse-central'), 'halo central não deve pulsar com transform scale');
 assert.ok(propostaCss.includes('.graph2-map-controls-top'), 'deve conter classe de controles/filtros na parte superior interna do mapa');
 assert.ok(propostaCss.includes('.graph2-map-legend'), 'deve conter classe de legenda na parte inferior do mapa');
 assert.ok(propostaCss.includes('.proposal-graph-page[hidden]') && propostaCss.includes('display:none!important'), 'a página de proposta deve ocultar com display:none!important quando tiver atributo hidden');
 
 // 2. app.js deve conter a barra de filtros no topo do mapa e a legenda na base
 assert.ok(appJs.includes('class="graph2-map-controls-top"'), 'app.js deve renderizar filtros no topo do mapa');
 assert.ok(appJs.includes('class="graph2-map-legend"'), 'app.js deve renderizar legenda explicativa na base do mapa');
 assert.ok(appJs.includes('selectedCats=new Set()'), 'app.js deve suportar multi-seleção de categorias de filtros');
 assert.ok(appJs.includes('habilidadeModalAbrir(nCode)'), 'clique no nó deve abrir modal de detalhes completos');
});
test('o campo de busca desativa o botão nativo cancel-button para evitar dois x',()=>{
 const interactionsCss = fs.readFileSync(path.join(root, 'catalog-interactions.css'), 'utf8');
 assert.ok(interactionsCss.includes('::-webkit-search-cancel-button'), 'deve estilizar ::-webkit-search-cancel-button');
 assert.ok(interactionsCss.includes('display:none!important') || interactionsCss.includes('display: none !important'), 'deve ocultar cancel-button nativo com display:none!important');

 const rowEi = api.ROWS.find(r => r.id === 'ei');
 const viewEi = api.rowView(rowEi);
 const periodHtml = api.rowPeriodChips(rowEi, viewEi);
 assert.ok(periodHtml.includes('type="text"') && periodHtml.includes('inputmode="search"'), 'o input de busca deve usar type="text" com inputmode="search" para evitar que o navegador desenhe um segundo "x" nativo');
});

test('os nós da Proposta Detalhes 2 são agrupados por origem sem sobreposição entre títulos e nós',()=>{
 const x = api.S.by.get('EF06MA01');
 const conn = api.getSkillConnectionsData(x);
 const positions = api.arrangeGraphPositions(x, conn.allNodes, conn.groups);

 assert.ok(positions.size > 5, 'deve posicionar múltiplos nós para EF06MA01');

 // 1. Verificação de agrupamento por quadrante/procedência
 conn.groups.reuna.forEach(n => {
  const pos = positions.get(n.code);
  if (pos) {
   assert.ok(pos.x < 0 && pos.y < 0, 'nós do Reúna devem ficar agrupados no quadrante superior esquerdo (x<0, y<0)');
  }
 });

 conn.groups.cieb.forEach(n => {
  const pos = positions.get(n.code);
  if (pos) {
   assert.ok(pos.x > 0 && pos.y < 0, 'nós do CIEB devem ficar agrupados no quadrante superior direito (x>0, y<0)');
  }
 });

 conn.groups.competencias.forEach(n => {
  const pos = positions.get(n.code);
  if (pos) {
   assert.ok(pos.y < -150, 'competências devem ficar agrupadas no topo (y < -150)');
  }
 });

 // 2. Verificação estrita de não-sobreposição entre nós/títulos
 const entries = [...positions.values()];
 for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
   const a = entries[i];
   const b = entries[j];
   const wA = Math.max(76, (a.node.code?.length || 8) * 9 + 22);
   const wB = Math.max(76, (b.node.code?.length || 8) * 9 + 22);
   const minClearanceX = (wA + wB) / 2 + 10;
   const minClearanceY = 56;
   const dx = Math.abs(b.x - a.x);
   const dy = Math.abs(b.y - a.y);
   const noOverlap = dx >= minClearanceX || dy >= minClearanceY;
   assert.ok(noOverlap, 'nós ' + a.node.code + ' e ' + b.node.code + ' não devem se sobrepor (dx=' + dx + ', dy=' + dy + ')');
  }
 }
});
test('as animações dos fluxos respeitam o sentido pedagógico e a legenda fica fixa na área de visão do mapa',()=>{
 const propostaCss = fs.readFileSync(path.join(root, 'proposta-grafo.css'), 'utf8');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

 // 1. Layout fixo sem rolagem oculta para a legenda permanecer visível
 assert.ok(propostaCss.includes('.proposal-graph-page') && propostaCss.includes('position:fixed'), 'página de proposta deve ser position:fixed cobrindo 100vh');
 assert.ok(propostaCss.includes('.graph2-map-legend'), 'deve conter classe da legenda do mapa');

 // 2. Keyframes direcionais com sentido semântico
 assert.ok(propostaCss.includes('@keyframes graph2-flow-in'), 'deve conter animação inward (do pré-requisito até a habilidade)');
 assert.ok(propostaCss.includes('@keyframes graph2-flow-out'), 'deve conter animação outward (da habilidade até o pós/continuidade)');
 assert.ok(propostaCss.includes('@keyframes graph2-flow-bounce'), 'deve conter animação bounce (vai e volta para interdisciplinar)');

 // 3. Estilização específica por tipo de nó
 assert.ok(propostaCss.includes('.graph2-flow.flow-anteriores'), 'deve conter classe flow-anteriores');
 assert.ok(propostaCss.includes('.graph2-flow.flow-posteriores'), 'deve conter classe flow-posteriores');
 assert.ok(propostaCss.includes('.graph2-flow.flow-interdisciplinar'), 'deve conter classe flow-interdisciplinar');
 assert.ok(propostaCss.includes('.graph2-flow.flow-competencias'), 'deve conter classe flow-competencias');
 assert.ok(propostaCss.includes('.graph2-flow.flow-cieb-comp'), 'deve conter classe flow-cieb-comp para CIEB e Computação');
 assert.ok(propostaCss.includes('0.1 99.9'), 'CIEB/Computação deve usar bolinha com stroke-dasharray pontual');

 // 4. Integração no app.js
 assert.ok(appJs.includes('flow-anteriores'), 'app.js deve classificar nós anteriores com fluxo inward');
 assert.ok(appJs.includes('flow-posteriores'), 'app.js deve classificar nós posteriores com fluxo outward');
 assert.ok(appJs.includes('flow-interdisciplinar'), 'app.js deve classificar nós interdisciplinares com fluxo bounce');
 assert.ok(appJs.includes('flow-competencias'), 'app.js deve classificar competências com fluxo rápido');
 assert.ok(appJs.includes('flow-cieb-comp'), 'app.js deve classificar CIEB e Computação com bolinha');
 assert.ok(appJs.includes('class="legend-row-flows"'), 'legenda deve conter linha explicativa dos fluxos animados');
});

test('o topo da Proposta 2 apresenta a descrição da habilidade em 2 linhas truncadas e abre modal completo ao clicar',()=>{
 const propostaCss = fs.readFileSync(path.join(root, 'proposta-grafo.css'), 'utf8');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

 assert.ok(appJs.includes('class="proposal-skill-desc"'), 'app.js deve renderizar a descrição da habilidade no cabeçalho do grafo');
 assert.ok(propostaCss.includes('.proposal-skill-desc'), 'proposta-grafo.css deve conter seletor da descrição');
 assert.ok(propostaCss.includes('-webkit-line-clamp:2') || propostaCss.includes('-webkit-line-clamp: 2'), 'descrição deve ser truncada em no máximo duas linhas');
 assert.ok(propostaCss.includes('overflow:hidden') || propostaCss.includes('overflow: hidden'), 'descrição deve ocultar texto excedente com overflow hidden');
 assert.ok(appJs.includes('proposalSkillPill') && appJs.includes('habilidadeModalAbrir(x.code)'), 'clique na pílula do topo deve abrir o modal com texto e detalhes completos');
});

test('o botão de Legenda fica na barra de filtros e expande um painel vertical à esquerda da tela',()=>{
 const propostaCss = fs.readFileSync(path.join(root, 'proposta-grafo.css'), 'utf8');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

 assert.ok(appJs.includes('id="proposalLegendToggle"') && appJs.includes('proposal-legend-btn'), 'deve conter botão de toggle da legenda ao lado do grupo de filtros');
 assert.ok(appJs.includes('id="proposalVerticalLegend"'), 'deve conter painel vertical da legenda');
 assert.ok(propostaCss.includes('.graph2-vertical-legend'), 'proposta-grafo.css deve estilizar a legenda vertical');
 assert.ok(propostaCss.includes('left:20px') || propostaCss.includes('left: 18px') || propostaCss.includes('left:22px') || propostaCss.includes('left: 20px'), 'legenda vertical deve ficar posicionada à esquerda da tela');
 assert.ok(appJs.includes('toggleLegend'), 'app.js deve gerenciar a expansão e recolhimento da legenda vertical');
});

test('os cartões e modal do Reúna exibem a sequência da habilidade e os nós no grafo são sub-agrupados por AF, AC e EF',()=>{
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

 // 1. Extração dos subtipos Reúna AF, AC e EF
 assert.ok(appJs.includes('reunaAF:[],reunaAC:[],reunaEF:[]') || appJs.includes('reunaAF: []'), 'estrutura de conexões deve particionar nós Reúna em reunaAF, reunaAC e reunaEF');
 assert.ok(appJs.includes('result.groups.reunaAF.sort'), 'aprendizagens focais devem ser ordenadas crescentemente pela posição na unidade temática');

 // 2. Sub-agrupamento no grafo com nós próximos e compactos
 assert.ok(appJs.includes('layoutCluster(groups.reunaAF'), 'arrangeGraphPositions deve posicionar sub-cluster AF');
 assert.ok(appJs.includes('layoutCluster(groups.reunaAC'), 'arrangeGraphPositions deve posicionar sub-cluster AC');
 assert.ok(appJs.includes('layoutCluster(groups.reunaEF'), 'arrangeGraphPositions deve posicionar sub-cluster EF');

 // 3. Pílulas nos nós e caixa informativa Reúna no modal
 assert.ok(appJs.includes('graph2-sub-pill'), 'nós do grafo devem conter pílula indicativa de subtipo Reúna');
 assert.ok(appJs.includes('hab-dialog-reuna-box'), 'modal deve conter caixa destacada com informações da sequência Reúna');
 assert.ok(appJs.includes('reuna-pill--af'), 'deve estilizar pílula de Aprendizagem Focal');

 // 4. Sequência e unidade nos cartões da página de detalhes
 const x02 = api.S.by.get('EF06LP02');
 assert.ok(x02, 'EF06LP02 deve existir no catálogo');
 const relCards = api.reunaHtml(x02);
 assert.ok(relCards.includes('data-reuna-tipo="AF"') || relCards.includes('data-reuna-tipo="AC"'), 'cartões de relação do Reúna devem conter atributo de tipo Reúna');
});

test('o atalho de detalhes para o Grafo 2.0 usa estilo pill sem herdar back-button e o topo do mapa integra cabeçalho e filtros',()=>{
 const propostaCss = fs.readFileSync(path.join(root, 'proposta-grafo.css'), 'utf8');
 const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

 // 1. Botão de atalho em detalhes
 assert.ok(appJs.includes('proposal-graph-btn proposal-graph-button') && appJs.includes('id="openProposalGraph"'), 'atalho em detalhes deve usar classes proposal-graph-btn e proposal-graph-button');
 assert.ok(!appJs.includes('class="back-button proposal-graph-button"'), 'botão de atalho não deve herdar a classe back-button');
 assert.ok(appJs.includes('Explorar no Grafo') && appJs.includes('proposal-btn-pill'), 'atalho deve usar rótulo "Explorar no Grafo" com pill "2.0"');
 assert.ok(propostaCss.includes('.proposal-graph-btn'), 'proposta-grafo.css deve estilizar o novo botão');
 assert.ok(propostaCss.includes('border-radius:999px') || propostaCss.includes('border-radius: 999px'), 'novo botão deve usar formato arredondado de pílula');

 // 2. Topo integrado em dois níveis da Proposta 2
 assert.ok(appJs.includes('class="proposal-topbar-primary"'), 'cabeçalho deve ter linha primária com navegação e resumo');
 assert.ok(appJs.includes('class="proposal-skill-divider"'), 'cabeçalho da proposta deve ter divisor vertical entre identificação e descrição');
 assert.ok(propostaCss.includes('.proposal-topbar-primary'), 'proposta-grafo.css deve estilizar a linha primária do cabeçalho');
 assert.ok(propostaCss.includes('.graph2-map-controls-top'), 'sub-barra de filtros deve ser estilizada');
 assert.ok(propostaCss.includes('border-top:1px solid') || propostaCss.includes('border-top: 1px solid'), 'sub-barra de filtros deve estar atracada à base do cabeçalho');
});

