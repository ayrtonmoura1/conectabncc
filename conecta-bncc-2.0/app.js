(() => {
"use strict";
const D="./dados/", VERSION="dados-2026.07.1 · schema-v1.0.0";
const PALETTE=["#60c7b4","#d991f1","#7bb9ff","#f0ad68","#ee83ad","#d8c45f","#a49aff","#7dc9e8","#ef8b75","#9dcc72"];
const COMPONENT_COLORS={
 "Espaços, tempos, quantidades, relações e transformações":"#60c7b4",
 "Traços, sons, cores e formas":"#ee83ad",
 "Matemática":"#d8c45f",
 "Língua Inglesa":"#ef8b75",
 "Matemática e suas Tecnologias":"#d8c45f",
 "CIEB · Tecnologia Digital":"#7dc9e8"
};
const STOP=new Set("a ao as com como da das de do dos e em essa este foi forma há isso mais mas na nas no nos o os ou para pela pelo por que se sem ser sua seu também tem ter um uma é são habilidade habilidades alunos aprendizagem reconhecer desenvolver explorar utilizar identificar analisar".split(" "));
const $=s=>document.querySelector(s), E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])), N=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const S={all:[],by:new Map(),data:{},q:"",filter:"",stageFilter:"",rows:new Map(),rails:new Map(),rowFilters:new Map(),yearFilters:new Map(),relationCache:new Map()};
const RAIL_BATCH=24, RAIL_BUFFER=8, RAIL_MAX_NODES=80, RAIL_FILTER_SLIDE_MS=1000, RELATION_BATCH=30, SEARCH_DELAY=180;
document.body.dataset.theme=localStorage.getItem("conecta-bncc-theme")||"dark";
const colorMap=new Map();
function color(s){if(COMPONENT_COLORS[s])return COMPONENT_COLORS[s];if(!colorMap.has(s)){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;colorMap.set(s,PALETTE[h%PALETTE.length]);}return colorMap.get(s);}
function idx(a,k="id"){return new Map((a||[]).map(x=>[x[k],x]));}
function name(id,m){return m?.get(id)?.nome||m?.get(id)?.texto||id||"";}
function words(s){return new Set(N(s).split(/[^a-z0-9]+/).filter(w=>w.length>3&&!STOP.has(w)));}
function sharedSets(a,b){return [...a].filter(w=>b.has(w));}
function item(code,text,stage,more){return Object.assign({code,text,stage,years:[],discipline:"",area:"",group:"",topic:"",source:null,doc:stage==="Computação"?"BNCC Computação":stage==="CIEB"?"CIEB":"BNCC 2018",kind:"bncc",raw:null},more);}
function flattenCieb(root){
 const out=[];
 for(const etapa of root.etapas||[])for(const ano of etapa.anos||[])for(const eixo of ano.eixos||[])for(const conceito of eixo.conceitos||[])for(const h of conceito.habilidades||[]){
   out.push({code:h.codigo,text:h.descricao,stage:etapa.etapa||"",year:ano.ano||"",axis:eixo.eixo||"",concept:conceito.conceito||"",topic:[eixo.eixo,conceito.conceito].filter(Boolean).join(" · "),practices:h.praticas||[],evaluations:h.avaliacoes||[],bnccLinks:(h.habilidades_bncc||[]).filter(link=>link.codigo),generalCompetencies:(h.competencias_gerais_bncc||[]).filter(link=>link.codigo),materials:h.materiais_referencia||[]});
 }
 return out;
}
function yearLabel(y){if(!y)return "";const value=String(y);return /ano/i.test(value)?value:value+(value.includes("º")?" ano":"º ano");}
function normalize(d){
 const comps=idx(d.structure.componentes_curriculares),areas=idx(d.structure.areas_conhecimento),ctx=idx(d.ef.contextos_organizacao),fields=idx(d.structure.campos_experiencias),bnccCompetencies=idx(d.structure.competencias_especificas),axes=idx(d.comp.eixos),objects=idx(d.comp.objetos_conhecimento),compCompetencies=idx(d.comp.competencias);
 const ages={"ei-grupo-01":"Bebês · EI01","ei-grupo-02":"Crianças bem pequenas · EI02","ei-grupo-03":"Crianças pequenas · EI03"};
 d.ei.objetivos.forEach(x=>{const f=name(x.campo_experiencias,fields);S.all.push(item(x.codigo,x.texto,"EI",{discipline:f,area:"Educação Infantil",group:ages[x.grupo_etario]||x.grupo_etario,topic:f,alignment:x.alinhamento,source:x.fonte,raw:x}));});
 d.ef.habilidades.forEach(x=>{const c=comps.get(x.componente),o=x.organizacao||{},obj=x.objetos_conhecimento||[],contexts=[...(o.campos_atuacao||[]),o.pratica_linguagem,o.unidade_tematica,o.eixo].filter(Boolean);S.all.push(item(x.codigo,x.texto,"EF",{years:x.anos||[],discipline:c?.nome||"Ensino Fundamental",area:areas.get(c?.area)?.nome||"Ensino Fundamental",group:(x.anos||[]).map(n=>n+"º").join(" · "),topic:[...contexts.map(i=>name(i,ctx)),...obj.map(i=>name(i,ctx))].join(" · "),objectIds:obj,contextIds:contexts,source:x.fonte,raw:x}));});
 d.em.habilidades.forEach(x=>{const area=areas.get(x.area)?.nome||"Ensino Médio";S.all.push(item(x.codigo,x.texto,"EM",{discipline:area,area,group:"Ensino Médio",topic:area,competencyIds:x.competencias_especificas||[],competencyNames:(x.competencias_especificas||[]).map(i=>name(i,bnccCompetencies)),source:x.fonte,raw:x}));});
 const compSkills=[...(d.comp.objetivos_ei||[]).map(x=>({...x,years:[],group:ages[x.grupo_etario]||"Educação Infantil"})),...(d.comp.habilidades_ef||[]),...(d.comp.habilidades_em||[])];
 compSkills.forEach(x=>{const axis=name(x.eixo,axes),obj=x.objetos_conhecimento||[],cids=[...(x.competencias_especificas||[]),...(x.competencia?[x.competencia]:[])];S.all.push(item(x.codigo,x.texto,"Computação",{years:x.anos||[],discipline:"Computação",area:"BNCC Computação",group:x.group||((x.anos||[]).map(n=>n+"º").join(" · ")||"Ensino Médio"),topic:[axis,...obj.map(i=>name(i,objects))].filter(Boolean).join(" · "),axisId:x.eixo,objectIds:obj,competencyIds:cids,competencyNames:cids.map(i=>name(i,compCompetencies)),source:x.fonte,raw:x,kind:"computacao"}));});
 S.data={ctx,fields,bnccCompetencies,axes,objects,compCompetencies,structure:d.structure,ai:d.ai.pontes||{},reuna:d.reuna,reunaVisao:d.reunaVisao||null,cieb:flattenCieb(d.cieb)};
 S.data.cieb.forEach(x=>{x.words=words(x.text+" "+x.topic+" "+x.concept);const c=item(x.code,x.text,"CIEB",{years:[],discipline:"CIEB · "+(x.axis||"Computação"),area:"CIEB",group:[x.stage,yearLabel(x.year)].filter(Boolean).join(" · "),topic:x.topic,source:{arquivo:"Currículo de Referência em Tecnologia e Computação · CIEB"},raw:x,kind:"cieb"});S.all.push(c);});
 S.rows.clear();S.relationCache.clear();
 S.all.forEach(x=>{x._textWords=words(x.text);x._topicWords=words(x.text+" "+x.topic);x._search=N([x.code,x.text,x.discipline,x.area,x.topic,x.group].join(" "));if(!S.by.has(x.code))S.by.set(x.code,x);});
}
const ROWS=[{id:"ei",title:"Educação Infantil",sub:"93 objetivos · BNCC 2018"},{id:"iniciais",title:"Anos Iniciais",sub:"1º ao 5º ano"},{id:"finais",title:"Anos Finais",sub:"6º ao 9º ano"},{id:"em",title:"Ensino Médio",sub:"habilidades por área"},{id:"computacao",title:"BNCC Computação",sub:"BNCC Computação · + referências complementares CIEB"},{id:"reuna",title:"Reúna",sub:"referências de organização curricular"}];
function rowItems(id){
 if(S.rows.has(id))return S.rows.get(id);
 const bn=S.all.filter(x=>x.kind==="bncc"),co=S.all.filter(x=>x.kind==="computacao");let result=[];
 if(id==="ei")result=bn.filter(x=>x.stage==="EI");
 else if(id==="iniciais")result=bn.filter(x=>x.stage==="EF"&&x.years.some(n=>n<=5));
 else if(id==="finais")result=bn.filter(x=>x.stage==="EF"&&x.years.some(n=>n>=6));
 else if(id==="em")result=bn.filter(x=>x.stage==="EM");
 else if(id==="computacao")result=co.concat(S.all.filter(x=>x.kind==="cieb"));
 else if(id==="reuna")result=bn.filter(x=>S.data.reuna?.[x.code]);
 S.rows.set(id,result);return result;
}
function rel(a,b){
 const cieb=a.kind==="cieb"?a:b.kind==="cieb"?b:null,other=cieb===a?b:a;
 if(cieb&&(cieb.raw?.bnccLinks||[]).some(link=>link.codigo===other.code))return{type:"Vínculo indicado pelo CIEB",basis:"Esta relação consta no currículo de referência do CIEB. Ela é uma indicação do CIEB, não uma relação formal declarada pela BNCC.",kind:"cieb",score:110};
 const obj=(a.objectIds||[]).filter(x=>(b.objectIds||[]).includes(x));if(obj.length)return{type:"Objeto de conhecimento comum",basis:obj.map(x=>name(x,a.kind==="computacao"?S.data.objects:S.data.ctx)).join(", "),kind:"formal",score:100+obj.length};
 const comps=(a.competencyIds||[]).filter(x=>(b.competencyIds||[]).includes(x));if(comps.length)return{type:"Competência específica comum",basis:comps.map(x=>name(x,S.data.bnccCompetencies.has(x)?S.data.bnccCompetencies:S.data.compCompetencies)).join(", "),kind:"competency",score:90+comps.length};
 if(a.alignment&&a.alignment===b.alignment)return{type:"Alinhamento oficial entre faixas etárias",basis:"A BNCC alinha objetivos do mesmo aspecto na Educação Infantil.",kind:"formal",score:96};
 const context=(a.contextIds||[]).filter(x=>(b.contextIds||[]).includes(x));if(context.length)return{type:"Contexto curricular compartilhado",basis:context.map(x=>name(x,S.data.ctx)).join(", "),kind:"formal",score:60+context.length};
 if(a.kind!==b.kind){const terms=sharedSets(a._textWords,b._textWords);if(terms.length>=2)return{type:"Aproximação temática sugerida",basis:"Temas em comum: "+terms.slice(0,4).join(", ")+". Proposta para exploração pedagógica.",kind:"suggested",score:20+terms.length};}
 if(a.discipline===b.discipline&&a.years.length&&b.years.length&&Math.max(...a.years)<Math.min(...b.years)){const terms=sharedSets(a._topicWords,b._topicWords);if(terms.length>=2)return{type:"Continuidade temática sugerida",basis:"Termos relacionados: "+terms.slice(0,4).join(", ")+". Não é pré-requisito formal.",kind:"suggested",score:15+terms.length};}
 return null;
}
function relations(x,max=12){
 let r=S.relationCache.get(x.code);
 if(r){S.relationCache.delete(x.code);S.relationCache.set(x.code,r);}
 else{r=[];for(const y of S.all){if(y.code===x.code)continue;const z=rel(x,y);if(z)r.push({item:y,rel:z});}r.sort((a,b)=>b.rel.score-a.rel.score||a.item.code.localeCompare(b.item.code));S.relationCache.set(x.code,r);if(S.relationCache.size>24)S.relationCache.delete(S.relationCache.keys().next().value);}
 if(max<=8&&(x.kind==="bncc"||x.kind==="computacao")){const cieb=r.filter(a=>a.item.kind==="cieb").slice(0,2),other=r.filter(a=>a.item.kind!=="cieb").slice(0,Math.max(0,max-cieb.length));return other.concat(cieb).slice(0,max);}return r.slice(0,max);
}
function matchesStage(x,filter){
 if(!filter)return true;
 const years=(x.years||[]).map(Number),rawYear=parseInt(String(x.raw?.year||""),10),stage=N([x.stage,x.raw?.stage,x.group].filter(Boolean).join(" "));
 if(filter==="ei")return x.stage==="EI"||x.code.startsWith("EI")||stage.includes("infantil");
 if(filter==="iniciais")return (x.stage==="EF"&&years.some(n=>n<=5))||(x.kind==="computacao"&&years.some(n=>n<=5))||stage.includes("anos iniciais")||(x.kind==="cieb"&&rawYear>0&&rawYear<=5);
 if(filter==="finais")return (x.stage==="EF"&&years.some(n=>n>=6))||(x.kind==="computacao"&&years.some(n=>n>=6&&n<=9))||stage.includes("anos finais")||(x.kind==="cieb"&&rawYear>=6&&rawYear<=9);
 if(filter==="em")return x.stage==="EM"||x.code.startsWith("EM")||stage.includes("ensino medio");
 if(filter==="computacao")return x.kind==="computacao"||x.kind==="cieb";
 if(filter==="reuna")return !!S.data.reuna?.[x.code];
 return true;
}
function filtered(a){const q=N(S.q.trim()),f=S.filter;return a.filter(x=>(!f||x.discipline===f||x.area===f)&&matchesStage(x,S.stageFilter)&&(!q||x._search.includes(q)));}
function componentLabel(x){
 if(x.kind==="computacao")return x.axisId?name(x.axisId,S.data.axes):"Competências do Ensino Médio";
 return x.discipline||x.area||"Outros";
}
function card(x,railIndex){
 const component=componentLabel(x),co=color(component);
 return '<article class="skill-card" role="button" tabindex="-1" aria-hidden="true" aria-label="Abrir '+E(x.code)+': '+E(x.text)+'" data-code="'+E(x.code)+'" data-rail-index="'+E(railIndex)+'" style="--accent:'+co+'"><div class="card-top"><span class="skill-code">'+E(x.code)+'</span><span class="skill-group">'+E(x.group||x.doc||"BNCC")+'</span></div><div class="card-identity"><span class="skill-tag">'+E(component)+'</span></div><p class="card-text">'+E(x.text)+'</p><div class="card-foot"><span>Abrir habilidade</span><span aria-hidden="true">↗</span></div></article>';
}
function shortcuts(){ $("#stageShortcuts").innerHTML=ROWS.filter(x=>document.getElementById("row-"+x.id)).map(x=>'<button class="stage-chip" data-scroll="'+x.id+'">'+E(x.title)+'</button>').join("");}
function periods(x,rowId){
 const result=[];
 if(x.stage==="EI"||x.code.startsWith("EI")){const m=x.code.match(/^EI(0[123])/);if(m){const labels={"01":"Bebês","02":"Crianças bem pequenas","03":"Crianças pequenas"};result.push({key:"ei"+m[1],label:labels[m[1]],order:Number(m[1])});}}
 else if(x.kind==="cieb"&&/infantil/i.test(x.raw.stage))result.push({key:"ei-geral",label:"Educação Infantil",order:4});
 let years=x.years||[];
 if(x.kind==="cieb"&&x.raw.year){const n=parseInt(x.raw.year,10);if(n)years=[n];}
 years.forEach(n=>{n=Number(n);if(n>=1&&n<=9&&(rowId!=="iniciais"||n<=5)&&(rowId!=="finais"||n>=6))result.push({key:"ano"+n,label:n+"º ano",order:10+n});});
 if(x.stage==="EM"||x.code.startsWith("EM"))result.push({key:"em",label:"Ensino Médio",order:30});
 return result;
}
function rowView(row){
 const base=filtered(rowItems(row.id)),period=S.yearFilters.get(row.id)||"",available=period?base.filter(x=>periods(x,row.id).some(p=>p.key===period)):base,selected=S.rowFilters.get(row.id)||"";
 return {base,period,available,selected,items:selected?available.filter(x=>componentLabel(x)===selected):available};
}
function rowPeriodChips(row,view){
 const counts=new Map();view.base.forEach(x=>periods(x,row.id).forEach(p=>{const entry=counts.get(p.key)||{...p,count:0};entry.count++;counts.set(p.key,entry);}));
 if(!counts.size)return "";
 const ordered=new Set(),matching=view.selected?view.base.filter(x=>componentLabel(x)===view.selected):view.base;
 matching.forEach(x=>periods(x,row.id).forEach(p=>ordered.add(p.key)));counts.forEach((_,key)=>ordered.add(key));
 const button=(key,label,count)=>'<button type="button" class="component-chip period-chip'+(view.period===key?' active':'')+'" data-row-period="'+E(row.id)+'" data-period="'+E(key)+'" aria-pressed="'+String(view.period===key)+'"><span>'+E(label)+'</span><span class="component-chip-count">'+count.toLocaleString("pt-BR")+'</span></button>';
 return '<div class="row-periods"><div class="component-rail"><button type="button" class="component-arrow component-arrow-prev" data-component-direction="-1" aria-label="Ver anos ou fases anteriores" hidden>‹</button><div class="row-component-list" role="group" aria-label="Anos e fases em '+E(row.title)+'">'+button("","Todos",view.base.length)+[...ordered].map(key=>counts.get(key)).map(p=>button(p.key,p.label,p.count)).join("")+'</div><button type="button" class="component-arrow component-arrow-next" data-component-direction="1" aria-label="Ver mais anos ou fases" hidden>›</button></div></div>';
}
function rowComponentChips(row,view){
 const counts=new Map();
 view.available.forEach(x=>{const label=componentLabel(x);counts.set(label,(counts.get(label)||0)+1);});
 if(view.selected&&!counts.has(view.selected))counts.set(view.selected,0);
 const labels={ei:"Campos de experiência",iniciais:"Componentes",finais:"Componentes",em:"Áreas de conhecimento",computacao:"Eixos e referências",reuna:"Componentes e áreas"};
 const label=labels[row.id]||"Componentes";
 const button=(name,count)=>'<button type="button" class="component-chip'+(view.selected===name?' active':'')+'" data-row-component="'+E(row.id)+'" data-component="'+E(name)+'" aria-pressed="'+String(view.selected===name)+'"'+(name?' style="--chip-accent:'+color(name)+'"':'')+'><span class="component-chip-dot" aria-hidden="true"></span><span>'+E(name||"Todos")+'</span><span class="component-chip-count">'+count.toLocaleString("pt-BR")+'</span></button>';
 return '<div class="row-components"><span class="row-components-label">'+E(label)+'</span><div class="component-rail"><button type="button" class="component-arrow component-arrow-prev" data-component-direction="-1" aria-label="Ver componentes anteriores" hidden>‹</button><div class="row-component-list" role="group" aria-label="'+E(label+' em '+row.title)+'">'+button("",view.available.length)+[...counts.entries()].map(([name,count])=>button(name,count)).join("")+'</div><button type="button" class="component-arrow component-arrow-next" data-component-direction="1" aria-label="Ver mais componentes" hidden>›</button></div></div>';
}
function railItemIndex(index,count){return count>0?((index%count)+count)%count:-1;}
function createRailState(items){const loop=items.length>1;return {items,loop,start:loop?-RAIL_BUFFER:0,end:loop?RAIL_BATCH:items.length,initialized:false,track:null,frame:null,animationFrame:null,trimTimer:null,savedPosition:null};}
function railMarkup(rail,start,end){if(!rail.items.length)return "";let html="";for(let i=start;i<end;i++)html+=card(rail.items[railItemIndex(i,rail.items.length)],i);return html;}
function makeRow(row,view){
 const sec=document.createElement("section"),list=view.items,rail=createRailState(list);
 S.rails.set(row.id,rail);sec.className="catalog-row";sec.id="row-"+row.id;
 const count=list.length.toLocaleString("pt-BR")+(list.length===1?" item":" itens")+(view.selected?" · "+view.available.length.toLocaleString("pt-BR")+" no total":"");
 const empty=view.selected?"Nenhuma habilidade neste componente com os filtros atuais. Selecione Todos para voltar à faixa.":"Nenhum resultado nesta faixa.";
 sec.innerHTML='<div class="row-head"><div class="row-heading-main"><h3>'+E(row.title)+'</h3>'+rowPeriodChips(row,view)+'</div><span class="row-meta row-item-count">'+E(count)+'</span></div>'+rowComponentChips(row,view)+'<div class="row-rail"><button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Cartões anteriores"'+(!rail.loop?' hidden':'')+'>‹</button><div class="row-track" role="region" aria-label="Habilidades de '+E(row.title)+'. Use as setas do teclado para navegar." data-rail="'+E(row.id)+'">'+(list.length?railMarkup(rail,rail.start,rail.end):'<div class="empty-row">'+E(empty)+'</div>')+'</div><button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximos cartões"'+(!rail.loop?' hidden':'')+'>›</button></div>';
 return sec;
}
function updateResultCount(){
 const seen=new Set();ROWS.forEach(row=>rowView(row).items.forEach(x=>seen.add(x.code)));
 $("#resultCount").textContent=seen.size.toLocaleString("pt-BR")+(seen.size===1?" habilidade":" habilidades");
}
function render(){
 const root=$("#catalogRows");root.innerHTML="";S.rails.clear();
  ROWS.forEach(row=>{const view=rowView(row);if((S.filter||S.stageFilter||S.q.trim())&&!view.base.length)return;root.append(makeRow(row,view));});
 if(!root.children.length)root.innerHTML='<div class="catalog-empty"><strong>Nenhuma habilidade encontrada.</strong><p>Experimente outro termo ou limpe os filtros para voltar ao catálogo.</p></div>';
 updateResultCount();shortcuts();requestAnimationFrame(()=>{initializeRails(root);syncComponentArrows(root);});
}
function jumpRail(track,left){const behavior=track.style.scrollBehavior;track.style.scrollBehavior="auto";track.scrollLeft=left;track.style.scrollBehavior=behavior;}
function railFor(track){const rail=S.rails.get(track.dataset.rail);return rail&&rail.track===track?rail:null;}
function cancelRailAnimation(track){const rail=railFor(track);if(rail&&rail.animationFrame!==null){cancelAnimationFrame(rail.animationFrame);rail.animationFrame=null;}}
function animateRailTo(track,target,duration=RAIL_FILTER_SLIDE_MS){
 const rail=railFor(track);if(!rail)return;cancelRailAnimation(track);const start=track.scrollLeft;let startedAt=null;
 const frame=timestamp=>{if(railFor(track)!==rail||!track.isConnected){rail.animationFrame=null;return;}if(startedAt===null)startedAt=timestamp;const progress=Math.min(1,(timestamp-startedAt)/duration),eased=progress*progress*(3-2*progress);jumpRail(track,start+(target-start)*eased);if(progress<1)rail.animationFrame=requestAnimationFrame(frame);else{rail.animationFrame=null;jumpRail(track,target);syncRailA11y(track);}};
 rail.animationFrame=requestAnimationFrame(frame);
}
function syncRailA11y(track){
 const cards=Array.from(track.querySelectorAll(".skill-card"));if(!cards.length)return;
 const bounds=track.getBoundingClientRect(),active=document.activeElement,focused=cards.includes(active)?active:null;
 const visible=cards.filter(c=>{const r=c.getBoundingClientRect();return r.right>bounds.left+1&&r.left<bounds.right-1;}),visibleSet=new Set(visible),tabStop=focused||visible[0]||cards[0],seen=new Set(focused?[focused.dataset.code]:[]);
 cards.forEach(c=>{const shown=c===focused||(visibleSet.has(c)&&!seen.has(c.dataset.code));if(shown&&c!==focused)seen.add(c.dataset.code);c.setAttribute("aria-hidden",String(!shown));c.tabIndex=c===tabStop?0:-1;});
}
function initializeRail(track,options={}){
 const rail=S.rails.get(track.dataset.rail);if(!rail||!track.isConnected||!track.clientWidth)return;
 if(rail.track!==track){rail.track=track;rail.initialized=false;}
 if(!rail.initialized){
  if(rail.loop){const first=track.querySelector('[data-rail-index="0"]');if(!first)return;const padding=parseFloat(getComputedStyle(track).paddingLeft)||0,offset=track.scrollLeft+first.getBoundingClientRect().left-track.getBoundingClientRect().left-padding;for(let i=0;i<3&&track.scrollWidth-track.clientWidth<offset+200;i++)appendRail(track);if(options.animateStart&&offset>1&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){const previous=track.querySelector('[data-rail-index="-1"]'),step=previous?first.getBoundingClientRect().left-previous.getBoundingClientRect().left:0;jumpRail(track,Math.max(0,offset-step));animateRailTo(track,offset,RAIL_FILTER_SLIDE_MS);}else jumpRail(track,offset);}
  rail.initialized=true;
 }
 if(rail.savedPosition){const saved=rail.savedPosition,anchor=track.querySelector('[data-rail-index="'+saved.index+'"]');if(anchor)jumpRail(track,track.scrollLeft+anchor.getBoundingClientRect().left-track.getBoundingClientRect().left-saved.offset);rail.savedPosition=null;}
 syncRailA11y(track);
}
function initializeRails(scope){scope.querySelectorAll(".row-track").forEach(track=>{initializeRail(track);scheduleRail(track);});}
function rememberRailPositions(){S.rails.forEach(rail=>{const track=rail.track;if(!rail.initialized||!track?.isConnected||!track.clientWidth)return;const bounds=track.getBoundingClientRect(),anchor=Array.from(track.querySelectorAll(".skill-card")).find(c=>c.getBoundingClientRect().right>bounds.left+1);if(anchor)rail.savedPosition={index:anchor.dataset.railIndex,offset:anchor.getBoundingClientRect().left-bounds.left};});}
function appendRail(track){
 const rail=railFor(track);if(!rail?.loop)return false;const end=rail.end+RAIL_BATCH;
 track.insertAdjacentHTML("beforeend",railMarkup(rail,rail.end,end));rail.end=end;return true;
}
function prependRail(track){
 const rail=railFor(track),anchor=track.querySelector(".skill-card");if(!rail?.loop||!anchor)return false;const left=anchor.getBoundingClientRect().left,start=rail.start-RAIL_BATCH;
 track.insertAdjacentHTML("afterbegin",railMarkup(rail,start,rail.start));rail.start=start;jumpRail(track,track.scrollLeft+anchor.getBoundingClientRect().left-left);return true;
}
function ensureRailBuffer(track,direction=0,distance=0){
 const rail=railFor(track);if(!rail?.loop)return;const margin=Math.max(420,Math.min(track.clientWidth,1800))+distance;
 if(direction<=0)for(let i=0;i<3&&track.scrollLeft<margin;i++)prependRail(track);
 if(direction>=0)for(let i=0;i<3&&track.scrollWidth-track.clientWidth-track.scrollLeft<margin;i++)appendRail(track);
}
function trimRail(track){
 const rail=railFor(track);if(!rail?.loop)return;let cards=Array.from(track.querySelectorAll(".skill-card")),excess=cards.length-RAIL_MAX_NODES;if(excess<=0)return;
 const bounds=track.getBoundingClientRect(),margin=Math.max(track.clientWidth,500),active=document.activeElement;let remove=0;
 while(remove<excess&&cards[remove]!==active&&cards[remove].getBoundingClientRect().right<bounds.left-margin)remove++;
 if(remove){const anchor=cards[remove],left=anchor.getBoundingClientRect().left;cards.slice(0,remove).forEach(c=>c.remove());rail.start+=remove;jumpRail(track,track.scrollLeft+anchor.getBoundingClientRect().left-left);cards=cards.slice(remove);excess-=remove;}
 remove=0;while(remove<excess&&cards[cards.length-1-remove]!==active&&cards[cards.length-1-remove].getBoundingClientRect().left>bounds.right+margin)remove++;
 if(remove){cards.slice(-remove).forEach(c=>c.remove());rail.end-=remove;}
}
function scheduleRail(track){
 const rail=railFor(track);if(!rail||!track.isConnected||!track.clientWidth||rail.frame!==null)return;
 rail.frame=requestAnimationFrame(()=>{rail.frame=null;if(railFor(track)!==rail||!track.isConnected||!track.clientWidth)return;ensureRailBuffer(track);if(track.querySelectorAll(".skill-card").length>RAIL_MAX_NODES+RAIL_BATCH*2)trimRail(track);syncRailA11y(track);clearTimeout(rail.trimTimer);rail.trimTimer=setTimeout(()=>{rail.trimTimer=null;if(railFor(track)!==rail||!track.isConnected||!track.clientWidth)return;trimRail(track);syncRailA11y(track);},180);});
}
function scrollRailBy(track,distance){cancelRailAnimation(track);if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)jumpRail(track,track.scrollLeft+distance);else track.scrollBy({left:distance,behavior:"smooth"});}
function moveRail(track,direction){cancelRailAnimation(track);initializeRail(track);const rail=railFor(track);if(!rail?.loop)return;const distance=Math.max(420,track.clientWidth*.72);ensureRailBuffer(track,direction,distance);scrollRailBy(track,direction*distance);scheduleRail(track);}
function moveRailFocus(track,current,direction){
 cancelRailAnimation(track);initializeRail(track);const rail=railFor(track);if(!rail?.loop)return;const next=Number(current.dataset.railIndex)+direction;
 if(next<rail.start)prependRail(track);if(next>=rail.end)appendRail(track);
 const target=track.querySelector('[data-rail-index="'+next+'"]');if(!target)return;current.tabIndex=-1;target.removeAttribute("aria-hidden");target.tabIndex=0;target.focus({preventScroll:true});
 const box=target.getBoundingClientRect(),bounds=track.getBoundingClientRect(),delta=box.left<bounds.left?box.left-bounds.left-8:box.right>bounds.right?box.right-bounds.right+8:0;if(delta)scrollRailBy(track,delta);scheduleRail(track);
}
function syncComponentArrows(scope){
 scope.querySelectorAll(".component-rail").forEach(rail=>{
   const list=rail.querySelector(".row-component-list"),left=rail.querySelector(".component-arrow-prev"),right=rail.querySelector(".component-arrow-next");
   if(!list||!left||!right)return;
   left.hidden=list.scrollLeft<=1;
   right.hidden=list.scrollLeft+list.clientWidth>=list.scrollWidth-2;
 });
}
function fillFilters(){
 const vals=new Map();S.all.forEach(x=>{if(x.discipline)vals.set(x.discipline,x.discipline);if(x.area&&x.area!==x.discipline)vals.set(x.area,x.area);});
  $("#areaSelect").innerHTML='<option value="">Todas as áreas e componentes curriculares</option>'+[...vals].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR")).map(([v,l])=>'<option value="'+E(v)+'">'+E(l)+'</option>').join("");
}
function open(code){if(!S.by.has(code))return;if(!$("#catalogPage").hidden){S.catalogScroll=window.scrollY;rememberRailPositions();}history.pushState({code},"","?codigo="+encodeURIComponent(code));detail(code);window.scrollTo({top:0,behavior:"instant"});}
function home(restore=true){SkillGraph.detach();history.pushState({},"",location.pathname);$("#detailPage").hidden=true;$("#detailPage").classList.remove("has-compact-summary");$("#catalogPage").hidden=false;requestAnimationFrame(()=>initializeRails($("#catalogRows")));window.scrollTo({top:restore?(S.catalogScroll||0):0,behavior:"instant"});}
function syncDetailStickySummary(){
 const page=$("#detailPage"),summary=page?.querySelector(".detail-sticky-summary"),title=page?.querySelector(".detail-title");
 if(!page||page.hidden||!summary||!title)return;
 const mobile=window.matchMedia("(max-width:640px)").matches,barTop=mobile?0:($(".topbar")?.getBoundingClientRect().bottom||68),visible=title.getBoundingClientRect().bottom<=barTop+4;
 summary.hidden=!visible;summary.setAttribute("aria-hidden",String(!visible));page.classList.toggle("has-compact-summary",visible);
}
function detailHeaderHtml(x){
 const raw=x.raw||{},source=x.source||{},sourceTitle=x.kind==="cieb"?"Currículo de Referência em Tecnologia e Computação · CIEB":x.kind==="computacao"?"Complemento de Computação à BNCC · Parecer CNE/CEB nº 2/2022":"Base Nacional Comum Curricular · 2018",sourceSummary=[...new Set([sourceTitle,source.arquivo,source.localizador,source.localizador_pdf,source.proveniencia,x.kind!=="cieb"?VERSION:null].filter(Boolean))].join(" · "),facts=[["Etapa e recorte",x.group||x.stage],["Componente curricular",x.discipline],["Área de conhecimento",x.area&&x.area!==x.discipline?x.area:null],["Seriação",raw.seriacao],["Vigência",raw.vigencia?.status?raw.vigencia.status+(raw.vigencia.desde?" · desde "+raw.vigencia.desde:"")+(raw.vigencia.ate?" · até "+raw.vigencia.ate:""):null],["Documento de origem",sourceSummary]].filter(r=>r[1]);
 const contexts=[],seen=new Set(),add=(kind,value)=>{if(!value)return;const key=kind+"|"+value;if(seen.has(key))return;seen.add(key);contexts.push([kind,value]);};
 (raw.objetos_conhecimento||[]).forEach(id=>add("Objeto de conhecimento",name(id,x.kind==="computacao"?S.data.objects:S.data.ctx)));
 const organization=raw.organizacao||{},typedContextIds=new Set();
 (organization.campos_atuacao||[]).forEach(id=>{typedContextIds.add(id);add("Campo de atuação",name(id,S.data.ctx));});
 [["Prática de linguagem",organization.pratica_linguagem],["Unidade temática",organization.unidade_tematica],["Eixo curricular",organization.eixo]].forEach(([kind,id])=>{if(id){typedContextIds.add(id);add(kind,name(id,S.data.ctx));}});
 (x.contextIds||[]).filter(id=>!typedContextIds.has(id)).forEach(id=>add("Contexto curricular",name(id,S.data.ctx)));
 if(raw.eixo)add("Eixo da Computação",name(raw.eixo,S.data.axes));
 if(raw.campo_experiencias)add("Campo de experiências",name(raw.campo_experiencias,S.data.fields));
 if(raw.concept)add("Conceito CIEB",raw.concept);
 const ids=[...(raw.competencias_especificas||[]),...(raw.competencia?[raw.competencia]:[])];
 ids.forEach(id=>{const c=S.data.bnccCompetencies.get(id)||S.data.compCompetencies.get(id);add("Competência "+(c?.numero||"relacionada"),c?.texto||name(id,S.data.compCompetencies));});
 if(!ids.length&&x.stage==="EF")add("Vínculo a competências","A fonte não declara competência específica por habilidade para esta etapa.");
 if(x.kind==="cieb"){
  if(raw.generalCompetencies?.length)add("Competências gerais indicadas pelo CIEB",raw.generalCompetencies.map(h=>h.codigo).join(", "));
  const missing=(raw.bnccLinks||[]).filter(h=>!S.by.has(h.codigo));if(missing.length)add("Códigos BNCC indicados pelo CIEB sem registro no catálogo",missing.map(h=>h.codigo).join(", "));
 }
 if(raw.alinhamento)add("Alinhamento entre faixas",raw.alinhamento);
 const factHtml=facts.map(([label,value])=>{const isSource=label==="Documento de origem",href=x.kind==="cieb"?"https://curriculo.cieb.net.br/":"https://github.com/bncc-dev/bncc-dados",credit=x.kind==="cieb"?"Currículo de referência do CIEB":"Dados estruturados: bncc.dev (mantido pela Profy), CC BY 4.0";return '<div class="detail-header-fact'+(isSource?' detail-header-fact-source" id="detalhe-fonte':'')+'"><span>'+E(label)+'</span><strong>'+E(value)+'</strong>'+(isSource?'<a class="detail-header-source-link" href="'+href+'" target="_blank" rel="noopener noreferrer">'+E(credit)+' ↗</a>':'')+'</div>';}).join("");
 const contextHtml=contexts.length?'<div class="detail-header-contexts"><span class="detail-header-label">Contextos e competências</span><ul>'+contexts.map(([label,value])=>'<li><span>'+E(label)+'</span><strong>'+E(value)+'</strong></li>').join("")+'</ul></div>':'<p class="detail-header-empty">A fonte não informa contextos adicionais para este registro.</p>';
 return '<section class="detail-header-info" id="detalhe-organizacao" aria-label="Enquadramento curricular"><div class="detail-header-info-title"><span>ENQUADRAMENTO CURRICULAR</span><a href="./documentacao.html">Documentação das fontes <b aria-hidden="true">↗</b></a></div><div class="detail-header-facts">'+factHtml+'</div>'+contextHtml+'</section>';
}
function relationCard({item:y,rel:z}){return '<a class="relation-card" href="?codigo='+encodeURIComponent(y.code)+'" data-code="'+E(y.code)+'"><span class="origin-label">'+(z.kind==="suggested"?"Sugestão temática":z.kind==="cieb"?"Vínculo indicado pelo CIEB":"Referência em comum")+'</span><span class="rel-code">'+E(y.code)+'</span><span class="rel-type">'+E(y.discipline)+' · '+E(z.type)+'</span><p>'+E(y.text)+'</p><p class="relation-basis">'+E(z.basis)+'</p></a>';}
function relatedListHtml(list,kind,empty){const cards=list.slice(0,6).map(relationCard).join(""),remaining=Math.max(0,list.length-6);return '<div class="relation-grid">'+(cards||'<p class="empty-message">'+E(empty)+'</p>')+'</div>'+(remaining?'<details class="more-relations" data-relation-kind="'+E(kind)+'"><summary>Ver mais '+remaining+' habilidades relacionadas</summary><div class="relation-grid" data-relation-grid></div><button class="load-more-relations" type="button">Carregar mais</button></details>':"");}
function ciebRelations(x,related){
 const items=new Map(related.filter(r=>r.item.kind==="cieb").map(r=>[r.item.code,r])),byCode=new Map(S.all.filter(y=>y.kind==="cieb").map(y=>[y.code,y]));
 for(const y of S.data.cieb){if(y.code===x.code||items.has(y.code))continue;const item=byCode.get(y.code);if(!item)continue;const explicit=(y.bnccLinks||[]).some(h=>h.codigo===x.code),terms=[...x._topicWords].filter(w=>y.words.has(w));if(!explicit&&terms.length<2)continue;items.set(y.code,{item,rel:explicit?{kind:"cieb",type:"Vínculo indicado pelo CIEB",basis:"Esta relação consta no currículo de referência do CIEB.",score:110}:{kind:"suggested",type:"Aproximação temática sugerida",basis:"Temas em comum: "+terms.slice(0,4).join(", ")+". Proposta para exploração pedagógica.",score:20+terms.length}});}
 return [...items.values()].sort((a,b)=>b.rel.score-a.rel.score||a.item.code.localeCompare(b.item.code));
}
function detailRelations(x){const related=relations(x,Infinity);return {curriculo:related.filter(r=>r.item.kind!=="cieb"),cieb:ciebRelations(x,related)};}
function relatedMapListHtml(related){return '<div class="map-related-list"><h3 class="related-heading">Habilidades BNCC e Computação <span>'+related.length+'</span></h3>'+relatedListHtml(related,"curriculo","Não encontramos conexões com habilidades BNCC ou Computação.")+'</div>';}
function mapWorkspaceHtml(x,related){
 const graph=x.kind!=="cieb"?'<div id="detalhe-grafo"><div class="loading-state" role="status">Carregando grafo local…</div></div>':'';
 return '<section class="detail-section map-workspace" id="detalhe-mapas"><div class="section-heading"><span class="section-number">⌘</span><div><h2>Mapas</h2><p class="section-caption">Explore a progressão curricular e as conexões desta habilidade em diferentes visualizações.</p></div></div>'+graph+relatedMapListHtml(related)+'</section>';
}
function aiHtml(x){const entry=S.data.ai[x.code];if(!entry?.por_componente)return "";const groups=Object.entries(entry.por_componente).filter(([,d])=>d&&((d.codigos||[]).length||d.justificativa||d.atividade));
 return '<section class="detail-section" id="detalhe-interdisciplinar"><div class="section-heading"><span class="section-number">↗</span><div><h2>Sugestões interdisciplinares</h2><p class="section-caption">Possibilidades geradas por IA para apoiar o planejamento e a revisão docente.</p></div></div>'+((entry.conceitos||[]).length?'<div class="concept-group"><h3>Conceitos de aproximação</h3><ul class="concept-grid">'+entry.conceitos.map(t=>'<li>'+E(t)+'</li>').join("")+'</ul></div>':"")+'<div class="relation-grid">'+groups.map(([component,d])=>{const codes=[...new Set(d.codigos||[])];return '<article class="ai-card" data-ai-component="'+E(component)+'"><span class="origin-label">SUGESTÃO DE IA</span><h3 class="ai-card-component">'+E(component)+'</h3>'+(codes.length?'<div class="ai-card-codes" aria-label="Habilidades sugeridas">'+codes.map(code=>S.by.has(code)?'<a class="rel-code" href="?codigo='+encodeURIComponent(code)+'" data-code="'+E(code)+'">'+E(code)+'</a>':'<span class="rel-code">'+E(code)+'</span>').join("")+'</div>':'')+(d.confianca?'<span class="rel-type">Confiança informada: '+E(d.confianca)+'</span>':"")+'<p>'+E(d.justificativa||"Relação sugerida na base interdisciplinar.")+'</p>'+(d.atividade?'<details class="activity-detail"><summary>Ver sugestão de atividade</summary><p>'+E(d.atividade)+'</p></details>':"")+'</article>';}).join("")+'</div></section>';}
