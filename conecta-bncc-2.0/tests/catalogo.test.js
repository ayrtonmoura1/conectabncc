const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,'dados',file),'utf8'));
const original=fs.readFileSync(path.join(root,'app.js'),'utf8');
const instrumented=original.replace(/load\(\);\s*\}\)\(\);\s*$/,'globalThis.catalogApi={normalize,S,ROWS,E,componentLabel,periods,rowView,rowPeriodChips,rowComponentChips,rowItems,card,railMarkup,rowIsOpen};})();');
assert.notEqual(instrumented,original,'Não foi possível preparar o catálogo para verificação');
const sandbox={document:{body:{dataset:{}}},localStorage:{getItem:()=>null},console};
vm.runInNewContext(instrumented,sandbox,{filename:'app.js'});
const api=sandbox.catalogApi;
api.normalize({ei:read('educacao-infantil.json'),ef:read('ensino-fundamental.json'),em:read('ensino-medio.json'),structure:read('estrutura.json'),comp:read('computacao.json'),cieb:read('curriculo_cieb_computacao.json'),ai:read('sugestoes_interdisciplinares_ia.json'),reuna:read('hierarquia_reuna.json')});
const row=id=>api.ROWS.find(r=>r.id===id);
const reset=()=>{api.S.q='';api.S.filter='';api.S.stageFilter='';api.S.rowFilters.clear();api.S.yearFilters.clear();api.S.rowState.clear();};
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
 reset();const r=row('cieb');api.S.rowFilters.set(r.id,'CIEB · Cultura Digital');const view=api.rowView(r),buttons=periodButtons(api.rowPeriodChips(r,view));
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

test('a faixa do CIEB no catálogo inclui o chip de Ensino Médio e filtra as 51 habilidades da etapa',()=>{
 reset();const r=row('cieb');
 api.S.yearFilters.set(r.id,'em');
 const view=api.rowView(r),html=api.rowPeriodChips(r,view),buttons=periodButtons(html);
 const emButton=buttons.find(b=>b.key==='em');
 assert.ok(emButton,'a faixa CIEB deve conter o botão de período Ensino Médio');
 assert.equal(emButton.count,'51','o contador do chip de Ensino Médio do CIEB deve ser 51');
 assert.equal(view.available.length,51,'devem ser exibidas 51 habilidades ao filtrar Ensino Médio no CIEB');
 assert.ok(view.available.every(x=>x.kind==='cieb'&&x.raw?.stage==='Ensino Médio'));
});

test('a faixa do Reúna no catálogo lista apenas as 266 habilidades focais na sequência do Mapa de Foco e os cartões refletem essa condição',()=>{
 reset();
 const r = row('reuna');
 const view = api.rowView(r);
 assert.equal(view.base.length, 266, 'a faixa do Reúna deve conter exatamente 266 habilidades focais');

 // Todas devem ter tipo AF no Reúna
 assert.ok(view.base.every(x => api.S.data.reuna?.[x.code]?.tipo === 'AF'), 'todos os itens da faixa do Reúna devem ser habilidades focais (AF)');

 // A ordem deve iniciar pela Educação Infantil e seguir pelos anos do Ensino Fundamental
 assert.ok(view.base[0].code.startsWith('EI03'), 'primeiro item deve ser da Educação Infantil');
 const firstEf = view.base.find(x => x.code.startsWith('EF01'));
 assert.ok(firstEf, 'deve conter habilidades do 1º ano');

 // Teste da renderização dos cartões para o Reúna
 const focalSkill = api.S.by.get('EF01LP16');
 const cardHtml = api.card(focalSkill, 0, 'reuna');
 assert.ok(cardHtml.includes('Focal 1/6'), 'cartão do Reúna deve indicar a posição focal 1/6');
 assert.ok(!cardHtml.includes('>Habilidade Focal<'), 'cartão do Reúna não deve conter a tag visível Habilidade Focal');
 assert.ok(cardHtml.includes('Campo da vida cotidiana'), 'cartão do Reúna deve conter a unidade temática ou campo');
 assert.ok(!cardHtml.includes('card-foot'), 'cartão do catálogo não deve conter a dica card-foot');
 assert.ok(!cardHtml.includes('Abrir habilidade'), 'cartão do catálogo não deve conter a dica de Abrir habilidade');
 assert.ok(cardHtml.includes('class="skill-card reuna-card"'), 'cartão do Reúna de 1 linha de campo não deve conter reuna-theme-lines-2');

 const focal2Lines = api.S.by.get('EF01LP22');
 const card2Lines = api.card(focal2Lines, 0, 'reuna');
 assert.ok(card2Lines.includes('reuna-theme-lines-2'), 'cartão do Reúna com campo longo deve conter reuna-theme-lines-2');

 const focalMat = api.S.by.get('EF06MA01');
 const cardMat = api.card(focalMat, 0, 'reuna');
 assert.ok(cardMat.includes('Unidade: Números'), 'cartão do Reúna de Matemática deve conter Unidade: Números');
 assert.ok(cardMat.includes('Focal 1/14'), 'cartão de Matemática 6º ano deve indicar posição 1/14');

 const focalPluri = api.S.by.get('EF12LP04');
 const cardPluri = api.card(focalPluri, 0, 'reuna');
 assert.ok(cardPluri.includes('Bloco 1º, 2º ano'), 'cartão plurianual do Reúna deve indicar o agrupamento em bloco');

 const carrosselCss = fs.readFileSync(path.join(root, 'carrossel.css'), 'utf8');
 assert.ok(carrosselCss.includes('.row-track .skill-card.reuna-card .skill-tag--theme'), 'carrossel.css deve estilizar o tema/unidade em até 2 linhas');
 assert.ok(carrosselCss.includes('.row-track .skill-card.reuna-card.reuna-theme-lines-2 .card-text'), 'carrossel.css deve limitar a descrição a 2 linhas quando o tema ocupa 2 linhas');

 // Teste com filtro de período (ex: 1º ano)
 api.S.yearFilters.set(r.id, 'ano1');
 const viewAno1 = api.rowView(r);
 assert.ok(viewAno1.items.length > 0 && viewAno1.items.length < 266, 'filtro por 1º ano deve retornar apenas as focais do 1º ano');
 assert.ok(viewAno1.items.every(x => api.periods(x, r.id).some(p => p.key === 'ano1')));
});

test('as faixas nascem recolhidas com resumo e abrem sozinhas só durante busca ou filtro, com a escolha manual prevalecendo',()=>{
 reset();
 for(const r of api.ROWS)assert.ok(r.resumo&&r.resumo.length>20,r.id+' precisa de um resumo');
 for(const r of api.ROWS)assert.equal(api.rowIsOpen(r,api.rowView(r)),false,r.id+' deve nascer recolhida');

 api.S.q='EF06MA01';
 const finais=row('finais'),ei=row('ei');
 assert.equal(api.rowIsOpen(finais,api.rowView(finais)),true,'a busca abre a faixa que tem resultados');
 assert.equal(api.rowIsOpen(ei,api.rowView(ei)),false,'faixa sem resultados não abre');

 api.S.rowState.set('finais',false);
 assert.equal(api.rowIsOpen(finais,api.rowView(finais)),false,'a escolha manual prevalece sobre a busca');
 reset();
});
