const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,'dados',file),'utf8'));
const original=fs.readFileSync(path.join(root,'app.js'),'utf8');
const instrumented=original.replace(/load\(\);\s*\}\)\(\);\s*$/,'globalThis.catalogApi={normalize,S,ROWS,E,componentLabel,periods,rowView,rowPeriodChips,rowComponentChips};})();');
assert.notEqual(instrumented,original,'Não foi possível preparar o catálogo para verificação');
const sandbox={document:{body:{dataset:{}}},localStorage:{getItem:()=>null},console};
vm.runInNewContext(instrumented,sandbox,{filename:'app.js'});
const api=sandbox.catalogApi;
api.normalize({ei:read('educacao-infantil.json'),ef:read('ensino-fundamental.json'),em:read('ensino-medio.json'),structure:read('estrutura.json'),comp:read('computacao.json'),cieb:read('curriculo_cieb_computacao.json'),ai:read('sugestoes_interdisciplinares_ia.json'),reuna:read('hierarquia_reuna.json')});
const row=id=>api.ROWS.find(r=>r.id===id);
const reset=()=>{api.S.q='';api.S.filter='';api.S.stageFilter='';api.S.rowFilters.clear();api.S.yearFilters.clear();};
const components=html=>[...html.matchAll(/data-component="([^"]*)"/g)].map(m=>m[1]);
const periodButtons=html=>[...html.matchAll(/data-period="([^"]*)" aria-pressed="(true|false)"><span>[^<]*<\/span><span class="component-chip-count">([^<]*)<\/span>/g)].map(m=>({key:m[1],active:m[2]==='true',count:m[3]}));
const expectedComponents=view=>[...new Set(view.available.map(x=>api.E(api.componentLabel(x))))];
const periodKeys=(items,id)=>[...new Set(items.flatMap(x=>api.periods(x,id).map(p=>p.key)))];

test('os chips de todas as faixas seguem a primeira aparição nos cartões',()=>{
 reset();for(const r of api.ROWS){const view=api.rowView(r),componentOrder=components(api.rowComponentChips(r,view)),periodOrder=periodButtons(api.rowPeriodChips(r,view)).map(p=>p.key);
  assert.deepEqual(componentOrder,['',...expectedComponents(view)],r.id+' componentes');
  assert.deepEqual(periodOrder,['',...periodKeys(view.base,r.id)],r.id+' anos e fases');
  if(view.items.length)assert.equal(componentOrder[1],api.E(api.componentLabel(view.items[0])),r.id+' primeiro cartão');
 }
});

test('a escolha de ano mantém os componentes na ordem dos cartões disponíveis',()=>{
 reset();api.S.yearFilters.set('finais','ano6');const r=row('finais'),view=api.rowView(r),html=api.rowPeriodChips(r,view);
 assert.deepEqual(components(api.rowComponentChips(r,view)),['',...expectedComponents(view)]);
 assert.ok(periodButtons(html).find(p=>p.key==='ano6').active);
 assert.ok(view.items.every(x=>api.periods(x,r.id).some(p=>p.key==='ano6')));
});

test('ao escolher uma referência, os anos seguem seus cartões sem remover as outras opções',()=>{
 reset();const r=row('computacao');api.S.rowFilters.set(r.id,'CIEB · Cultura Digital');const view=api.rowView(r),buttons=periodButtons(api.rowPeriodChips(r,view));
 const preferred=periodKeys(view.base.filter(x=>api.componentLabel(x)===view.selected),r.id),all=periodKeys(view.base,r.id);
 assert.deepEqual(buttons.map(p=>p.key),['',...preferred,...all.filter(k=>!preferred.includes(k))]);
 assert.equal(buttons[1].key,'ei-geral');
 assert.ok(api.rowComponentChips(r,view).includes('data-component="CIEB · Cultura Digital" aria-pressed="true"'));
 assert.ok(view.items.every(x=>api.componentLabel(x)===view.selected));
});

test('a ordenação preserva os contadores inclusive para habilidades de mais de um ano',()=>{
 reset();const r=row('iniciais'),view=api.rowView(r),buttons=periodButtons(api.rowPeriodChips(r,view));
 assert.equal(buttons[0].count,view.base.length.toLocaleString('pt-BR'));
 for(const button of buttons.slice(1)){const count=view.base.filter(x=>api.periods(x,r.id).some(p=>p.key===button.key)).length;assert.equal(button.count,count.toLocaleString('pt-BR'),button.key);}
 assert.ok(view.base.some(x=>api.periods(x,r.id).length>1));
});

test('a ordem acompanha a busca e mantém o filtro selecionado',()=>{
 reset();api.S.q='EF06MA01';api.S.rowFilters.set('finais','Matemática');const r=row('finais'),view=api.rowView(r);
 assert.ok(view.items.some(x=>x.code==='EF06MA01'));
 assert.deepEqual(components(api.rowComponentChips(r,view)),['',...expectedComponents(view)]);
 assert.ok(api.rowComponentChips(r,view).includes('data-component="Matemática" aria-pressed="true"'));
 assert.deepEqual(periodButtons(api.rowPeriodChips(r,view)).map(p=>p.key),['',...periodKeys(view.base,r.id)]);
});