function ciebHtml(x,list){const raw=x.raw||{},guidance=x.kind==="cieb"?[["Práticas sugeridas",raw.practices||[]],["Avaliação sugerida",raw.evaluations||[]]].filter(([,items])=>items.length):[],guidanceHtml=guidance.length?'<div class="detail-columns cieb-guidance">'+guidance.map(([label,items])=>'<div class="info-block"><h3>'+E(label)+'</h3><ul>'+items.map(t=>'<li>'+E(t)+'</li>').join("")+'</ul></div>').join("")+'</div>':"";
 return '<section class="detail-section" id="detalhe-cieb"><div class="section-heading"><span class="section-number">↗</span><div><h2>Computação e currículo CIEB</h2><p class="section-caption">Vínculos indicados pelo CIEB e sugestões por termos em comum são identificados em cada cartão.</p></div></div>'+guidanceHtml+'<h3 class="related-heading">Habilidades CIEB relacionadas <span>'+list.length+'</span></h3>'+relatedListHtml(list,"cieb","Nenhuma aproximação temática encontrada para esta habilidade.")+'</section>';}
const REUNA_CLASSES={AF:"Aprendizagem focal (AF)",AC:"Aprendizagem complementar (AC)",EF:"Expectativa de fluência (EF)"};
const REUNA_ETAPAS={EI:"Educação Infantil",EF:"Ensino Fundamental",EM:"Ensino Médio"};
const REUNA_SITE="https://www.institutoreuna.org.br/";
const REUNA_AREA_EF={"Língua Portuguesa":"ef-area-linguagens","Matemática":"ef-area-matematica","Ciências da Natureza":"ef-area-ciencias-da-natureza","Ciências Humanas":"ef-area-ciencias-humanas"};
function reunaEtapa(code){return REUNA_ETAPAS[String(code||"").slice(0,2)]||"";}
function reunaAreaNome(id){const a=((S.data.structure&&S.data.structure.areas_conhecimento)||[]).find(z=>z.id===id);return a?a.nome:(id||"");}
function reunaCeLabel(id){const ce=S.data.bnccCompetencies&&S.data.bnccCompetencies.get(id);return ce?'Competência '+ce.numero+' · '+reunaAreaNome(ce.area):id;}
function reunaTexto(id){const c=S.data.bnccCompetencies&&S.data.bnccCompetencies.get(id);return c?c.texto:"";}
function reunaCgTexto(n){const cg=((S.data.structure&&S.data.structure.competencias_gerais)||[]).find(c=>Number(c.numero)===Number(n));return cg?cg.texto:"";}
function reunaCompRef(sigla,n,area,code){
 const numero=Number(n),pad=String(numero).padStart(2,"0"),key="c:"+sigla+numero;
 if(sigla==="CG")return {sigla:sigla,numero:numero,nome:"Competência geral",key:key,texto:reunaCgTexto(numero)};
 let id="",nome="Competência específica";
 if(sigla==="CA"){id=(REUNA_AREA_EF[area]||"")+"-ce-"+pad;nome="Competência da área";}
 else if(area==="Língua Portuguesa"){id="ef-comp-lp-ce-"+pad;}
 else if(area==="Ciências Humanas"){id=(String(code||"").indexOf("GE")>=0?"ef-comp-ge-ce-":"ef-comp-hi-ce-")+pad;}
 else {id=(REUNA_AREA_EF[area]||"")+"-ce-"+pad;}
 return {sigla:sigla,numero:numero,nome:nome,key:key,texto:reunaTexto(id)};
}
function reunaCgNumeros(textos){
 const out=[];
 textos.forEach(t=>{const s=String(t||"").toLowerCase();["competência geral","competências gerais"].forEach(k=>{let i=s.indexOf(k);while(i>=0){let j=i+k.length;while(j<s.length&&s[j]===" ")j++;let n="";while(j<s.length&&s[j]>="0"&&s[j]<="9"){n+=s[j];j++;}if(n&&out.indexOf(Number(n))<0)out.push(Number(n));i=s.indexOf(k,i+1);}});});
 return out.sort((a,b)=>a-b);
}
function reunaExpandHab(code,explicacao){
 const item=S.by.get(code),meta=item?[item.discipline,item.group].filter(Boolean).join(" · "):"";
 const rel=explicacao?'<p class="reuna-expand-rel"><strong>Relação com a aprendizagem focal:</strong> '+E(explicacao)+'</p>':"";
 return '<div class="reuna-expand-item" data-key="'+E("h:"+code)+'" hidden><p class="reuna-expand-meta"><strong>'+E(code)+'</strong>'+(meta?' · '+E(meta):'')+'</p><p class="reuna-expand-text">'+E(item?item.text:"Texto não encontrado no catálogo.")+'</p>'+rel+'<a class="reuna-expand-open" href="?codigo='+encodeURIComponent(code)+'" data-code="'+E(code)+'">Abrir página da habilidade <span aria-hidden="true">→</span></a></div>';
}
function reunaCode(code,o){
 o=o||{};
 const cls="reuna-code"+(o.current?" is-current":""),note=o.note?'<small class="reuna-note">'+E(o.note)+'</small>':"";
 if(!S.by.has(code))return '<span class="'+cls+' is-missing" title="Habilidade fora do catálogo">'+E(code)+note+'</span>';
 return '<button type="button" class="'+cls+' reuna-code-btn" data-kind="habilidade" data-key="'+E("h:"+code)+'" data-code="'+E(code)+'" aria-expanded="false" title="Clique para ver a descrição · duplo clique para abrir a habilidade">'+E(code)+note+'</button>';
}
function reunaChipsGroup(codes,o){
 o=o||{};
 const notes=o.notes||{},marks=o.marks||{},expl=o.explicacoes||{};
 const chips=codes.map(c=>reunaCode(c,{current:o.current===c,note:notes[c]})+(marks[c]?'<span class="reuna-mark">'+E(marks[c].join(", "))+'</span>':'')).join("");
 const itens=codes.filter(c=>S.by.has(c)).map(c=>reunaExpandHab(c,expl[c])).join("");
 return '<div class="reuna-interactive"><div class="reuna-codes">'+chips+'</div>'+(itens?'<div class="reuna-expand" hidden>'+itens+'</div>':'')+'</div>';
}
function reunaChips(codes,o){return reunaChipsGroup(codes,o);}
function reunaGroup(titulo,items){
 if(!items.length)return "";
 const notes={};items.forEach(i=>{if(i.note)notes[i.code]=i.note;});
 return '<div class="reuna-group"><p class="reuna-label">'+E(titulo)+' <span class="reuna-count">'+items.length+'</span></p>'+reunaChipsGroup(items.map(i=>i.code),{notes:notes})+'</div>';
}
function reunaCompGroup(refs){
 if(!refs.length)return "";
 const chips=refs.map(r=>'<button type="button" class="reuna-comp reuna-code-btn" data-kind="competencia" data-key="'+E(r.key)+'" aria-expanded="false" title="Clique para ver a descrição">'+E(r.sigla+" "+r.numero)+'</button>').join("");
 const itens=refs.map(r=>'<div class="reuna-expand-item" data-key="'+E(r.key)+'" hidden><p class="reuna-expand-meta"><strong>'+E(r.sigla+" "+r.numero)+'</strong> · '+E(r.nome)+'</p><p class="reuna-expand-text">'+(r.texto?E(r.texto):'Texto não encontrado na estrutura oficial.')+'</p></div>').join("");
 return '<div class="reuna-interactive"><div class="reuna-competencies">'+chips+'</div><div class="reuna-expand" hidden>'+itens+'</div></div>';
}
function reunaCompItems(refs){return refs.map(r=>({rotulo:r.sigla+" "+r.numero,nome:r.nome,texto:r.texto,key:r.key}));}
function reunaDl(items,collapsible){
 return '<dl class="reuna-compdl">'+items.map(it=>{
  const texto=it.texto?E(it.texto):'<span class="reuna-note">Texto não encontrado na estrutura oficial.</span>';
  const nome=it.nome?'<span class="reuna-compname">'+E(it.nome)+'</span>':'';
  if(!collapsible)return '<div class="reuna-compitem"><dt><span class="reuna-cg">'+E(it.rotulo)+'</span>'+nome+'</dt><dd>'+texto+'</dd></div>';
  const key=it.key||("x:"+it.rotulo);
  return '<div class="reuna-compitem reuna-interactive"><dt><button type="button" class="reuna-cg reuna-code-btn" data-kind="competencia" data-key="'+E(key)+'" aria-expanded="false" title="Clique para ver a descrição">'+E(it.rotulo)+'</button>'+nome+'</dt><dd class="reuna-expand" hidden><div class="reuna-expand-item" data-key="'+E(key)+'" hidden><p class="reuna-expand-text">'+texto+'</p></div></dd></div>';
 }).join("")+'</dl>';
}
function reunaBlock(title,inner,cls){return '<div class="reuna-block'+(cls?' '+cls:'')+'"><p class="reuna-label">'+E(title)+'</p>'+inner+'</div>';}
function reunaList(items){return '<ul class="reuna-list">'+items.map(t=>'<li>'+E(t)+'</li>').join("")+'</ul>';}
function reunaParas(items){return items.map(t=>'<p>'+E(t)+'</p>').join("");}
function ptList(a){return a.length>1?a.slice(0,-1).join(", ")+" e "+a[a.length-1]:a.join("");}
function reunaOccurrenceHtml(o,resumo,area,code){
 const comp=o.competencias||{},rel=o.habilidadesRelacionadas||{},expl=o.explicacoesRelacionadas||{},parts=[];
 if(o.conhecimentoPrevio&&o.conhecimentoPrevio.length)parts.push(reunaBlock("Conhecimento prévio",reunaChipsGroup(o.conhecimentoPrevio)));
 if(o.objetivos&&o.objetivos.length)parts.push(reunaBlock("Objetivos de aprendizagem",reunaList(o.objetivos)));
 const refs=[];["CG","CA","CE"].forEach(k=>(comp[k]||[]).forEach(n=>refs.push(reunaCompRef(k,n,area,code))));
 if(refs.length)parts.push(reunaBlock("Competências relacionadas",reunaCompGroup(refs)));
 ["AF","AC","EF"].forEach(k=>{if(rel[k]&&rel[k].length)parts.push(reunaBlock("Relacionadas · "+REUNA_CLASSES[k],reunaChipsGroup(rel[k],{explicacoes:expl})));});
 if(o.comentario)parts.push('<details class="reuna-comment"><summary>Comentário pedagógico</summary><p>'+E(o.comentario)+'</p></details>');
 if(resumo)parts.push('<details class="reuna-comment"><summary>Resumo do ano</summary>'+reunaParas(resumo.texto?[resumo.texto]:[])+(resumo.totais?'<p class="reuna-totais">'+E(resumo.totais)+'</p>':'')+'</details>');
 return '<article class="reuna-occurrence"><header class="reuna-occ-head"><h4>'+E(o.ano)+'</h4><span class="reuna-unit">'+E(o.campoOuUnidade||"—")+'</span></header>'+parts.join("")+'</article>';
}
function reunaMapaHtml(m,visao,code){
 const occ=m.ocorrencias.map(o=>reunaOccurrenceHtml(o,visao?(visao.resumosPorAno||[]).find(z=>z.componente===m.area&&z.ano===o.ano):null,m.area,code)).join("");
 return '<div class="reuna-part-head"><span class="reuna-class reuna-class'+reunaClassModifier(m.classificacao)+'">'+E(reunaClassLabel(m.classificacao))+'</span><p>'+E(m.area)+' · classificação no Mapa de Foco da BNCC</p></div>'+occ;
}
function reunaClassLabel(c){if(c==="AF/AC")return "Foco e complementar (AF/AC)";return String(c||"").split("/").map(s=>REUNA_CLASSES[s.trim()]||s.trim()).filter(Boolean).join(" · ");}
function reunaClassModifier(c){if(c==="AF/AC")return "--mix";const parts=String(c||"").split("/").map(s=>s.trim()).filter(Boolean);return parts.length===1&&REUNA_CLASSES[parts[0]]?"--"+parts[0]:"--mix";}
function reunaCeHtml(bc,c,visao,aberto){
 const oficial=(S.data.bnccCompetencies&&S.data.bnccCompetencies.get(c.competenciaEspecifica))||null;
 const comp=visao?((visao.competenciasEspecificasEM||[]).find(z=>z.id===c.competenciaEspecifica)||null):null;
 const area=oficial?reunaAreaNome(oficial.area):(c.area||"");
 const titulo='Competência específica '+(oficial?oficial.numero:"")+' · '+area;
 const alerta=c.competenciaConfirmadaNaBNCC?"":'<div class="reuna-alert"><p>A planilha comenta esta habilidade nesta competência, mas a BNCC a associa a:</p>'+reunaDl(bc.competenciasEspecificasBNCC.map(id=>({rotulo:reunaCeLabel(id),texto:reunaTexto(id)})),false)+'</div>';
 const sobre=comp&&comp.comentario&&comp.comentario.length?'<details class="reuna-comment reuna-ce-about"><summary>Sobre a competência</summary>'+reunaParas(comp.comentario)+'</details>':"";
 const body=[];
 if(c.comentario&&c.comentario.length)body.push(reunaBlock("Comentário sobre a habilidade",reunaParas(c.comentario),"reuna-prose"));
 const pair=[];
 if(c.objetosDoConhecimento&&c.objetosDoConhecimento.length)pair.push(reunaBlock("Objetos do conhecimento",reunaList(c.objetosDoConhecimento)));
 if(c.exemplosDeObjetivos&&c.exemplosDeObjetivos.length)pair.push(reunaBlock("Exemplos de objetivos de aprendizagem",reunaList(c.exemplosDeObjetivos)));
 if(pair.length)body.push('<div class="reuna-grid-2">'+pair.join("")+'</div>');
 if(c.possibilidadesCurriculares&&c.possibilidadesCurriculares.length)body.push(reunaBlock("Possibilidades para o currículo",reunaList(c.possibilidadesCurriculares)));
 if(c.comentariosDosComponentes&&c.comentariosDosComponentes.length)body.push(reunaBlock("Comentários dos componentes",'<div class="reuna-components">'+c.comentariosDosComponentes.map(p=>'<article class="reuna-component-card"><div class="reuna-tags">'+(p.componentes&&p.componentes.length?p.componentes.map(n=>'<span class="reuna-tag">'+E(n)+'</span>').join(""):'<span class="reuna-tag reuna-tag--geral">Visão geral</span>')+'</div><p>'+E(p.texto)+'</p></article>').join("")+'</div>'));
 const textosCard=[].concat(c.comentario||[],c.objetosDoConhecimento||[],c.exemplosDeObjetivos||[],c.possibilidadesCurriculares||[],(c.comentariosDosComponentes||[]).map(p=>p.texto));
 const cgNums=reunaCgNumeros(textosCard);
 if(cgNums.length)body.push(reunaBlock("Competências gerais citadas nesta competência",reunaDl(reunaCompItems(cgNums.map(n=>reunaCompRef("CG",n,"",""))),true)));
 return '<details class="reuna-ce"'+(aberto?' open':'')+'><summary class="reuna-ce-head"><span class="reuna-ce-title">'+E(titulo)+'</span></summary>'+alerta+(oficial&&oficial.texto?'<blockquote class="reuna-ce-text">'+E(oficial.texto)+'</blockquote>':"")+sobre+body.join("")+'</details>';
}
function reunaComentadaHtml(bc,visao){
 return '<p class="reuna-intro">Comentários da BNCC Comentada para o Ensino Médio, organizados por competência específica. Uma mesma habilidade pode ser comentada em mais de uma competência.</p>'+bc.comentarios.map((c,i)=>reunaCeHtml(bc,c,visao,i===0)).join("");
}
function reunaConexoesHtml(r,m,bc){
 const grupos=[];
 if(m){const em={};m.ocorrencias.forEach(o=>(o.habilidadesEM||[]).forEach(c=>{em[c]=em[c]||[];if(em[c].indexOf(o.ano)<0)em[c].push(o.ano);}));grupos.push(reunaGroup("Ensino Médio · relacionadas no Mapa de Foco",Object.keys(em).sort().map(c=>({code:c,note:em[c].join(" · ")}))));}
 if(r.citadaNaBNCCComentada&&r.citadaNaBNCCComentada.length)grupos.push(reunaGroup("Citada na BNCC Comentada do Ensino Médio",r.citadaNaBNCCComentada.map(c=>({code:c,note:""}))));
 if(r.citadaNoMapaDeFoco&&r.citadaNoMapaDeFoco.length)grupos.push(reunaGroup("Citada no Mapa de Foco do Ensino Fundamental",r.citadaNoMapaDeFoco.map(z=>({code:z.codigo,note:z.ano}))));
 if(bc){const porEtapa={};bc.habilidadesMencionadas.forEach(c=>{const e=reunaEtapa(c)||"Outras etapas";(porEtapa[e]=porEtapa[e]||[]).push({code:c,note:""});});Object.keys(porEtapa).forEach(e=>grupos.push(reunaGroup("Habilidades citadas no texto · "+e,porEtapa[e])));}
 const html=grupos.filter(Boolean).join("");
 return html?'<div class="reuna-connections">'+html+'</div>':"";
}
function reunaIntroHtml(t){const k="site do instituto";const i=t.indexOf(k);if(i<0)return '<p>'+E(t)+'</p>';return '<p>'+E(t.slice(0,i))+'<a href="'+REUNA_SITE+'" target="_blank" rel="noopener noreferrer">'+E(k)+'</a>'+E(t.slice(i+k.length))+'</p>';}
function reunaLegendaHtml(g,titulo){
 if(!g)return "";
 const dl=itens=>'<dl class="reuna-legenda-dl">'+itens.map(e=>'<div><dt>'+E(e.termo)+'</dt><dd>'+E(e.texto)+'</dd></div>').join("")+'</dl>';
 const intro=g.introducao.map(reunaIntroHtml).join("");
 const entradas=(g.entradas||[]).length?'<p class="reuna-label">Como esta página está organizada</p>'+dl(g.entradas):"";
 const classes=(g.classificacoes||[]).length?'<p class="reuna-label">Classificações</p>'+dl(g.classificacoes):"";
 const prog=(g.progressao||[]).length?'<p class="reuna-label">Progressão</p>'+g.progressao.map(t=>'<p>'+E(t)+'</p>').join(""):"";
 return '<section class="reuna-legenda" id="reuna-legenda" aria-labelledby="reuna-legenda-titulo"><h3 class="reuna-legenda-titulo" id="reuna-legenda-titulo">'+E(titulo)+'</h3>'+intro+entradas+classes+prog+'</section>';
}
function reunaToggle(btn){
 const group=btn.closest(".reuna-interactive");if(!group)return;
 const panel=group.querySelector(".reuna-expand");if(!panel)return;
 const estavaAberto=btn.getAttribute("aria-expanded")==="true";
 group.querySelectorAll(".reuna-code-btn").forEach(b=>b.setAttribute("aria-expanded","false"));
 panel.querySelectorAll("[data-key]").forEach(i=>{i.hidden=true;});
 if(estavaAberto){panel.hidden=true;return;}
 btn.setAttribute("aria-expanded","true");
 const item=[...panel.querySelectorAll("[data-key]")].find(i=>i.dataset.key===btn.dataset.key);
 if(item)item.hidden=false;
 panel.hidden=false;
}
function reunaBindInteractions(el){
 el.addEventListener("click",e=>{const b=e.target.closest(".reuna-code-btn");if(!b||!el.contains(b)||e.detail>=2)return;e.preventDefault();reunaToggle(b);});
 el.addEventListener("dblclick",e=>{const b=e.target.closest('.reuna-code-btn[data-kind="habilidade"]');if(!b||!el.contains(b))return;e.preventDefault();open(b.dataset.code);});
}
function reunaHtml(x){const r=S.data.reuna?.[x.code];if(!r)return "";const visao=S.data.reunaVisao||null;
 const label=r.rotulo_curto||r.rotulo||r.tipo||"Referência curricular",position=r.posicao&&r.total_grupo?new RegExp("(^|\\D)"+Number(r.posicao)+"\\s*(?:/|de)\\s*"+Number(r.total_grupo)+"(?:\\D|$)","i").test(label):false,extra=[r.componente&&N(r.componente)!==N(x.discipline)&&!N(label).includes(N(r.componente))?r.componente:"",r.ano_faixa&&N(r.ano_faixa)!==N(x.group)&&!N(label).includes(N(r.ano_faixa))?r.ano_faixa:""].filter(Boolean);
 const m=r.mapaDeFoco||null,bc=r.bnccComentada||null,hasMapa=!!(m&&m.ocorrencias&&m.ocorrencias.length),hasBc=!!(bc&&bc.comentarios&&bc.comentarios.length);
 const etapa=reunaEtapa(x.code);
 const chaveGuia=etapa==="Ensino Médio"?"Ensino Médio":(hasMapa?m.area:"");
 const guia=visao&&visao.guiaDaPagina&&chaveGuia?visao.guiaDaPagina[chaveGuia]:null;
 const conexoes=reunaConexoesHtml(r,m,bc);
 const partes=[];
 if(hasMapa)partes.push({id:"reuna-mapa",titulo:"Mapa de Foco",html:reunaMapaHtml(m,visao,x.code)});
 if(hasBc)partes.push({id:"reuna-comentada",titulo:"BNCC Comentada",html:reunaComentadaHtml(bc,visao)});
 if(conexoes)partes.push({id:"reuna-conexoes",titulo:"Conexões entre etapas",html:conexoes});
 const sub=partes.length>1?'<nav class="reuna-subnav" aria-label="Blocos do Reúna">'+partes.map(p=>'<a href="#'+p.id+'">'+E(p.titulo)+'</a>').join("")+'</nav>':"";
 const corpo=partes.map(p=>'<div class="reuna-part" id="'+p.id+'"><h3 class="reuna-part-title">'+E(p.titulo)+'</h3>'+p.html+'</div>').join("");
 const facts=[];
 if(etapa)facts.push(["Etapa",etapa]);
 if(hasMapa)facts.push(["Componente",m.area]);
 if(hasBc)facts.push(["Área",bc.comentarios[0].area]);
 if(hasBc){const nums=bc.competenciasEspecificasBNCC.map(id=>String((S.data.bnccCompetencies.get(id)||{}).numero||id));facts.push(["Competência"+(nums.length>1?"s":"")+" específica"+(nums.length>1?"s":""),ptList(nums)]);}
 const factsHtml=facts.length?'<dl class="reuna-facts">'+facts.map(f=>'<div><dt>'+E(f[0])+'</dt><dd>'+E(f[1])+'</dd></div>').join("")+'</dl>':"";
 const titulo=etapa==="Ensino Médio"?"Como ler os comentários da BNCC Comentada":"Como ler este Mapa de Foco";
 const legenda=reunaLegendaHtml(guia,titulo);
 const fontes=[];
 if(hasMapa)fontes.push(m.fonte);
 if(hasBc)fontes.push(bc.fonte);
 const caption=hasBc?'Comentários da BNCC Comentada do Ensino Médio, com competências e relações entre etapas.':hasMapa?'Mapa de Foco da BNCC: objetivos, competências, progressão e comentários pedagógicos.':'Organização curricular complementar.';
 const siteLink='<a class="reuna-site-link" href="'+REUNA_SITE+'" target="_blank" rel="noopener noreferrer">Site do Instituto Reúna <span aria-hidden="true">↗</span></a>';
 const rodape='<div class="reuna-footer">'+(fontes.length?'<p class="reuna-source">'+fontes.map(E).join(" · ")+'</p>':"")+'<p class="reuna-site">Materiais e publicações do <a href="'+REUNA_SITE+'" target="_blank" rel="noopener noreferrer">Instituto Reúna</a> <span aria-hidden="true">↗</span></p></div>';
 return '<section class="detail-section reuna-section" id="detalhe-reuna"><div class="section-heading"><span class="section-number">↗</span><div><h2>Referência Reúna</h2><p class="section-caption">'+E(caption)+'</p></div>'+siteLink+'</div><div class="reuna-summary"><div class="reuna-card"><p><b>'+E(label)+'</b></p>'+(extra.length?'<p>'+extra.map(E).join(' · ')+'</p>':'')+(!position&&r.posicao?'<p>Posição '+E(r.posicao)+(r.total_grupo?' de '+E(r.total_grupo)+' no grupo':'')+'</p>':'')+'</div>'+factsHtml+'</div>'+legenda+sub+corpo+rodape+'</section>';}
