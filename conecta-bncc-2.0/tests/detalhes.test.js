const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'dados', file), 'utf8'));
const original = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const instrumented = original.replace(/load\(\);\s*\}\)\(\);\s*$/, 'globalThis.detailApi={normalize,S,E,relations,detailRelations,detailHeaderHtml,relatedMapListHtml,ciebHtml,aiHtml,reunaHtml};})();');
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

test('as relações são distribuídas sem perder vínculos ou sugestões CIEB já exibidos',()=>{
 for(const code of ['EF06LP03','EF06MA01','EI03ET07','CDEILD01']){
  const x=api.S.by.get(code),original=api.relations(x,Infinity),groups=api.detailRelations(x);
  const curriculum=new Set(groups.curriculo.map(r=>r.item.code)),cieb=new Set(groups.cieb.map(r=>r.item.code));
  for(const r of original)assert.ok((r.item.kind==='cieb'?cieb:curriculum).has(r.item.code),code+' perdeu '+r.item.code);
  assert.ok(groups.curriculo.every(r=>r.item.kind!=='cieb'));
  assert.ok(groups.cieb.every(r=>r.item.kind==='cieb'));
  assert.equal(cieb.size,groups.cieb.length);
  const previous=api.S.data.cieb.filter(y=>y.code!==x.code).map(y=>({y,explicit:(y.bnccLinks||[]).some(h=>h.codigo===x.code),n:[...x._topicWords].filter(w=>y.words.has(w)).length})).filter(o=>o.explicit||o.n>=2).sort((a,b)=>Number(b.explicit)-Number(a.explicit)||b.n-a.n).slice(0,6);
  for(const {y} of previous)assert.ok(cieb.has(y.code),code+' perdeu referência CIEB '+y.code);
  if(groups.cieb.length>6)assert.ok(api.ciebHtml(x,groups.cieb).includes('data-relation-kind="cieb"'));
  if(groups.curriculo.length>6)assert.ok(api.relatedMapListHtml(groups.curriculo).includes('data-relation-kind="curriculo"'));
 }
});

test('o detalhe CIEB mantém competências, práticas, avaliações e códigos BNCC indicados',()=>{
 const x=api.S.by.get('CDEILD01'),groups=api.detailRelations(x),header=api.detailHeaderHtml(x),section=api.ciebHtml(x,groups.cieb);
 for(const item of x.raw.generalCompetencies)assert.ok(header.includes(api.E(item.codigo)));
 for(const text of [...x.raw.practices,...x.raw.evaluations])assert.ok(section.includes(api.E(text)));
 for(const link of x.raw.bnccLinks){if(api.S.by.has(link.codigo))assert.ok(groups.curriculo.some(r=>r.item.code===link.codigo));else assert.ok(header.includes(api.E(link.codigo)));}
});

test('alinhamentos da Educação Infantil e indicações BNCC do CIEB continuam acessíveis',()=>{
 for(const x of api.S.all.filter(item=>item.stage==='EI'&&item.raw?.alinhamento)){
  const groups=api.detailRelations(x),visible=new Set([...groups.curriculo,...groups.cieb].map(r=>r.item.code));
  for(const y of api.S.all.filter(item=>item.code!==x.code&&item.raw?.alinhamento===x.raw.alinhamento))assert.ok(visible.has(y.code),x.code+' perdeu alinhamento '+y.code);
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
 const patched=source.replace('return {mount,detach,refresh(){if(root&&cy)update();}};','return {syncMapNotices,setTestState(r,s,c){root=r;state=s;code=c;}};');
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