const MF_CORES=["#2f6fb3","#e0782d","#2e9a64","#c0457a","#7b5cc4","#1f9bb0","#b89422","#d4493f","#5f8f2a","#8a6446"];
function mfNumeroP(p){return Number(String(p||"").replace(/\D/g,""))||0;}
function mfCor(p){const n=mfNumeroP(p);return MF_CORES[(Math.max(n,1)-1)%MF_CORES.length];}
function mfAno(label){return Number((String(label).match(/\d+/)||[0])[0]);}
function mfOrdemColunas(a,b){return mfAno(a)-mfAno(b)||String(a).length-String(b).length;}
function mfGrupos(x){
 const r=S.data.reuna?.[x.code],visao=S.data.reunaVisao||null;
 if(!r||!visao||!(r.progressao||[]).length)return [];
 const vistos=new Set(),trilhas=[];
 r.progressao.forEach(ref=>{if(vistos.has(ref.trilha))return;vistos.add(ref.trilha);const t=(visao.trilhas||[]).find(z=>z.id===ref.trilha);if(t)trilhas.push(t);});
 const grupos=new Map();
 trilhas.forEach(t=>{const k=[t.componente,t.grupo,t.etapa].join("|");if(!grupos.has(k))grupos.set(k,{componente:t.componente,grupo:t.grupo,etapa:t.etapa,tipo:t.tipo,trilhas:[],colunas:[]});grupos.get(k).trilhas.push(t);});
 return [...grupos.values()].map(g=>{
  g.trilhas.forEach(t=>(t.colunas||[]).forEach(c=>{if(g.colunas.indexOf(c.coluna)<0)g.colunas.push(c.coluna);}));
  g.colunas.sort(mfOrdemColunas);
  return g;
 });
}
function mfProgressao(x,grupos){
 const porColuna=new Map();
 const registrar=(coluna,k,marcas,cor)=>{
  if(k===x.code)return;
  if(!porColuna.has(coluna))porColuna.set(coluna,new Map());
  const m=porColuna.get(coluna);
  if(!m.has(k))m.set(k,{code:k,marcas,cor});
 };
 grupos.forEach(g=>g.trilhas.forEach(t=>{
  const cols=t.colunas||[];
  const atual=cols.find(c=>(c.codigos||[]).indexOf(x.code)>=0);
  if(!atual)return;
  const n0=mfAno(atual.coluna),pAtual=(atual.marcadores||{})[x.code]||[];
  const comMarcas=cols.some(c=>Object.keys(c.marcadores||{}).length>0);
  cols.forEach(c=>{
   if(mfAno(c.coluna)<=n0)return;
   (c.codigos||[]).forEach(k=>{
    const marcas=(c.marcadores||{})[k]||[];
    if(t.tipo==="cadeia")registrar(c.coluna,k,[t.linha],mfCor(t.linha));
    else if(comMarcas){const comum=marcas.find(p=>pAtual.indexOf(p)>=0);if(comum)registrar(c.coluna,k,marcas,mfCor(comum));}
    else registrar(c.coluna,k,[],"");
   });
  });
 }));
 const colunas=[...porColuna.keys()].sort(mfOrdemColunas).map(coluna=>({coluna,codigos:[...porColuna.get(coluna).values()].sort(mfOrdemBanda)}));
 const codigos=new Set();
 colunas.forEach(c=>c.codigos.forEach(k=>codigos.add(k.code)));
 return {colunas,codigos};
}
function mfBandaDe(marcas){const ns=(marcas||[]).map(mfNumeroP).filter(n=>n>0);return ns.length?Math.min(...ns):Infinity;}
function mfOrdemBanda(a,b){const x=mfBandaDe(a.marcas),y=mfBandaDe(b.marcas);return x===y?0:x-y;}
function mfTemMarcas(t){return (t.colunas||[]).some(c=>Object.keys(c.marcadores||{}).length>0);}
const MF_UNIDADE_CORES=["#2f7d6d","#8a4fb0","#c2662b","#2b6cb0","#a23b5c","#6b8e23","#3a8fa3","#9c7a1f","#4e5fbf","#7a5230"];
function mfUnidadeNome(code,fallback){const r=S.data.reuna?.[code],occ=(r&&r.mapaDeFoco&&r.mapaDeFoco.ocorrencias)||[];return (occ[0]&&occ[0].campoOuUnidade)||fallback||"";}
function mfRelacoes(x){
 const r=S.data.reuna?.[x.code],occ=(r&&r.mapaDeFoco&&r.mapaDeFoco.ocorrencias)||[];
 const previa=new Set(),relacionada=new Set();
 occ.forEach(o=>{
  (o.conhecimentoPrevio||[]).forEach(k=>previa.add(k));
  const rel=o.habilidadesRelacionadas||{};
  ["AF","AC","EF"].forEach(z=>(rel[z]||[]).forEach(k=>relacionada.add(k)));
 });
 return {previa,relacionada};
}
function mfChip(code,marcas,ctx){
 const ps=(marcas||[]).filter(Boolean),un=mfUnidadeNome(code,ctx.fallback||"");
 const cor=un?((ctx.unidadeCor&&ctx.unidadeCor.get(un))||MF_UNIDADE_CORES[0]):"";
 const eFoco=code===ctx.atual;
 const previa=!eFoco&&!!(ctx.previa&&ctx.previa.has(code));
 const relac=!eFoco&&!previa&&!!(ctx.relacionada&&ctx.relacionada.has(code));
 const classes=["mf-code"];
 if(eFoco)classes.push("is-current");
 if(!eFoco&&ctx.progressoes&&ctx.progressoes.has(code))classes.push("is-progressao");
 if(previa)classes.push("is-previa");
 if(relac)classes.push("is-relacionada");
 const vars=(cor?'--un:'+cor+';':'')+(ps.length?'--mf:'+mfCor(ps[0])+';':'');
 const selos=ps.map(p=>'<span class="mf-p" style="--mf:'+mfCor(p)+'">'+E(p)+'</span>').join("");
 const etiqueta=previa?'<span class="mf-rel">prévia</span>':relac?'<span class="mf-rel">relacionada</span>':"";
 const dicas=[code,un?'Unidade temática: '+un:"",eFoco?'Habilidade desta página':"",previa?'Conhecimento prévio desta habilidade':"",relac?'Relacionada a esta habilidade':""].filter(Boolean).join(" · ");
 return '<button type="button" class="'+classes.join(" ")+'" data-kind="habilidade" data-code="'+E(code)+'" aria-haspopup="dialog"'+(vars?' style="'+vars+'"':'')+' title="'+E(dicas+" — clique para ver detalhes; duplo clique para abrir a página")+'">'+E(code)+etiqueta+(selos?'<span class="mf-marks">'+selos+'</span>':'')+'</button>';
}
function mfLinhasBandadas(t,g,ctx){
 const cols=t.colunas||[],cont=new Map(),bandas=new Set();
 cols.forEach(c=>(c.codigos||[]).forEach(k=>bandas.add(mfBandaDe((c.marcadores||{})[k]))));
 const ordem=[...bandas].sort((a,b)=>a===b?0:a-b);
 ordem.forEach(b=>g.colunas.forEach(lbl=>cont.set(b+"|"+lbl,[])));
 cols.forEach(c=>(c.codigos||[]).forEach(k=>cont.get(mfBandaDe((c.marcadores||{})[k])+"|"+c.coluna).push(k)));
 let html="",total=0;
 ordem.forEach(b=>{
  const n=Math.max(1,...g.colunas.map(lbl=>cont.get(b+"|"+lbl).length));
  total+=n;
  const rotulo=b===Infinity?'<span class="mf-banda-semmarca">sem marca</span>':'<span class="mf-p" style="--mf:'+mfCor("P"+b)+'">P'+b+'</span>';
  for(let r=0;r<n;r++){
   const celulas=g.colunas.map(lbl=>{
    const k=cont.get(b+"|"+lbl)[r];
    if(!k)return '<td class="mf-vazio"></td>';
    const col=cols.find(z=>z.coluna===lbl);
    return '<td>'+mfChip(k,((col&&col.marcadores)||{})[k],ctx)+'</td>';
   }).join("");
   html+='<tr'+(r===0?' class="mf-banda-ini"':'')+'>'+(r===0?'<th scope="row" class="mf-banda" rowspan="'+n+'">'+rotulo+'</th>':'')+celulas+'</tr>';
  }
 });
 return {html,total};
}
function mfTabelaHtml(g,ctx){
 const bandado=g.trilhas.some(mfTemMarcas);
 const cabeca='<tr><th scope="col"></th>'+(bandado?'<th scope="col"></th>':'')+g.colunas.map(c=>'<th scope="col">'+E(c)+'</th>').join("")+'</tr>';
 const corpo=g.trilhas.map(t=>{
  if(bandado){
   const lin=mfLinhasBandadas(t,g,ctx);
   return '<tbody>'+lin.html.replace('<tr class="mf-banda-ini">','<tr class="mf-banda-ini"><th scope="row" class="mf-linha" rowspan="'+lin.total+'">'+E(t.linha)+'</th>')+'</tbody>';
  }
  return '<tbody><tr><th scope="row" class="mf-linha">'+E(t.linha)+'</th>'+(bandado?'<td class="mf-vazio"></td>':'')+g.colunas.map(c=>{
   const col=(t.colunas||[]).find(z=>z.coluna===c);
   if(!col||!(col.codigos||[]).length)return '<td class="mf-vazio"></td>';
   return '<td>'+col.codigos.map(k=>mfChip(k,(col.marcadores||{})[k],ctx)).join("")+'</td>';
  }).join("")+'</tr></tbody>';
 }).join("");
 return '<div class="mf-scroll"><table class="mf-table"><thead>'+cabeca+'</thead>'+corpo+'</table></div>';
}
function mfComentariosHtml(g){
 const campos=g.componente==="Língua Portuguesa"?((S.data.reunaVisao?.campos)||[]).filter(c=>c.nome===g.grupo&&c.etapa===g.etapa&&c.comentario):[];
 return campos.map(c=>'<details class="reuna-comment"><summary>Comentário do campo</summary><p>'+E(c.comentario)+'</p></details>').join("");
}
function mfGrupoHtml(g,ctx){
 const cadeia=g.tipo==="cadeia",cor=cadeia?mfCor(g.trilhas[0].linha):"";
 const gctx=Object.assign({},ctx,{cor,fallback:g.grupo});
 return '<section class="mf-grupo'+(cadeia?' mf-grupo--cadeia':'')+'"'+(cor?' style="--mf:'+cor+'"':'')+'><header class="mf-grupo-head"><span class="mf-tipo">'+E(cadeia?'Cadeia de progressão':'Matriz de progressão')+'</span><strong>'+E(g.grupo)+'</strong><span class="mf-sub">'+E(g.componente)+' · '+E(g.etapa)+'</span></header>'+mfTabelaHtml(g,gctx)+mfComentariosHtml(g)+'</section>';
}
let mfContextoAtual=null;
function mfHtml(x,grupos){
 const prog=mfProgressao(x,grupos),rel=mfRelacoes(x);
 const progressoes=new Set(prog.codigos);
 const unidades=new Map();
 const registrarUnidade=(k,fb)=>{const n=mfUnidadeNome(k,fb);if(n&&!unidades.has(n))unidades.set(n,MF_UNIDADE_CORES[unidades.size%MF_UNIDADE_CORES.length]);};
 grupos.forEach(g=>g.trilhas.forEach(t=>(t.colunas||[]).forEach(c=>(c.codigos||[]).forEach(k=>registrarUnidade(k,g.grupo)))));
 prog.colunas.forEach(c=>c.codigos.forEach(k=>registrarUnidade(k.code,"")));
 const ctx={atual:x.code,progressoes,previa:rel.previa,relacionada:rel.relacionada,fallback:"",unidadeCor:unidades};
 const itens=new Map(),marcasFoco=[],propostasFoco=[];
 const addU=(arr,v)=>{if(v&&arr.indexOf(v)<0)arr.push(v);};
 const entrada=k=>{
  if(!itens.has(k))itens.set(k,{unidade:"",grupo:"",componente:"",etapa:"",linhas:[],anos:[],marcas:[],propostas:[],progressaoAnos:[],previa:rel.previa.has(k),relacionada:rel.relacionada.has(k),atual:k===x.code});
  return itens.get(k);
 };
 grupos.forEach(g=>g.trilhas.forEach(t=>(t.colunas||[]).forEach(c=>(c.codigos||[]).forEach(k=>{
  const e=entrada(k),marcas=(c.marcadores||{})[k]||[];
  e.unidade=e.unidade||mfUnidadeNome(k,g.grupo);
  e.grupo=e.grupo||g.grupo;e.componente=e.componente||g.componente;e.etapa=e.etapa||g.etapa;
  if(g.tipo!=="cadeia")addU(e.linhas,t.linha);addU(e.anos,c.coluna);
  marcas.forEach(p=>addU(e.marcas,p));
  if(g.tipo==="cadeia")addU(e.propostas,t.linha);
  if(k===x.code){marcas.forEach(p=>addU(marcasFoco,p));if(g.tipo==="cadeia")addU(propostasFoco,t.linha);}
 }))));
 prog.colunas.forEach(c=>c.codigos.forEach(k=>{const e=entrada(k.code);e.unidade=e.unidade||mfUnidadeNome(k.code,"");addU(e.progressaoAnos,c.coluna);}));
 mfContextoAtual={focal:x.code,itens,marcasFoco,propostasFoco};
 const faixa=prog.colunas.length
  ?'<div class="mf-faixa"><div class="mf-faixa-origem"><span class="mf-faixa-titulo">Progressão entre anos</span>'+mfChip(x.code,[],ctx)+'<span class="mf-faixa-texto">habilidades das etapas seguintes que dão continuidade a esta</span></div><div class="mf-faixa-colunas">'+prog.colunas.map(c=>'<div class="mf-faixa-coluna"><span class="mf-faixa-ano">'+E(c.coluna)+'</span>'+c.codigos.map(k=>mfChip(k.code,k.marcas,ctx)).join("")+'</div>').join("")+'</div></div>'
  :'<p class="mf-semprog">Esta habilidade não tem propostas de progressão para as etapas seguintes nesta matriz.</p>';
 const chaves=[];
 grupos.forEach(g=>{const k=g.componente+"|"+g.etapa;if(chaves.indexOf(k)<0)chaves.push(k);});
 const notas=(S.data.reunaVisao?.notas||[]).filter(n=>chaves.indexOf(n.componente+"|"+n.etapa)>=0&&n.texto.indexOf("ATENÇÃO")!==0);
 const notasHtml=notas.length?'<div class="reuna-progress-notes mf-notas">'+notas.map(n=>'<p>'+E(n.texto)+'</p>').join("")+'</div>':'';
 const codigos=[];
 grupos.forEach(g=>g.trilhas.forEach(t=>(t.colunas||[]).forEach(c=>(c.codigos||[]).forEach(k=>{if(codigos.indexOf(k)<0)codigos.push(k);}))));
 prog.colunas.forEach(c=>c.codigos.forEach(k=>{if(codigos.indexOf(k.code)<0)codigos.push(k.code);}));
 const expansoes=codigos.map(k=>reunaExpandHab(k)).join("");
 return '<div class="mf-cabeca"><span class="mf-kicker">Mapa Focal</span><h3>Matriz de progressão</h3><p>Aprendizagens focais do Mapa de Foco da BNCC, por ano. Clique em uma habilidade para ver o que ela representa no mapa.</p></div><div class="mf-interativo">'+faixa+notasHtml+grupos.map(g=>mfGrupoHtml(g,ctx)).join("")+'<div class="reuna-expand" hidden>'+expansoes+'</div></div>';
}
let mfPendente=null;
function mfBindInteractions(el){
 el.addEventListener("click",e=>{
  const b=e.target.closest(".mf-code");if(!b||!el.contains(b))return;
  clearTimeout(mfPendente);mfPendente=null;
  if(e.detail>=2)return;
  mfPendente=setTimeout(()=>{mfPendente=null;habilidadeModalAbrir(b.dataset.code);},240);
 });
 el.addEventListener("dblclick",e=>{
  const b=e.target.closest(".mf-code");if(!b||!el.contains(b))return;
  e.preventDefault();clearTimeout(mfPendente);mfPendente=null;
  habilidadeModalFechar();
  open(b.dataset.code);
 });
}
function habilidadeModalFechar(){const d=document.getElementById("habilidadeDialog");if(d&&d.open)d.close();}
function habilidadeModalAbrir(code){
 const x=S.by.get(code);if(!x)return;
 let d=document.getElementById("habilidadeDialog");
 if(!d){
  d=document.createElement("dialog");
  d.id="habilidadeDialog";d.className="hab-dialog";d.setAttribute("aria-labelledby","habilidadeDialogTitulo");
  d.addEventListener("click",e=>{if(e.target===d)d.close();});
  document.body.appendChild(d);
 }
 const meta=[x.discipline,x.group||x.stage,x.area&&x.area!==x.discipline?x.area:null].filter(Boolean).join(" · ");
 d.innerHTML='<form method="dialog" class="hab-dialog-form"><div class="hab-dialog-topo"><span class="hab-dialog-kicker">Habilidade</span><button type="submit" class="hab-dialog-fechar" value="fechar" aria-label="Fechar">×</button></div><h2 id="habilidadeDialogTitulo">'+E(x.code)+'</h2><p class="hab-dialog-meta">'+E(meta)+'</p>'+habilidadeMapaHtml(code)+'<p class="hab-dialog-texto">'+E(x.text)+'</p><div class="hab-dialog-acoes"><button type="button" class="print-btn print-btn--primary" data-hab-abrir="'+E(code)+'">Abrir página da habilidade →</button></div></form>';
 d.querySelector("[data-hab-abrir]").addEventListener("click",()=>{d.close();open(code);});
 if(!d.open)d.showModal();
}
function habilidadeMapaHtml(code){
 const e=mfContextoAtual&&mfContextoAtual.itens.get(code);
 const linhas=[["Unidade temática",(e&&e.unidade)||mfUnidadeNome(code,"")||"não informada"]];
 if(e){
  if(e.grupo)linhas.push(["Matriz",e.grupo+(e.etapa?" · "+e.etapa:"")]);
  if(e.linhas.length)linhas.push(["Linha",e.linhas.join(" · ")]);
  if(e.anos.length)linhas.push(["Ano na matriz",e.anos.join(", ")]);
  if(e.marcas.length)linhas.push(["Marcas P",e.marcas.join(", ")+" (propostas de progressão de conteúdo)"]);
  const comum=[...new Set([...e.marcas.filter(p=>mfContextoAtual.marcasFoco.indexOf(p)>=0),...e.propostas.filter(p=>mfContextoAtual.propostasFoco.indexOf(p)>=0)])];
  if(!e.atual&&comum.length)linhas.push(["Mesma proposta desta habilidade",comum.join(", ")]);
  if(e.progressaoAnos.length)linhas.push(["Progressão desta habilidade",e.progressaoAnos.join(", ")+" (etapa seguinte)"]);
  const papeis=[];
  if(e.atual)papeis.push("habilidade desta página");
  if(e.previa)papeis.push("conhecimento prévio desta habilidade");
  if(e.relacionada)papeis.push("relacionada a esta habilidade");
  if(papeis.length)linhas.push(["Relação",papeis.join(" · ")]);
 }
 return '<dl class="hab-dialog-mapa">'+linhas.map(([t,v])=>'<div><dt>'+E(t)+'</dt><dd>'+E(v)+'</dd></div>').join("")+'</dl>';
}
function mapaFocalMonta(x){
 const page=$("#detailPage"),vista=page?.querySelector(".graph-focal-view");
 if(!vista)return;
 const grupos=mfGrupos(x);
 if(!grupos.length){
  page.querySelector('[data-graph-view="focal"]')?.remove();
  const abas=page.querySelector(".map-view-switch");
  if(abas&&abas.querySelectorAll("[data-graph-view]").length<=1)abas.remove();
  vista.remove();
  return;
 }
 vista.id="mapa-focal";
 vista.innerHTML=mfHtml(x,grupos);
 page.querySelector('[data-graph-view="focal"]')?.click();
}
function detail(code){
 const x=S.by.get(code);if(!x){home();return;}closeMobileFilters();SkillGraph.detach();$("#catalogPage").hidden=true;const page=$("#detailPage");page.hidden=false;delete page.dataset.pendingGraphJump;
 const relationLists=detailRelations(x);
 const nav=[["detalhe-organizacao","Organização"],["detalhe-fonte","Fonte"],["detalhe-mapas","Mapas"],...(S.data.ai[x.code]?.por_componente?[["detalhe-interdisciplinar","Interdisciplinar"]]:[]),["detalhe-cieb","CIEB"],...(S.data.reuna?.[x.code]?[["detalhe-reuna","Reúna"]]:[])];
 page.classList.remove("has-compact-summary");page.innerHTML=printHeadHtml(x)+'<section class="detail-hero" style="--detail-accent:'+color(x.discipline||x.area)+'"><div class="detail-hero-inner"><button class="back-button" id="backButton">← &nbsp; Voltar ao catálogo</button><div class="detail-header-grid"><div class="detail-header-main"><div class="detail-topline"><span class="detail-kicker">HABILIDADE EM DETALHE</span><span>'+E(x.doc||"BNCC")+'</span></div><div class="detail-title"><h1>'+E(x.code)+'</h1><p class="skill-long-text">'+E(x.text)+'</p></div>'+(x.kind!=="cieb"?'<div class="detail-header-actions"><button type="button" class="detail-copy-button" data-copy-official>Copiar texto oficial</button><a class="detail-header-map" href="#skillGraph">Explorar progressão <span aria-hidden="true">↓</span></a></div>':'')+'</div></div></div></section><nav class="detail-nav" aria-label="Nesta habilidade"><span>Nesta habilidade</span>'+nav.map(([id,label])=>'<a href="#'+id+'">'+E(label)+'</a>').join("")+'</nav><div class="detail-content">'+detailHeaderHtml(x)+mapWorkspaceHtml(x,relationLists.curriculo)+aiHtml(x)+ciebHtml(x,relationLists.cieb)+reunaHtml(x)+'</div>'+printBarHtml();
 const detailHero=page.querySelector(".detail-hero"),detailNav=page.querySelector(".detail-nav"),stickySummary=document.createElement("div"),navShell=document.createElement("div");stickySummary.className="detail-sticky-summary";stickySummary.hidden=true;stickySummary.setAttribute("aria-hidden","true");stickySummary.setAttribute("aria-label","Habilidade em foco");stickySummary.innerHTML="<strong></strong><p></p>";stickySummary.querySelector("strong").textContent=x.code;stickySummary.querySelector("p").textContent=x.text;navShell.className="detail-sticky-shell";detailHero.after(stickySummary);detailNav.before(navShell);navShell.append(detailNav);requestAnimationFrame(syncDetailStickySummary);
 if(x.kind!=="cieb"){const relationsShortcut=page.querySelector('.detail-nav a[href="#detalhe-mapas"]');if(relationsShortcut){relationsShortcut.href="#detalhe-grafo";relationsShortcut.textContent="Relações de progressão";const graphShortcut=document.createElement("a");graphShortcut.href="#skillGraph";graphShortcut.textContent="Mapa de progressão";relationsShortcut.after(graphShortcut);}}
 $("#backButton").addEventListener("click",()=>home());
 page.onclick=e=>{const jump=e.target.closest(".graph-jump,a[href=\"#skillGraph\"]");if(jump){e.preventDefault();const progressTab=page.querySelector('[data-graph-view="progression"]');if(progressTab&&!progressTab.classList.contains("active"))progressTab.click();if(!page.querySelector("#skillGraph")){page.dataset.pendingGraphJump="true";return;}requestAnimationFrame(()=>page.querySelector("#skillGraph")?.scrollIntoView({behavior:"smooth",block:"start"}));return;}const b=e.target.closest("[data-graph-code]");if(b){open(b.dataset.graphCode);return;}const a=e.target.closest("a[data-code]");if(a&&page.contains(a)){e.preventDefault();open(a.dataset.code);}};
 if(x.kind!=="cieb")BnccData.load().then(state=>{const section=document.getElementById("detalhe-grafo");if(page.hidden||!section||new URLSearchParams(location.search).get("codigo")!==code)return;const node=state.nodes.get(code);if(!node){section.innerHTML='<p class="empty-message">Esta habilidade não está presente no grafo fornecido.</p>';return;}page.querySelector('.skill-long-text').textContent=node.texto;const compactDescription=page.querySelector('.detail-sticky-summary p');if(compactDescription)compactDescription.textContent=node.texto;section.innerHTML=SkillPanel.html(state,node);SkillGraph.mount(section.querySelector('#skillGraph'),state,code,open,()=>{});mapaFocalMonta(x);if(page.dataset.pendingGraphJump){delete page.dataset.pendingGraphJump;requestAnimationFrame(()=>page.querySelector('#skillGraph')?.scrollIntoView({behavior:'smooth',block:'start'}));}page.querySelector('[data-copy-official]')?.addEventListener('click',async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText(node.texto);button.textContent='Texto copiado';setTimeout(()=>button.textContent='Copiar texto oficial',1800);}catch{button.textContent='Não foi possível copiar';}});}).catch(error=>{const section=document.getElementById("detalhe-grafo");if(section&&!page.hidden&&new URLSearchParams(location.search).get("codigo")===code)section.innerHTML='<p class="empty-message">Não foi possível abrir o grafo local: '+E(error.message)+'</p>';});
 page.querySelectorAll(".more-relations[data-relation-kind]").forEach(more=>{
   const list=relationLists[more.dataset.relationKind]||[],grid=more.querySelector("[data-relation-grid]"),button=more.querySelector(".load-more-relations");let cursor=6;
   const append=()=>{const batch=list.slice(cursor,cursor+RELATION_BATCH);cursor+=batch.length;grid.insertAdjacentHTML("beforeend",batch.map(relationCard).join(""));const left=list.length-cursor;button.hidden=left<=0;if(left>0)button.textContent="Carregar mais ("+left+" restantes)";};
   more.addEventListener("toggle",()=>{if(more.open&&cursor===6)append();});button.addEventListener("click",append);
 });

}
function setupMobileFilters(){
 const actions=$(".top-actions");if(!actions||actions.querySelector(".mobile-filter-toggle"))return;
 const controls=document.createElement("div");controls.className="mobile-filter-controls";controls.id="mobileFilterControls";
 [".stage-select-wrap",".area-select-wrap",".search-box"].forEach(selector=>{const field=actions.querySelector(selector);if(field)controls.append(field);});
 const toggle=document.createElement("button");toggle.type="button";toggle.className="mobile-filter-toggle";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls",controls.id);toggle.innerHTML='<span>Filtros e busca</span><span class="mobile-filter-chevron" aria-hidden="true">⌄</span>';
 actions.insertBefore(toggle,actions.firstChild);actions.insertBefore(controls,toggle.nextSibling);
 toggle.addEventListener("click",()=>{const expanded=actions.classList.toggle("mobile-filters-open");toggle.setAttribute("aria-expanded",String(expanded));});
}
function closeMobileFilters(){const actions=$(".top-actions"),toggle=actions?.querySelector(".mobile-filter-toggle");if(actions&&toggle){actions.classList.remove("mobile-filters-open");toggle.setAttribute("aria-expanded","false");}}
const PRINT_SECOES=[
 {id:"detalhe-organizacao",titulo:"Cabeçalho e organização curricular"},
 {id:"detalhe-fonte",titulo:"Fonte e referência"},
 {id:"detalhe-grafo",titulo:"Progressão (grafo)"},{id:"mapa-focal",titulo:"Mapa Focal"},
 {id:"detalhe-mapas",titulo:"Mapas de relações"},
 {id:"detalhe-interdisciplinar",titulo:"Sugestões interdisciplinares"},
 {id:"detalhe-cieb",titulo:"Computação e currículo CIEB"},
 {id:"detalhe-reuna",titulo:"Referência Reúna",subs:[{id:"reuna-legenda",titulo:"Como ler"},{id:"reuna-mapa",titulo:"Mapa de Foco"},{id:"reuna-comentada",titulo:"BNCC Comentada"},{id:"reuna-conexoes",titulo:"Conexões entre etapas"}]}
];
const PRINT_KEY="conecta-bncc-impressao";
let printEstado=null,printTimer=null,printRevelados=[],printZoomSlot=null,printRestaurarAba=null;
function printPreferencias(){try{return JSON.parse(localStorage.getItem(PRINT_KEY)||"{}")||{};}catch(e){return {};}}
function printSalvarPreferencias(p){try{localStorage.setItem(PRINT_KEY,JSON.stringify(p));}catch(e){}}
function printBarHtml(){return '<div class="print-bar"><button type="button" class="print-btn print-btn--primary" id="printOpen" aria-haspopup="dialog">Imprimir ou salvar em PDF</button></div>';}
function printHeadHtml(x){return '<div class="print-head"><p class="print-brand">Conecta BNCC 2.0 · ficha da habilidade</p><h1>'+E(x.code)+'</h1><p class="print-text">'+E(x.text)+'</p></div>';}
function printPresente(id){const page=$("#detailPage"),el=document.getElementById(id);return !!(el&&page&&page.contains(el));}
function ensurePrintDialog(){
 if(document.getElementById("printDialog"))return;
 const d=document.createElement("dialog");
 d.id="printDialog";d.className="print-dialog";d.setAttribute("aria-labelledby","printDialogTitulo");
 d.innerHTML='<form method="dialog" id="printForm"><h2 id="printDialogTitulo">Imprimir ou salvar em PDF</h2>'
  +'<fieldset class="print-field"><legend>Códigos</legend><label><input type="radio" name="codigos" value="descricao"> Com descrição</label><label><input type="radio" name="codigos" value="codigos"> Somente códigos</label></fieldset>'
  +'<fieldset class="print-field"><legend>Seções</legend><div class="print-toolbar"><button type="button" class="print-btn" data-print-marcar="1">Marcar todas</button><button type="button" class="print-btn" data-print-marcar="0">Desmarcar todas</button></div><div id="printSecoes"></div></fieldset>'
  +'<div class="print-actions"><button type="submit" class="print-btn" value="cancel" formnovalidate>Cancelar</button><button type="submit" class="print-btn print-btn--primary" value="print">Imprimir</button></div></form>';
 document.body.appendChild(d);
 d.addEventListener("click",e=>{const b=e.target.closest("[data-print-marcar]");if(!b)return;d.querySelectorAll('#printSecoes input[type="checkbox"]').forEach(i=>{i.checked=b.dataset.printMarcar==="1";});});
 d.addEventListener("change",e=>{const i=e.target;if(!i.matches||!i.matches('#printSecoes input[data-print-id]'))return;const pai=PRINT_SECOES.find(s=>s.id===i.dataset.printId);if(pai&&pai.subs){d.querySelectorAll('#printSecoes input[data-print-id]').forEach(j=>{if(pai.subs.some(u=>u.id===j.dataset.printId))j.checked=i.checked;});return;}const mae=PRINT_SECOES.find(s=>(s.subs||[]).some(u=>u.id===i.dataset.printId));if(mae&&i.checked){const pi=d.querySelector('input[data-print-id="'+mae.id+'"]');if(pi)pi.checked=true;}});
d.addEventListener("close",()=>{if(d.returnValue==="print"){const op=printLerOpcoes(d);printSalvarPreferencias({codigos:op.codigos,secoes:op.secoes});imprimirComOpcoes(op);}});
}
function printLerOpcoes(d){
 const r=d.querySelector('input[name="codigos"]:checked'),secoes={};
 d.querySelectorAll('#printSecoes input[data-print-id]').forEach(i=>{secoes[i.dataset.printId]=i.checked;});
 return {codigos:r?r.value:"descricao",secoes:secoes};
}
function printAbrirDialogo(){
 ensurePrintDialog();
 const d=document.getElementById("printDialog"),pref=printPreferencias();
 const alvo=d.querySelector('input[name="codigos"][value="'+(pref.codigos==="codigos"?"codigos":"descricao")+'"]');
 if(alvo)alvo.checked=true;
 const marcado=id=>!pref.secoes||pref.secoes[id]!==false;
 d.querySelector("#printSecoes").innerHTML=PRINT_SECOES.filter(s=>printPresente(s.id)).map(s=>{
  const subs=(s.subs||[]).filter(u=>printPresente(u.id));
  return '<div class="print-secao"><label><input type="checkbox" data-print-id="'+s.id+'"'+(marcado(s.id)?' checked':'')+'> '+E(s.titulo)+'</label>'+(subs.length?'<div class="print-sub">'+subs.map(u=>'<label><input type="checkbox" data-print-id="'+u.id+'"'+(marcado(s.id)&&marcado(u.id)?' checked':'')+'> '+E(u.titulo)+'</label>').join("")+'</div>':'')+'</div>';
 }).join("");
 d.returnValue="";
 d.showModal();
}
function printManter(pai,alvos){
 [...pai.children].forEach(c=>{
  if(alvos.indexOf(c)>=0)return;
  const dentro=alvos.filter(t=>c.contains(t));
  if(dentro.length)printManter(c,dentro);else c.classList.add("print-hidden");
 });
}
function printLimpar(){
 if(printTimer){clearTimeout(printTimer);printTimer=null;}
 document.querySelectorAll(".print-hidden,.print-graph-on,.print-sem-grafo").forEach(el=>el.classList.remove("print-hidden","print-graph-on","print-sem-grafo"));
 document.querySelectorAll(".print-inserted").forEach(el=>el.remove());
 printRevelados.forEach(el=>{el.hidden=true;});printRevelados=[];if(printRestaurarAba){const f=printRestaurarAba;printRestaurarAba=null;f();}if(printZoomSlot){printZoomSlot.style.zoom="";printZoomSlot=null;}
 const page=$("#detailPage");if(page)page.classList.remove("print-codes-only","print-desc-on");
 if(printEstado){printEstado.detalhes.forEach(([det,aberto])=>{det.open=aberto;});document.title=printEstado.titulo;printEstado=null;}
}
function imprimirComOpcoes(op){
 const page=$("#detailPage");if(!page)return;
 printLimpar();
 const estado={titulo:document.title,detalhes:[]},pares=[];
 PRINT_SECOES.forEach(s=>{
  if(!printPresente(s.id))return;
  const paiMarcado=op.secoes[s.id]!==false;
  pares.push([document.getElementById(s.id),paiMarcado]);
  (s.subs||[]).forEach(u=>{if(printPresente(u.id))pares.push([document.getElementById(u.id),paiMarcado&&op.secoes[u.id]!==false]);});
 });
 const incluidas=pares.filter(p=>p[1]).map(p=>p[0]);
 pares.forEach(([el,marcado])=>{
  if(marcado)return;
  const dentro=incluidas.filter(t=>el.contains(t));
  if(dentro.length)printManter(el,dentro);else el.classList.add("print-hidden");
 });
  const cartaoPrint=document.querySelector("#detalhe-grafo .graph-card"),abaPrint=cartaoPrint?cartaoPrint.querySelector("[data-graph-view].active"):null;
 if(incluidas.indexOf(document.getElementById("detalhe-grafo"))>=0&&abaPrint&&abaPrint.dataset.graphView!=="progression"){const abaProg=cartaoPrint.querySelector('[data-graph-view="progression"]');if(abaProg){const voltar=abaPrint;abaProg.click();printRestaurarAba=()=>voltar.click();}}
 const grafoEl=document.getElementById("detalhe-grafo"),focalEl=document.getElementById("mapa-focal");
 if(grafoEl&&incluidas.indexOf(grafoEl)>=0)grafoEl.querySelectorAll(".graph-map-view,.graph-legend,.graph-hint").forEach(el=>{if(el.hidden){printRevelados.push(el);el.hidden=false;}});
 if(focalEl&&incluidas.indexOf(focalEl)>=0&&focalEl.hidden){printRevelados.push(focalEl);focalEl.hidden=false;}
 const vistos=new Set();
 incluidas.forEach(el=>el.querySelectorAll("details").forEach(det=>{if(vistos.has(det))return;vistos.add(det);estado.detalhes.push([det,det.open]);det.open=true;}));
 incluidas.forEach(el=>el.querySelectorAll(".more-relations .load-more-relations").forEach(b=>{let guarda=0;while(!b.hidden&&guarda++<1000)b.click();}));
 const modo=op.codigos==="codigos"?"print-codes-only":"print-desc-on";
 page.classList.add(modo);
 if(modo==="print-desc-on"){
  incluidas.forEach(el=>el.querySelectorAll(".reuna-expand[hidden],.reuna-expand-item[hidden]").forEach(n=>{n.hidden=false;printRevelados.push(n);}));
  const ai=document.getElementById("detalhe-interdisciplinar");
  if(ai&&incluidas.indexOf(ai)>=0)ai.querySelectorAll("a[data-code]").forEach(a=>{
   const it=S.by.get(a.dataset.code);if(!it)return;
   const sp=document.createElement("span");sp.className="print-desc print-inserted";sp.textContent=" — "+it.text;
   a.insertAdjacentElement("afterend",sp);
  });
 }
 const grafo=document.getElementById("detalhe-grafo");
 if(grafo&&incluidas.indexOf(grafo)>=0){
  const slot=grafo.querySelector(".graph-canvas-slot"),mapa=grafo.querySelector(".graph-canvas");
  if(slot&&mapa){
   const largura=parseFloat(mapa.style.width)||mapa.offsetWidth||0;
   if(largura>610){slot.style.zoom=String(610/largura);printZoomSlot=slot;}
   grafo.classList.add("print-graph-on");
  }else grafo.classList.add("print-sem-grafo");
 }
 const code=new URLSearchParams(location.search).get("codigo")||"";
 if(code)document.title="BNCC-"+code;
 printEstado=estado;
 const concluir=()=>{window.removeEventListener("afterprint",concluir);printLimpar();};
 window.addEventListener("afterprint",concluir);
 printTimer=setTimeout(()=>{window.removeEventListener("afterprint",concluir);printLimpar();},180000);
 window.print();
}
function events(){
 reunaBindInteractions($("#detailPage"));mfBindInteractions($("#detailPage"));
 $("#detailPage").addEventListener("click",e=>{if(e.target.closest("#printOpen"))printAbrirDialogo();});
 setupMobileFilters();let searchTimer;
 window.addEventListener("scroll",syncDetailStickySummary,{passive:true});window.addEventListener("resize",syncDetailStickySummary,{passive:true});
 const jumpToRow=row=>{if(!row)return;const bar=$(".topbar"),offset=bar&&getComputedStyle(bar).position==="sticky"?bar.getBoundingClientRect().height:0;window.scrollTo({top:Math.max(0,window.scrollY+row.getBoundingClientRect().top-offset-16),behavior:"smooth"});};
 $("#searchInput").addEventListener("input",e=>{const wasDetail=!$("#detailPage").hidden;S.q=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});},SEARCH_DELAY);});
  $("#stageSelect").addEventListener("change",e=>{const wasDetail=!$("#detailPage").hidden;S.stageFilter=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});});
 $("#areaSelect").addEventListener("change",e=>{const wasDetail=!$("#detailPage").hidden;S.filter=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});});
  $("#clearFilters").addEventListener("click",()=>{clearTimeout(searchTimer);$("#searchInput").value="";$("#stageSelect").value="";$("#areaSelect").value="";S.q=S.filter=S.stageFilter="";S.rowFilters.clear();S.yearFilters.clear();render();});
 $("#exploreButton").addEventListener("click",()=>jumpToRow($("#catalogRows .catalog-row")));
 const featuredCodes=["EF03MA05","EI03EF01","EF07LP14","EM13MAT103","EF06CO02","EI01CG05","EF09LP05","EF01CI04","EM12CO06"];
 const featuredList=featuredCodes.map(c=>S.by.get(c)).filter(Boolean);
 if(featuredList.length){
   const card=$(".spotlight-card");
   let fi=-1,rotTimer=0;
   const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
   const paint=()=>{
     const featured=featuredList[fi];
     $("#featuredCode").textContent=featured.code;
     $("#featuredArea").textContent=featured.discipline+" · "+featured.group;
     $("#featuredText").textContent=featured.text;
     $("#featuredButton").disabled=false;
     window.heroSpotlight&&window.heroSpotlight(featured.code);
   };
   const show=()=>{
     if($("#catalogPage").hidden||!document.body.contains(card)){schedule();return;}
     fi=(fi+1)%featuredList.length;card.classList.remove("spotlight-in");void card.offsetWidth;paint();card.classList.add("spotlight-in");schedule();
   };
   const schedule=()=>{clearTimeout(rotTimer);if(!reduceMotion)rotTimer=setTimeout(show,6500);};
   $("#featuredButton").addEventListener("click",()=>open(featuredList[Math.max(fi,0)].code));
   if(reduceMotion){fi=0;paint();}
   else{
     card.addEventListener("mouseenter",()=>clearTimeout(rotTimer));
     card.addEventListener("mouseleave",schedule);
     fi=0;paint();card.classList.add("spotlight-in");schedule();
   }
 }
 $("#catalogRows").addEventListener("click",e=>{
   const componentArrow=e.target.closest("[data-component-direction]");
   if(componentArrow){const list=componentArrow.closest(".component-rail").querySelector(".row-component-list");list.scrollBy({left:Number(componentArrow.dataset.componentDirection)*Math.max(200,list.clientWidth*.7),behavior:"smooth"});return;}
   const periodChip=e.target.closest("[data-row-period]");
   if(periodChip){
     const id=periodChip.dataset.rowPeriod,row=ROWS.find(x=>x.id===id),old=document.getElementById("row-"+id);if(!row||!old)return;
     const value=periodChip.dataset.period||"",current=S.yearFilters.get(id)||"",next=value===current?"":value,scroll=old.querySelector(".row-periods .row-component-list")?.scrollLeft||0;
     if(next)S.yearFilters.set(id,next);else S.yearFilters.delete(id);
     const view=rowView(row);if(view.selected&&!view.available.some(x=>componentLabel(x)===view.selected))S.rowFilters.delete(id);
     const replacement=makeRow(row,rowView(row));old.replaceWith(replacement);initializeRail(replacement.querySelector(".row-track"),{animateStart:true});const bar=replacement.querySelector(".row-periods .row-component-list");bar.scrollLeft=scroll;
     [...bar.querySelectorAll("[data-row-period]")].find(b=>b.dataset.period===next)?.focus({preventScroll:true});syncComponentArrows(replacement);updateResultCount();return;
   }
   const chip=e.target.closest("[data-row-component]");
   if(chip){
     const id=chip.dataset.rowComponent,row=ROWS.find(x=>x.id===id),old=document.getElementById("row-"+id);
     if(!row||!old)return;
     const value=chip.dataset.component||"",current=S.rowFilters.get(id)||"",next=value===current?"":value,scroll=old.querySelector(".row-components .row-component-list")?.scrollLeft||0;
     if(next)S.rowFilters.set(id,next);else S.rowFilters.delete(id);
     const replacement=makeRow(row,rowView(row));old.replaceWith(replacement);initializeRail(replacement.querySelector(".row-track"),{animateStart:true});
     const bar=replacement.querySelector(".row-components .row-component-list");bar.scrollLeft=scroll;
     [...bar.querySelectorAll("[data-row-component]")].find(b=>b.dataset.component===next)?.focus({preventScroll:true});
     syncComponentArrows(replacement);updateResultCount();return;
   }
   const arrow=e.target.closest(".rail-arrow");if(arrow){const track=arrow.closest(".row-rail").querySelector(".row-track");moveRail(track,Number(arrow.dataset.direction));return;}const c=e.target.closest(".skill-card");if(c)open(c.dataset.code);
 });
 const interruptRailMotion=e=>{const track=e.target.closest(".row-track");if(track)cancelRailAnimation(track);};
 $("#catalogRows").addEventListener("pointerdown",interruptRailMotion,{passive:true});$("#catalogRows").addEventListener("touchstart",interruptRailMotion,{passive:true});$("#catalogRows").addEventListener("wheel",interruptRailMotion,{passive:true});
 $("#catalogRows").addEventListener("scroll",e=>{const list=e.target.closest(".row-component-list");if(list)syncComponentArrows(list.closest(".catalog-row"));const track=e.target.closest(".row-track");if(track)scheduleRail(track);},true);
 $("#catalogRows").addEventListener("focusin",e=>{const c=e.target.closest(".skill-card"),track=c?.closest(".row-track");if(track){syncRailA11y(track);scheduleRail(track);}});
 window.addEventListener("resize",()=>requestAnimationFrame(()=>{initializeRails($("#catalogRows"));syncComponentArrows($("#catalogRows"));}));
 $("#catalogRows").addEventListener("keydown",e=>{const c=e.target.closest(".skill-card");if(!c)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();open(c.dataset.code);}else if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();moveRailFocus(c.closest(".row-track"),c,e.key==="ArrowLeft"?-1:1);}});
 $("#stageShortcuts").addEventListener("click",e=>{const b=e.target.closest("[data-scroll]");if(b)jumpToRow($("#row-"+b.dataset.scroll));});
 document.querySelectorAll("[data-home]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();if(!$("#detailPage").hidden)home();else window.scrollTo({top:0,behavior:"smooth"});}));
  document.querySelectorAll("[data-jump]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();if(!$("#detailPage").hidden)home(false);let row=$("#row-"+a.dataset.jump);if(!row){clearTimeout(searchTimer);$("#searchInput").value="";$("#stageSelect").value="";$("#areaSelect").value="";S.q=S.filter=S.stageFilter="";S.rowFilters.clear();S.yearFilters.clear();render();row=$("#row-"+a.dataset.jump);}jumpToRow(row);}));
 $("#aboutButton").addEventListener("click",()=>$("#aboutDialog").showModal());$("#themeButton").addEventListener("click",()=>{const t=document.body.dataset.theme==="light"?"dark":"light";document.body.dataset.theme=t;localStorage.setItem("conecta-bncc-theme",t);$("#themeButton").textContent=t==="light"?"☾":"☼";$("#themeButton").title=t==="light"?"Ativar tema escuro":"Ativar tema claro";});document.querySelectorAll("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>$("#aboutDialog").close()));
 $("#aboutMeta").innerHTML="1.721 aprendizagens BNCC + "+S.data.cieb.length+" referências CIEB · "+VERSION+"<br>BNCC-dados CC BY 4.0 · pipeline MIT<br>Todos os arquivos são locais; a aplicação não consulta a rede.";
 $("#footerVersion").textContent=VERSION;$("#themeButton").textContent=document.body.dataset.theme==="light"?"☾":"☼";window.addEventListener("popstate",()=>{const c=new URLSearchParams(location.search).get("codigo");if(c){detail(c);if(location.hash)requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());else window.scrollTo({top:0,behavior:"instant"});}else{$("#detailPage").hidden=true;$("#catalogPage").hidden=false;requestAnimationFrame(()=>initializeRails($("#catalogRows")));window.scrollTo({top:S.catalogScroll||0,behavior:"instant"});}});
}
async function load(){
 try{const files=["educacao-infantil.json","ensino-fundamental.json","ensino-medio.json","estrutura.json","computacao.json","curriculo_cieb_computacao.json","sugestoes_interdisciplinares_ia.json","hierarquia_reuna.json","bncc-busca.min.json","reuna_visao_geral.json"],data=await Promise.all(files.map(async f=>{const r=await fetch(D+f);if(!r.ok)throw Error(f+" HTTP "+r.status);return r.json();}));normalize({ei:data[0],ef:data[1],em:data[2],structure:data[3],comp:data[4],cieb:data[5],ai:data[6],reuna:data[7],reunaVisao:data[9]});const searchIndex=new Map(data[8].itens.map(x=>[x.c,x]));S.all.forEach(x=>{const entry=x.kind!=="cieb"&&searchIndex.get(x.code);if(!entry)return;x.text=entry.t;x._textWords=words(x.text);x._topicWords=words(x.text+" "+x.topic);x._search=N([x.code,x.text,x.discipline,x.area,x.topic,x.group,entry.x,entry.d].join(" "));});fillFilters();render();events();$("#datasetStatus").textContent="1.721 aprendizagens BNCC + "+S.data.cieb.length+" referências CIEB · grafo dados-2026.08";const code=new URLSearchParams(location.search).get("codigo");if(code){detail(code);if(location.hash)requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());}
 }catch(e){console.error(e);$("#catalogRows").innerHTML='<div class="loading-state">Abra INICIAR.bat para iniciar o catálogo offline.<br><small>'+E(e.message)+'</small></div>';$("#datasetStatus").textContent="Arquivos locais prontos; inicie o servidor offline.";}
}
load();
})();
