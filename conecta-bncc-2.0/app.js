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
const S={all:[],by:new Map(),data:{},q:"",filter:"",stageFilter:"",rows:new Map(),rails:new Map(),rowFilters:new Map(),yearFilters:new Map(),rowQueries:new Map(),rowSearchOpen:new Set(),rowState:new Map(),relationCache:new Map()};
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
   out.push({code:h.codigo,text:h.descricao,stage:etapa.etapa||"",year:ano.ano||"",axis:eixo.eixo||"",concept:conceito.conceito||"",topic:[eixo.eixo,conceito.conceito].filter(Boolean).join(" · "),practices:h.praticas||[],evaluations:h.avaliacoes||[],bnccLinks:(h.habilidades_bncc||[]).filter(link=>link.codigo),generalCompetencies:(h.competencias_gerais_bncc||[]).filter(link=>link.codigo),materials:h.materiais_referencia||[],maturity:h.nivel_maturidade||null,keywords:h.palavras_chave||[],axisCompetencies:h.competencias_do_eixo||h.axisCompetencies||[],workload:h.carga_horaria||"",unitType:h.tipo_unidade_curricular||"",unitName:h.nome_unidade||"",attitudes:h.atitudes||[],resources:h.recursos||[],tematicas:h.tematicas||[],teacherProfile:h.perfil_docente||"",structure:h.estrutura||[]});
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
 const areaCodeMap={"Linguagens":"LIN","Matemática":"MAT","Ciências da Natureza":"CNT","Ciências Humanas":"CH","Ensino Religioso":"ER","Linguagens e suas Tecnologias":"LIN","Matemática e suas Tecnologias":"MAT","Ciências da Natureza e suas Tecnologias":"CNT","Ciências Humanas e Sociais Aplicadas":"CH"};
 const compCodeMap={"Língua Portuguesa":"LP","Arte":"ART","Educação Física":"EF","Língua Inglesa":"LI","História":"HIS","Geografia":"GEO"};
 (d.structure.competencias_gerais||[]).forEach(c=>{
  const code="CG"+String(c.numero).padStart(2,"0");
  const o=item(code,c.texto,"Geral",{discipline:"Competências Gerais",area:"Educação Básica",group:"Competência Geral",topic:"Competências Gerais da Educação Básica",compType:"geral",source:c.fonte,raw:c,kind:"competencia"});
  o._id=c.id;S.all.push(o);
 });
 (d.structure.competencias_especificas||[]).forEach(c=>{
  const isArea=c.tipo==="especifica_de_area",areaName=areas.get(c.area)?.nome||c.area||"BNCC",compName=comps.get(c.componente)?.nome,stagePrefix=(c.id||"").startsWith("em-")?"EM":"EF",numPad=String(c.numero).padStart(2,"0");
  const shortCode=isArea?(stagePrefix==="EM"?("EM-"+(areaCodeMap[areaName]||"AREA")+numPad):("CA-"+(areaCodeMap[areaName]||"AREA")+numPad)):("CE-"+(compCodeMap[compName]||"COMP")+numPad);
  const discipline=compName||areaName,group=isArea?("Área · "+areaName):("Componente · "+discipline);
  const o=item(shortCode,c.texto,stagePrefix,{discipline,area:areaName,group,topic:isArea?("Competência de Área · "+areaName):("Competência Específica · "+discipline),compType:c.tipo,source:c.fonte,raw:c,kind:"competencia"});
  o._id=c.id;S.all.push(o);
 });
 (d.comp.competencias||[]).forEach(c=>{
  const isEm=c.tipo==="especifica_em_computacao"||(c.id||"").includes("-em-");
  const code=isEm?("EM-CO"+String(c.numero).padStart(2,"0")):("CO"+String(c.numero).padStart(2,"0"));
  const o=item(code,c.texto,isEm?"EM":"Computação",{discipline:"Computação",area:"BNCC Computação",group:isEm?"Competência EM · Computação":"Competência · Computação",topic:"Competências de Computação",compType:c.tipo,source:c.fonte,raw:c,kind:"competencia"});
  o._id=c.id;S.all.push(o);
 });
 S.data={ctx,fields,bnccCompetencies,axes,objects,compCompetencies,structure:d.structure,ai:d.ai.pontes||{},reuna:d.reuna,reunaVisao:d.reunaVisao||null,cieb:flattenCieb(d.cieb)};
 S.data.cieb.forEach(x=>{x.words=words(x.text+" "+x.topic+" "+x.concept);const c=item(x.code,x.text,"CIEB",{years:[],discipline:"CIEB · "+(x.axis||"Computação"),area:"CIEB",group:[x.stage,yearLabel(x.year)].filter(Boolean).join(" · "),topic:x.topic,source:{arquivo:"Currículo de Referência em Tecnologia e Computação · CIEB"},raw:x,kind:"cieb"});S.all.push(c);});
 S.rows.clear();S.relationCache.clear();
 S.all.forEach(x=>{x._textWords=words(x.text);x._topicWords=words(x.text+" "+x.topic);x._search=N([x.code,x.text,x.discipline,x.area,x.topic,x.group].join(" "));if(!S.by.has(x.code))S.by.set(x.code,x);if(x._id&&!S.by.has(x._id))S.by.set(x._id,x);});
}
const ROWS=[{id:"ei",cor:"#60c7b4",title:"Educação Infantil",sub:"93 objetivos · BNCC 2018",resumo:"Objetivos de aprendizagem da Educação Infantil para bebês, crianças bem pequenas e crianças pequenas, organizados pelos campos de experiência."},{id:"iniciais",cor:"#ffb86b",title:"Anos Iniciais",sub:"1º ao 5º ano",resumo:"Habilidades do Ensino Fundamental do 1º ao 5º ano, por componente curricular. Os anos permitem focar em uma série."},{id:"finais",cor:"#61b8ff",title:"Anos Finais",sub:"6º ao 9º ano",resumo:"Habilidades do Ensino Fundamental do 6º ao 9º ano, por componente curricular e por ano."},{id:"em",cor:"#ead06c",title:"Ensino Médio",sub:"habilidades por área",resumo:"Habilidades do Ensino Médio, agrupadas pelas áreas de conhecimento."},{id:"competencias",cor:"#a49aff",title:"Competências",sub:"gerais, específicas e por área · BNCC",resumo:"Competências gerais, específicas de área e de componente da BNCC, além das competências de Computação."},{id:"computacao",cor:"#f083b4",title:"BNCC Computação",sub:"complemento de Computação à BNCC",resumo:"Aprendizagens do complemento de Computação à BNCC, organizadas pelos eixos da Computação."},{id:"cieb",cor:"#7dc9e8",title:"Currículo CIEB",sub:"referências complementares em tecnologia e computação",resumo:"Registros do Currículo de Referência em Tecnologia e Computação (CIEB), organizados por eixo e etapa. São referências complementares à BNCC."},{id:"reuna",cor:"#d991f1",title:"Reúna",sub:"mapa de foco · 266 habilidades focais",resumo:"Habilidades focais do Mapa de Foco da BNCC (Instituto Reúna), na sequência de progressão de cada componente, da Educação Infantil ao Ensino Fundamental."}];
function rowItems(id){
 if(S.rows.has(id))return S.rows.get(id);
 const bn=S.all.filter(x=>x.kind==="bncc");let result=[];
 if(id==="ei")result=bn.filter(x=>x.stage==="EI");
 else if(id==="iniciais")result=bn.filter(x=>x.stage==="EF"&&x.years.some(n=>n<=5));
 else if(id==="finais")result=bn.filter(x=>x.stage==="EF"&&x.years.some(n=>n>=6));
 else if(id==="em")result=bn.filter(x=>x.stage==="EM");
 else if(id==="competencias")result=S.all.filter(x=>x.kind==="competencia");
 else if(id==="computacao")result=S.all.filter(x=>x.kind==="computacao");
 else if(id==="cieb")result=S.all.filter(x=>x.kind==="cieb");
 else if(id==="reuna"){
  const focalEntries=Object.entries(S.data.reuna||{}).filter(([,v])=>v?.tipo==="AF");
  function anoOrder(ano){
   if(!ano)return 99;
   if(/crian/i.test(ano))return 0;
   const m=String(ano).match(/\d+/);
   return m?parseInt(m[0],10):50;
  }
  focalEntries.sort((a,b)=>{
   const oA=anoOrder(a[1].ano_faixa), oB=anoOrder(b[1].ano_faixa);
   if(oA!==oB)return oA-oB;
   if(a[1].componente!==b[1].componente)return a[1].componente.localeCompare(b[1].componente);
   return (a[1].posicao||0)-(b[1].posicao||0);
  });
  result=focalEntries.map(([code])=>S.by.get(code)).filter(Boolean);
 }
 S.rows.set(id,result);return result;
}
function rel(a,b){
 const isAComp=a.kind==="competencia",isBComp=b.kind==="competencia";
 if(isAComp||isBComp){
  if(isAComp&&isBComp){
   if(a.discipline===b.discipline||(a.area&&a.area===b.area&&a.area!=="Educação Básica"))return{type:"Competência correlata",basis:"Mesma área ou componente: "+(a.discipline||a.area),kind:"competency",score:85};
   if(a.compType===b.compType)return{type:"Competência do mesmo grupo",basis:a.group||"Competências articuladas",kind:"competency",score:75};
   const terms=sharedSets(a._textWords,b._textWords);
   if(terms.length>=2)return{type:"Aproximação conceitual",basis:"Temas em comum: "+terms.slice(0,4).join(", "),kind:"suggested",score:30+terms.length};
   return null;
  }
  const comp=isAComp?a:b,skill=isAComp?b:a;
  if((skill.competencyIds||[]).some(id=>id===comp._id||id===comp.code))return{type:"Competência declarada",basis:"A habilidade declara diretamente esta competência na fonte oficial.",kind:"formal",score:120};
  if(skill.kind==="cieb"){
   if((skill.raw?.generalCompetencies||[]).some(g=>g.codigo===comp.code||(comp.code.startsWith("CG")&&parseInt(comp.raw?.numero,10)===parseInt(g.codigo?.replace(/\D/g,""),10))))return{type:"Competência geral indicada pelo CIEB",basis:"O currículo de referência do CIEB articula esta habilidade à competência geral.",kind:"cieb",score:115};
   return null;
  }
  const reunaEntry=S.data.reuna?.[skill.code];
  if(reunaEntry){
   const bc=reunaEntry.bnccComentada,mf=reunaEntry.mapaDeFoco;
   const compNum=String(comp.raw?.numero||"");
   if(bc?.competenciasEspecificasBNCC?.includes(comp._id)||bc?.competenciasGeraisMencionadas?.includes(comp._id))return{type:"Vínculo curricular indicado pelo Reúna",basis:"Articulação documentada na BNCC Comentada do Instituto Reúna.",kind:"formal",score:110};
   if(mf?.ocorrencias?.some(o=>{
    const c=o.competencias||{};
    if(comp.code.startsWith("CG")&&c.CG?.includes(compNum))return true;
    if(comp.compType==="especifica_de_area"&&c.CA?.includes(compNum))return true;
    if(comp.compType==="especifica_de_componente"&&c.CE?.includes(compNum))return true;
    return false;
   }))return{type:"Vínculo curricular no Mapa de Foco",basis:"Articulação identificada nos Mapas de Foco do Instituto Reúna.",kind:"formal",score:108};
  }
  if(skill.kind==="bncc"){
   if((skill.discipline&&skill.discipline===comp.discipline)||(skill.area&&skill.area===comp.area&&comp.area!=="Educação Básica")){
    const terms=sharedSets(skill._textWords,comp._textWords);
    if(terms.length>=2)return{type:"Articulação temática no componente",basis:"Mesmo componente ("+(comp.discipline||comp.area)+") e temas em comum: "+terms.slice(0,4).join(", "),kind:"competency",score:70+terms.length};
    return{type:"Articulação no componente curricular",basis:"Competência e habilidade vinculadas a "+(comp.discipline||comp.area),kind:"competency",score:50};
   }
  }
  const terms=sharedSets(skill._textWords,comp._textWords);
  if(terms.length>=2)return{type:"Convergência temática com competência",basis:"Temas em comum: "+terms.slice(0,4).join(", ")+". Sugestão para planejamento interdisciplinar.",kind:"suggested",score:35+terms.length};
  return null;
 }
 const cieb=a.kind==="cieb"?a:b.kind==="cieb"?b:null,other=cieb===a?b:a;

 if(cieb){
  if(other.kind==="cieb"){
  if((a.raw?.axisCompetencies||[]).includes(b.code)||(b.raw?.axisCompetencies||[]).includes(a.code)){
   return{type:"Competência de eixo associada",basis:"Competência geral do eixo articulada a esta unidade curricular no CIEB Ensino Médio.",kind:"cieb",score:115};
  }
  const terms=sharedSets(a._textWords,b._textWords);
  if(a.discipline===b.discipline){
   if(terms.length>=2)return{type:"Articulação no mesmo eixo CIEB",basis:"Eixo "+a.discipline+" e temas comuns: "+terms.slice(0,4).join(", ")+".",kind:"cieb",score:45+terms.length};
   return{type:"Eixo comum no CIEB",basis:"Ambas integram o eixo "+a.discipline+" no referencial CIEB.",kind:"cieb",score:30};
  }
  if(terms.length>=2)return{type:"Aproximação temática no CIEB",basis:"Temas em comum entre eixos do CIEB: "+terms.slice(0,4).join(", ")+".",kind:"cieb",score:25+terms.length};
  return null;
 }
 if((cieb.raw?.bnccLinks||[]).some(link=>link.codigo===other.code)){
  return{type:"Vínculo indicado pelo CIEB",basis:"Esta relação consta no currículo de referência do CIEB. Ela é uma indicação do CIEB, não uma relação formal declarada pela BNCC.",kind:"cieb",score:110};
 }
 return null;
}
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
 if(filter==="competencias")return x.kind==="competencia";
 if(filter==="computacao")return x.kind==="computacao";
 if(filter==="cieb")return x.kind==="cieb";
 if(filter==="reuna")return S.data.reuna?.[x.code]?.tipo==="AF";
 return true;
}
function filtered(a){const q=N(S.q.trim()),f=S.filter;return a.filter(x=>(!f||x.discipline===f||x.area===f)&&matchesStage(x,S.stageFilter)&&(!q||x._search.includes(q)));}
function componentLabel(x){
 if(x.kind==="computacao")return x.axisId?name(x.axisId,S.data.axes):"Competências do Ensino Médio";
 return x.discipline||x.area||"Outros";
}
function reunaCardContext(reunaFocal,x){
 if(!reunaFocal)return null;
 const occ=reunaFocal.mapaDeFoco?.ocorrencias?.[0]?.campoOuUnidade;
 const topicFirst=x?.topic?x.topic.split(' · ')[0].trim():'';
 const unidade=occ||topicFirst||'';
 let label=unidade;
 if(/^campo/i.test(unidade)){
  label=unidade;
 }else if(/espaços|escuta|o eu/i.test(unidade)){
  label='Campo: '+unidade;
 }else if(unidade){
  label='Unidade: '+unidade;
 }
 const isPluri=reunaFocal.ano_faixa&&reunaFocal.ano_faixa.includes(',');
 const pluriClean=reunaFocal.ano_faixa==='1º, 2º, 3º, 4º, 5º'?'1º ao 5º ano':(reunaFocal.ano_faixa+' ano');
 const anoCurto=/crian/i.test(reunaFocal.ano_faixa)?'Crianças pequenas':(/ano/i.test(reunaFocal.ano_faixa)?reunaFocal.ano_faixa:reunaFocal.ano_faixa+' ano');
 const groupDesc=isPluri?('Bloco '+pluriClean):anoCurto;
 const rotulo=reunaFocal.rotulo||('Focal '+reunaFocal.posicao+'/'+reunaFocal.total_grupo+' em '+reunaFocal.componente+' ('+groupDesc+')');
 return {unidade,label,groupDesc,rotulo};
}
function skillConnectionCount(x){
 if(!x)return 0;
 if(x._connectionCount!==undefined)return x._connectionCount;
 const relatedCodes=new Set();
 try{
  for(const r of relations(x,Infinity)){
   if(r.item?.code)relatedCodes.add(r.item.code);
  }
  for(const c of getCompetenciasForSkill(x)){
   if(c.code)relatedCodes.add(c.code);
  }
  const ai=S.data.ai?.[x.code];
  if(ai?.por_componente){
   for(const k in ai.por_componente){
    for(const c of ai.por_componente[k]?.codigos||[])relatedCodes.add(c);
   }
  }
  const reuna=S.data.reuna?.[x.code];
  if(reuna?.mapaDeFoco?.ocorrencias){
   for(const oc of reuna.mapaDeFoco.ocorrencias){
    for(const c of oc.conhecimentoPrevio||[])relatedCodes.add(c);
    const rel=oc.habilidadesRelacionadas||{};
    for(const c of rel.AF||[])relatedCodes.add(c);
    for(const c of rel.AC||[])relatedCodes.add(c);
    for(const c of rel.EF||[])relatedCodes.add(c);
   }
  }
 }catch(e){}
 relatedCodes.delete(x.code);
 x._connectionCount=relatedCodes.size;
 return x._connectionCount;
}
function card(x,railIndex,rowId){
 const component=componentLabel(x),co=color(component);
 const isReunaRow=rowId==="reuna";
 const reunaFocal=S.data.reuna?.[x.code]?.tipo==="AF"?S.data.reuna[x.code]:null;
 const reunaCtx=isReunaRow&&reunaFocal?reunaCardContext(reunaFocal,x):null;
 const anoCurto=reunaFocal?(/crian/i.test(reunaFocal.ano_faixa)?"Crianças pequenas":(/ano/i.test(reunaFocal.ano_faixa)?reunaFocal.ano_faixa:reunaFocal.ano_faixa+" ano")):"";
 const groupLabel=isReunaRow&&reunaFocal
   ? ("Focal "+reunaFocal.posicao+"/"+reunaFocal.total_grupo+" · "+(reunaCtx?.groupDesc||anoCurto))
   : (x.group||x.doc||"BNCC");
 const isTwoLines=Boolean(isReunaRow&&reunaCtx?.label&&reunaCtx.label.length>30);
 const extraBadge=isReunaRow&&reunaFocal
   ? (reunaCtx?.label?'<span class="skill-tag skill-tag--extra skill-tag--theme" title="Unidade temática / Campo da sequência: '+E(reunaCtx.unidade)+'">'+E(reunaCtx.label)+'</span>':'')
   : '';
 const cardTitle=isReunaRow&&reunaCtx?(' title="'+E(reunaCtx.rotulo+(reunaCtx.label?' · '+reunaCtx.label:''))+'"'):'';
 const cardClasses="skill-card"+(isReunaRow?" reuna-card":"")+(isTwoLines?" reuna-theme-lines-2":"");
 const connCount=skillConnectionCount(x);
 const connBadge='<div class="card-bottom-meta"><span class="card-conn-badge" title="'+connCount+' conexões registradas com outras habilidades e referências"><svg class="card-conn-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span>'+connCount+'</span></span></div>';
 return '<article class="'+cardClasses+'" role="button" tabindex="-1" aria-hidden="true" aria-label="'+E(x.code)+': '+E(x.text)+'" data-code="'+E(x.code)+'" data-rail-index="'+E(railIndex)+'" style="--accent:'+co+'"'+cardTitle+'>'
  +'<div class="card-top"><span class="skill-code">'+E(x.code)+'</span><span class="skill-group" title="'+E(reunaCtx?.rotulo||groupLabel)+'">'+E(groupLabel)+'</span></div>'
  +'<div class="card-identity"><span class="skill-tag">'+E(component)+'</span>'+extraBadge+'</div>'
  +'<p class="card-text">'+E(x.text)+'</p>'
  +connBadge
  +'</article>';
}
function shortcuts(){ $("#stageShortcuts").innerHTML=ROWS.map(x=>'<button class="stage-chip'+(S.stageFilter===x.id?' is-active':'')+'" data-scroll="'+x.id+'" style="--chip-stage:'+(x.cor||'#b5a0ff')+'">'+E(x.title)+'</button>').join("");}
function periods(x,rowId){
 const result=[];
 if(rowId==="competencias"){
  if(x.compType==="geral"||x.code.startsWith("CG"))result.push({key:"gerais",label:"Gerais",order:1});
  else if(x.compType==="especifica_de_area")result.push({key:"area",label:"Por Área",order:2});
  else if(x.compType==="especifica_de_componente")result.push({key:"componente",label:"Por Componente",order:3});
  else if(x.compType==="computacao"||x.code.startsWith("CO")||x.code.startsWith("EM-CO")||(x.raw?.tipo||"").includes("computacao"))result.push({key:"comp",label:"Computação",order:4});
  return result;
 }
 if(x.stage==="EI"||x.code.startsWith("EI")){const m=x.code.match(/^EI(0[123])/);if(m){const labels={"01":"Bebês","02":"Crianças bem pequenas","03":"Crianças pequenas"};result.push({key:"ei"+m[1],label:labels[m[1]],order:Number(m[1])});}}
 else if(x.kind==="cieb"&&/infantil/i.test(x.raw.stage))result.push({key:"ei-geral",label:"Educação Infantil",order:4});
 let years=x.years||[];
 if(x.kind==="cieb"&&x.raw.year){const n=parseInt(x.raw.year,10);if(n)years=[n];}
 years.forEach(n=>{n=Number(n);if(n>=1&&n<=9&&(rowId!=="iniciais"||n<=5)&&(rowId!=="finais"||n>=6))result.push({key:"ano"+n,label:n+"º ano",order:10+n});});
 if(x.stage==="EM"||x.code.startsWith("EM")||(x.kind==="cieb"&&/médio|medio/i.test(x.raw?.stage)))result.push({key:"em",label:"Ensino Médio",order:30});
 return result;
}
function rowSearchMarkup(row){
 const searchOpen=Boolean(S.rowSearchOpen?.has(row.id)||(S.rowQueries?.get(row.id)));
 const query=S.rowQueries?.get(row.id)||"";
 return '<div class="row-search-wrap'+(searchOpen?' is-expanded':'')+'" data-row-search-wrap="'+E(row.id)+'"><button type="button" class="row-search-toggle'+(query?' has-query':'')+(searchOpen?' is-active':'')+'" data-row-search-toggle="'+E(row.id)+'" aria-label="Buscar habilidades em '+E(row.title)+'" title="Buscar em '+E(row.title)+'"><svg class="row-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button><div class="row-search-field"'+(searchOpen?'':' hidden')+'><input type="search" class="row-search-input" data-row-search-input="'+E(row.id)+'" placeholder="Buscar em '+E(row.title)+'…" value="'+E(query)+'" aria-label="Buscar em '+E(row.title)+'" autocomplete="off" spellcheck="false"><button type="button" class="row-search-clear'+(query?'':' is-hidden')+'" data-row-search-clear="'+E(row.id)+'" aria-label="Limpar busca" title="Limpar busca">×</button></div></div>';
}
function rowView(row){
 const base=filtered(rowItems(row.id));
 const q=(S.rowQueries?.get(row.id)||"").trim().toLowerCase();
 const matchesQuery=x=>{
  if(!q)return true;
  const code=String(x.code||"").toLowerCase();
  const text=String(x.text||"").toLowerCase();
  const disc=String(x.discipline||x.area||componentLabel(x)||"").toLowerCase();
  const group=String(x.group||"").toLowerCase();
  const field=String(x.field||x.theme||"").toLowerCase();
  const summary=String(x.summary||"").toLowerCase();
  return code.includes(q)||text.includes(q)||disc.includes(q)||group.includes(q)||field.includes(q)||summary.includes(q);
 };
 const filteredBase=q?base.filter(matchesQuery):base;
 const period=S.yearFilters.get(row.id)||"";
 const available=period?filteredBase.filter(x=>periods(x,row.id).some(p=>p.key===period)):filteredBase;
 const selected=S.rowFilters.get(row.id)||"";
 const items=selected?available.filter(x=>componentLabel(x)===selected):available;
 return {base:filteredBase,unfilteredBase:base,period,available,selected,items};
}
function rowPeriodChips(row,view){
 const counts=new Map();view.base.forEach(x=>periods(x,row.id).forEach(p=>{const entry=counts.get(p.key)||{...p,count:0};entry.count++;counts.set(p.key,entry);}));
 if(!counts.size)return "";
 const ordered=new Set(),matching=view.selected?view.base.filter(x=>componentLabel(x)===view.selected):view.base;
 matching.forEach(x=>periods(x,row.id).forEach(p=>ordered.add(p.key)));counts.forEach((_,key)=>ordered.add(key));
 const button=(key,label,count)=>'<button type="button" class="component-chip period-chip'+(view.period===key?' active':'')+'" data-row-period="'+E(row.id)+'" data-period="'+E(key)+'" aria-pressed="'+String(view.period===key)+'"><span>'+E(label)+'</span><span class="component-chip-count">'+count.toLocaleString("pt-BR")+'</span></button>';
 return '<div class="row-periods"><div class="component-rail"><button type="button" class="component-arrow component-arrow-prev" data-component-direction="-1" aria-label="Ver anos ou fases anteriores" hidden>‹</button><div class="row-component-list" role="group" aria-label="Anos e fases em '+E(row.title)+'">'+rowSearchMarkup(row)+button("","Todos",view.base.length)+[...ordered].map(key=>counts.get(key)).map(p=>button(p.key,p.label,p.count)).join("")+'</div><button type="button" class="component-arrow component-arrow-next" data-component-direction="1" aria-label="Ver mais anos ou fases" hidden>›</button></div></div>';
}
function rowComponentChips(row,view){
 const counts=new Map();
 view.available.forEach(x=>{const label=componentLabel(x);counts.set(label,(counts.get(label)||0)+1);});
 if(view.selected&&!counts.has(view.selected))counts.set(view.selected,0);
 const labels={ei:"Campos de experiência",iniciais:"Componentes",finais:"Componentes",em:"Áreas de conhecimento",competencias:"Áreas e componentes",computacao:"Eixos da Computação",cieb:"Eixos do CIEB",reuna:"Componentes e áreas"};
 const label=labels[row.id]||"Componentes";
 const button=(name,count)=>'<button type="button" class="component-chip'+(view.selected===name?' active':'')+'" data-row-component="'+E(row.id)+'" data-component="'+E(name)+'" aria-pressed="'+String(view.selected===name)+'"'+(name?' style="--chip-accent:'+color(name)+'"':'')+'><span class="component-chip-dot" aria-hidden="true"></span><span>'+E(name||"Todos")+'</span><span class="component-chip-count">'+count.toLocaleString("pt-BR")+'</span></button>';
 const searchPrefix=(!rowPeriodChips(row,view))?rowSearchMarkup(row):"";
 return '<div class="row-components"><span class="row-components-label">'+E(label)+'</span><div class="component-rail"><button type="button" class="component-arrow component-arrow-prev" data-component-direction="-1" aria-label="Ver componentes anteriores" hidden>‹</button><div class="row-component-list" role="group" aria-label="'+E(label+' em '+row.title)+'">'+searchPrefix+button("",view.available.length)+[...counts.entries()].map(([name,count])=>button(name,count)).join("")+'</div><button type="button" class="component-arrow component-arrow-next" data-component-direction="1" aria-label="Ver mais componentes" hidden>›</button></div></div>';
}
function railItemIndex(index,count){return count>0?((index%count)+count)%count:-1;}
function createRailState(items){const loop=items.length>1;return {items,loop,start:loop?-RAIL_BUFFER:0,end:loop?RAIL_BATCH:items.length,initialized:false,track:null,frame:null,animationFrame:null,trimTimer:null,savedPosition:null};}
function railMarkup(rail,start,end){if(!rail.items.length)return "";let html="";for(let i=start;i<end;i++)html+=card(rail.items[railItemIndex(i,rail.items.length)],i,rail.rowId);return html;}
function rowIsOpen(row,view){
 if(S.rowState.has(row.id))return S.rowState.get(row.id);
 return Boolean(S.q.trim()||S.filter||S.stageFilter||S.rowQueries?.get(row.id))&&view.base.length>0;
}
function setRowOpen(sec,open){
 if(!sec)return;const id=sec.id.replace(/^row-/,""),rail=S.rails.get(id);
 S.rowState.set(id,open);sec.classList.toggle("is-open",open);sec.classList.toggle("is-collapsed",!open);
 sec.querySelector("[data-row-toggle]")?.setAttribute("aria-expanded",String(open));
 if(open&&rail){rail.initialized=false;initializeRails(sec);}
}
function updateRowSearchResults(sec,row){
 const view=rowView(row);
 const count=view.items.length.toLocaleString("pt-BR")+(view.items.length===1?" item":" itens")+(view.selected?" · "+view.available.length.toLocaleString("pt-BR")+" no total":"");
 const countEl=sec.querySelector(".row-meta");if(countEl)countEl.textContent=count;
 const track=sec.querySelector(".row-track");
 if(track){
  const rail=createRailState(view.items);
  rail.rowId=row.id;
  S.rails.set(row.id,rail);
  const q=(S.rowQueries?.get(row.id)||"").trim();
  const empty=q?'Nenhuma habilidade encontrada para "'+E(q)+'" nesta etapa.':(view.selected?"Nenhuma habilidade neste componente com os filtros atuais. Selecione Todos para voltar à faixa.":"Nenhum resultado nesta faixa.");
  track.innerHTML=view.items.length?railMarkup(rail,rail.start,rail.end):'<div class="empty-row">'+empty+'</div>';
  initializeRail(track,{animateStart:false});
  const prevArrow=sec.querySelector(".rail-prev"),nextArrow=sec.querySelector(".rail-next");
  if(prevArrow)prevArrow.hidden=!rail.loop;
  if(nextArrow)nextArrow.hidden=!rail.loop;
 }
 const periodCounts=new Map();
 view.base.forEach(x=>periods(x,row.id).forEach(p=>periodCounts.set(p.key,(periodCounts.get(p.key)||0)+1)));
 sec.querySelectorAll(".row-periods [data-row-period]").forEach(chip=>{
  const pKey=chip.dataset.period;
  const cEl=chip.querySelector(".component-chip-count");
  if(cEl){
   const n=pKey===""?view.base.length:(periodCounts.get(pKey)||0);
   cEl.textContent=n.toLocaleString("pt-BR");
  }
 });
 const compCounts=new Map();
 view.available.forEach(x=>{const label=componentLabel(x);compCounts.set(label,(compCounts.get(label)||0)+1);});
 sec.querySelectorAll(".row-components [data-row-component]").forEach(chip=>{
  const cKey=chip.dataset.component;
  const cEl=chip.querySelector(".component-chip-count");
  if(cEl){
   const n=cKey===""?view.available.length:(compCounts.get(cKey)||0);
   cEl.textContent=n.toLocaleString("pt-BR");
  }
 });
 if(sec.classList.contains("is-collapsed"))setRowOpen(sec,true);
}
function makeRow(row,view){
 const sec=document.createElement("section"),list=view.items,rail=createRailState(list),open=rowIsOpen(row,view);
 rail.rowId=row.id;
 S.rails.set(row.id,rail);sec.className="catalog-row "+(open?"is-open":"is-collapsed");sec.id="row-"+row.id;
 const rowAccent=view.selected?color(view.selected):(row.cor||(list[0]?color(componentLabel(list[0])):"#b5a0ff"));
 sec.style.setProperty("--row-accent",rowAccent);
 const count=list.length.toLocaleString("pt-BR")+(list.length===1?" item":" itens")+(view.selected?" · "+view.available.length.toLocaleString("pt-BR")+" no total":"");
 const empty=view.selected?"Nenhuma habilidade neste componente com os filtros atuais. Selecione Todos para voltar à faixa.":"Nenhum resultado nesta faixa.";
 sec.innerHTML='<div class="row-head"><div class="row-heading-main"><h3><button type="button" class="row-toggle" data-row-toggle="'+E(row.id)+'" aria-expanded="'+String(open)+'" aria-controls="row-body-'+E(row.id)+'"><span>'+E(row.title)+'</span><span class="row-chevron" aria-hidden="true"></span></button></h3><p class="row-summary">'+E(row.resumo||"")+'</p>'+rowPeriodChips(row,view)+'</div><span class="row-meta row-item-count">'+E(count)+'</span></div><div class="row-body" id="row-body-'+E(row.id)+'">'+rowComponentChips(row,view)+'<div class="row-rail" style="--row-accent:'+rowAccent+'"><button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Cartões anteriores"'+(!rail.loop?' hidden':'')+'>‹</button><div class="row-track" role="region" aria-label="Habilidades de '+E(row.title)+'. Use as setas do teclado para navegar." data-rail="'+E(row.id)+'">'+(list.length?railMarkup(rail,rail.start,rail.end):'<div class="empty-row">'+E(empty)+'</div>')+'</div><button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximos cartões"'+(!rail.loop?' hidden':'')+'>›</button></div></div>';
 return sec;
}
function updateResultCount(){
 const seen=new Set();ROWS.forEach(row=>rowView(row).items.forEach(x=>seen.add(x.code)));
 const countText=seen.size.toLocaleString("pt-BR")+(seen.size===1?" habilidade":" habilidades");
 const countEl=$("#resultCount");if(countEl)countEl.textContent=countText;
 const clearBtn=$("#clearFilters");if(clearBtn)clearBtn.hidden=!Boolean(S.q.trim()||S.filter||S.stageFilter||S.rowFilters.size||S.yearFilters.size);
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
 $("#stageSelect").innerHTML='<option value="">Escolha por etapa</option>'+ROWS.map(r=>'<option value="'+E(r.id)+'"'+(S.stageFilter===r.id?' selected':'')+'>'+E(r.title)+'</option>').join("");
}
function open(code){if(!S.by.has(code))return;if(!$("#catalogPage").hidden){S.catalogScroll=window.scrollY;rememberRailPositions();}history.pushState({code},"","?codigo="+encodeURIComponent(code));detail(code);window.scrollTo({top:0,behavior:"instant"});}
function home(restore=true){SkillGraph.detach();history.pushState({},"",location.pathname);$("#detailPage").hidden=true;$("#detailPage").classList.remove("has-compact-summary");$("#detailPage").querySelectorAll(".detail-nav a.is-active").forEach(a=>{a.classList.remove("is-active");a.removeAttribute("aria-current");});$("#catalogPage").hidden=false;requestAnimationFrame(()=>initializeRails($("#catalogRows")));window.scrollTo({top:restore?(S.catalogScroll||0):0,behavior:"instant"});}
function syncDetailStickySummary(){
 const page=$("#detailPage"),summary=page?.querySelector(".detail-sticky-summary"),title=page?.querySelector(".detail-title");
 if(!page||page.hidden||!summary||!title)return;
 const mobile=typeof window!=="undefined"&&window.matchMedia?window.matchMedia("(max-width:640px)").matches:false,barTop=mobile?0:($(".topbar")?.getBoundingClientRect().bottom||68),visible=title.getBoundingClientRect().bottom<=barTop+4;
 summary.hidden=!visible;summary.setAttribute("aria-hidden",String(!visible));page.classList.toggle("has-compact-summary",visible);
}
function syncDetailNavScrollspy(){
 const page=$("#detailPage");
 if(!page||page.hidden)return;
 const nav=page.querySelector(".detail-nav");
 if(!nav)return;
 const links=[...nav.querySelectorAll("a[href^=\"#\"]")];
 if(!links.length)return;
 const stickyShell=page.querySelector(".detail-sticky-shell");
 const threshold=(stickyShell?stickyShell.getBoundingClientRect().bottom:120)+28;
 const isBottom=typeof window!=="undefined"&&typeof document!=="undefined"&&document.documentElement&&(window.innerHeight+window.scrollY)>=(document.documentElement.scrollHeight-60);
 if(isBottom){
  setActiveDetailNavLink(links,links[links.length-1]);
  return;
 }
 let currentLink=null;const reivindicadas=new Set();
 for(let i=0;i<links.length;i++){
  const link=links[i];
  const targetId=link.getAttribute("href").slice(1);
  let targetEl=document.getElementById(targetId);
  if(!targetEl)continue;
  if(targetId==="detalhe-fonte"&&!targetEl.open)continue;
  if(!targetEl.getClientRects().length){
   // destino dentro de uma seção recolhida: a posição vem do cabeçalho da seção
   targetEl=targetEl.closest(".detail-collapsible");
   if(!targetEl||reivindicadas.has(targetEl))continue;
  }
  if(targetEl.classList.contains("detail-collapsible")){
   if(reivindicadas.has(targetEl))continue;
   reivindicadas.add(targetEl);
  }
  const rect=targetEl.getBoundingClientRect?targetEl.getBoundingClientRect():{top:0};
  if(rect.top<=threshold){
   currentLink=link;
  }
 }
 if(!currentLink){
  currentLink=links[0];
 }
 setActiveDetailNavLink(links,currentLink);
}
function setActiveDetailNavLink(links,activeLink){
 if(!activeLink)return;
 let changed=false;
 for(const link of links){
  const isMatch=link===activeLink;
  if(isMatch){
   if(!link.classList.contains("is-active")){
    link.classList.add("is-active");
    link.setAttribute("aria-current","true");
    changed=true;
   }
  }else{
   if(link.classList.contains("is-active")){
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");
    changed=true;
   }
  }
 }
 if(changed&&activeLink&&typeof activeLink.offsetLeft==="number"){
  const nav=activeLink.closest(".detail-nav");
  if(nav&&nav.scrollWidth>nav.clientWidth&&typeof nav.scrollTo==="function"){
   const linkLeft=activeLink.offsetLeft,linkWidth=activeLink.offsetWidth;
   const navLeft=nav.scrollLeft,navWidth=nav.clientWidth;
   if(linkLeft<navLeft+24){
    nav.scrollTo({left:Math.max(0,linkLeft-28),behavior:"smooth"});
   }else if(linkLeft+linkWidth>navLeft+navWidth-24){
    nav.scrollTo({left:linkLeft+linkWidth-navWidth+28,behavior:"smooth"});
   }
  }
 }
}
function syncCatalogNavScrollspy(){
 const page=$("#catalogPage");
 if(!page||page.hidden)return;
 const stageShortcuts=$("#stageShortcuts");
 if(!stageShortcuts)return;
 const chips=[...stageShortcuts.querySelectorAll("button[data-scroll]")];
 if(!chips.length)return;
 if(S.stageFilter){
  for(const chip of chips){
   const isMatch=chip.dataset.scroll===S.stageFilter;
   chip.classList.toggle("is-active",isMatch);
   if(isMatch)chip.setAttribute("aria-current","true");else chip.removeAttribute("aria-current");
  }
  return;
 }
 const bar=$(".topbar"),stageBar=$(".stage-sticky-shell, .hero-catalog");
 const barHeight=bar&&getComputedStyle(bar).position==="sticky"?bar.getBoundingClientRect().height:0;
 const stageHeight=stageBar?stageBar.getBoundingClientRect().height:0;
 const threshold=barHeight+stageHeight+40;
 const isBottom=typeof window!=="undefined"&&typeof document!=="undefined"&&document.documentElement&&(window.innerHeight+window.scrollY)>=(document.documentElement.scrollHeight-60);
 if(isBottom){
  setActiveCatalogStageChip(chips,chips[chips.length-1]);
  return;
 }
 let currentChip=null;
 for(let i=0;i<chips.length;i++){
  const chip=chips[i];
  const row=document.getElementById("row-"+chip.dataset.scroll);
  if(!row||row.hidden||row.style.display==="none")continue;
  const rect=row.getBoundingClientRect();
  if(rect.top<=threshold){
   currentChip=chip;
  }
 }
 if(!currentChip&&typeof window!=="undefined"&&window.scrollY<180){
  currentChip=null;
 }else if(!currentChip){
  currentChip=chips[0];
 }
 setActiveCatalogStageChip(chips,currentChip);
}
function setActiveCatalogStageChip(chips,activeChip){
 let changed=false;
 for(const chip of chips){
  const isMatch=chip===activeChip;
  if(isMatch){
   if(!chip.classList.contains("is-active")){
    chip.classList.add("is-active");
    chip.setAttribute("aria-current","true");
    changed=true;
   }
  }else{
   if(chip.classList.contains("is-active")){
    chip.classList.remove("is-active");
    chip.removeAttribute("aria-current");
    changed=true;
   }
  }
 }
 if(changed&&activeChip&&typeof activeChip.offsetLeft==="number"){
  const nav=activeChip.closest(".stage-shortcuts");
  if(nav&&nav.scrollWidth>nav.clientWidth&&typeof nav.scrollTo==="function"){
   const chipLeft=activeChip.offsetLeft,chipWidth=activeChip.offsetWidth;
   const navLeft=nav.scrollLeft,navWidth=nav.clientWidth;
   if(chipLeft<navLeft+20){
    nav.scrollTo({left:Math.max(0,chipLeft-24),behavior:"smooth"});
   }else if(chipLeft+chipWidth>navLeft+navWidth-20){
    nav.scrollTo({left:chipLeft+chipWidth-navWidth+24,behavior:"smooth"});
   }
  }
 }
}
function detailHeaderHtml(x){
 const raw=x.raw||{},source=x.source||{};
 const isComp=x.kind==="competencia";
 const compTipoLabel=isComp?(
  x.compType==="geral"?"Competência Geral da Educação Básica":
  x.compType==="especifica_de_area"?"Competência Específica de Área":
  x.compType==="especifica_de_componente"?"Competência Específica de Componente Curricular":
  (x.stage==="EM"?"Competência do Ensino Médio em Computação":"Competência Geral de Computação")
 ):null;
 const sourceTitle=x.kind==="cieb"?"Currículo de Referência em Tecnologia e Computação · CIEB":(x.kind==="computacao"||(isComp&&x.compType==="computacao"))?"Complemento de Computação à BNCC · Parecer CNE/CEB nº 2/2022":"Base Nacional Comum Curricular · 2018";
 const sourceSummary=[...new Set([sourceTitle,source.arquivo,source.localizador,source.localizador_pdf,source.proveniencia,x.kind!=="cieb"?VERSION:null].filter(Boolean))].join(" · ");
 const facts=[
  ["Etapa e recorte",x.group||x.stage],
  ["Tipo de competência",compTipoLabel],
  ["Número oficial",raw.numero?"Competência nº "+raw.numero:null],
  ["Componente curricular",x.discipline],
  ["Área de conhecimento",x.area&&x.area!==x.discipline?x.area:null],
  ["Nível de maturidade sugerido",(raw.maturity?.escola||raw.maturity?.docente)?[raw.maturity.escola?"Escola: "+raw.maturity.escola:"",raw.maturity.docente?"Docente: "+raw.maturity.docente:""].filter(Boolean).join(" · "):null],
  ["Seriação",raw.seriacao],
  ["Vigência",raw.vigencia?.status?raw.vigencia.status+(raw.vigencia.desde?" · desde "+raw.vigencia.desde:"")+(raw.vigencia.ate?" · até "+raw.vigencia.ate:""):null],
  ["Documento de origem",sourceSummary]
 ].filter(r=>r[1]);
 const contexts=[],seen=new Set(),add=(kind,value)=>{if(!value)return;const key=kind+"|"+value;if(seen.has(key))return;seen.add(key);contexts.push([kind,value]);};
 if(isComp){
  if(x.compType==="geral")add("Abrangência transversal","Mobilizada em todas as etapas da Educação Básica (Educação Infantil, Ensino Fundamental e Ensino Médio).");
  else if(x.compType==="computacao")add("Abrangência","Eixos de Pensamento Computacional, Mundo Digital e Cultura Digital na BNCC.");
  else if(x.compType==="especifica_de_area")add("Abrangência","Competência articuladora da área de conhecimento "+(x.area||"BNCC")+".");
  else if(x.compType==="especifica_de_componente")add("Abrangência","Competência articuladora do componente curricular "+(x.discipline||"BNCC")+".");
 }
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
  if(raw.unitName)add("Unidade curricular",raw.unitName);
  if(raw.unitType)add("Tipo de unidade curricular",raw.unitType);
  if(raw.workload)add("Carga horária",raw.workload);
  if(raw.axisCompetencies?.length)add("Competências do eixo CIEB",raw.axisCompetencies.join(", "));
  if(raw.teacherProfile)add("Perfil docente sugerido",raw.teacherProfile);
  if(raw.generalCompetencies?.length)add("Competências gerais indicadas pelo CIEB",raw.generalCompetencies.map(h=>h.codigo).join(", "));
  if(raw.keywords?.length)add("Palavras-chave CIEB",raw.keywords.join(", "));
  const missing=(raw.bnccLinks||[]).filter(h=>!S.by.has(h.codigo));if(missing.length)add("Códigos BNCC indicados pelo CIEB sem registro no catálogo",missing.map(h=>h.codigo).join(", "));
 }
 if(raw.alinhamento)add("Alinhamento entre faixas",raw.alinhamento);
 const factHtml=facts.map(([label,value])=>{
  const isSource=label==="Documento de origem",href=x.kind==="cieb"?"https://curriculo.cieb.net.br/":"https://github.com/bncc-dev/bncc-dados",credit=x.kind==="cieb"?"Currículo de referência do CIEB":"Dados estruturados: bncc.dev (mantido pela Profy), CC BY 4.0";
  if(isSource){
   return '<details class="detail-header-fact detail-header-fact-source" id="detalhe-fonte">'
    +'<summary class="detail-source-summary">'
    +'<span>'+E(label)+'</span>'
    +'<span class="detail-source-toggle"><span class="detail-source-closed">Ver origem e proveniência ▾</span><span class="detail-source-opened">Recolher ▴</span></span>'
    +'</summary>'
    +'<div class="detail-source-content">'
    +'<strong>'+E(value)+'</strong>'
    +'<a class="detail-header-source-link" href="'+href+'" target="_blank" rel="noopener noreferrer">'+E(credit)+' ↗</a>'
    +'</div>'
    +'</details>';
  }
  return '<div class="detail-header-fact"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>';
 }).join("");
 const contextHtml=contexts.length?'<div class="detail-header-contexts"><span class="detail-header-label">Contextos e competências</span><ul>'+contexts.map(([label,value])=>'<li><span>'+E(label)+'</span><strong>'+E(value)+'</strong></li>').join("")+'</ul></div>':'<p class="detail-header-empty">A fonte não informa contextos adicionais para este registro.</p>';
 return '<section class="detail-header-info" id="detalhe-organizacao" aria-label="Enquadramento curricular"><div class="detail-header-info-title"><span>ENQUADRAMENTO CURRICULAR</span><a href="./documentacao.html">Documentação das fontes <b aria-hidden="true">↗</b></a></div><div class="detail-header-facts">'+factHtml+'</div>'+contextHtml+'</section>';
}
function getExtraCardBadge(currentSkill,y,z){
 if(!z)return "";
 if(z.badge)return z.badge;
 if(z.conf!==undefined&&z.conf!==null){
  const pct=Math.round(Number(z.conf)>1?Number(z.conf):Number(z.conf)*100);
  return pct+"% similaridade";
 }
 if(z.similarity!==undefined&&z.similarity!==null){
  const pct=Math.round(Number(z.similarity)>1?Number(z.similarity):Number(z.similarity)*100);
  return pct+"% similaridade";
 }
 const uA=currentSkill?.raw?.organizacao?.unidade_tematica;
 const uB=y?.raw?.organizacao?.unidade_tematica;
 if(uA&&uB&&uA===uB){
  const uNome=name(uA,S.data.ctx);
  if(uNome)return uNome;
 }
 if(uB&&currentSkill?.discipline===y.discipline){
  const uNome=name(uB,S.data.ctx);
  if(uNome)return uNome;
 }
 const obj=(currentSkill?.objectIds||[]).filter(x=>(y?.objectIds||[]).includes(x));
 if(obj.length){
  const objNome=name(obj[0],currentSkill?.kind==="computacao"?S.data.objects:S.data.ctx);
  if(objNome)return objNome;
 }
 if(z.kind==="cieb")return "Vínculo CIEB";
 return "";
}
function relationCard({item:y,rel:z}){
 const component=componentLabel(y),co=color(component);
 const extraBadge=getExtraCardBadge(S.currentSkill,y,z);
 const extraHtml=extraBadge?'<span class="skill-tag skill-tag--extra">'+E(extraBadge)+'</span>':'';
 return '<article class="skill-card relation-card detail-rail-card" role="button" tabindex="0" data-code="'+E(y.code)+'" data-detail-kind="skill" data-component="'+E(component)+'" data-rel-type="'+E(z.type||"Referência")+'" data-rel-basis="'+E(z.basis||"")+'" data-rel-kind="'+E(z.kind||"")+'" style="--accent:'+co+'">'
  +'<div class="card-top"><span class="skill-code">'+E(y.code)+'</span><span class="skill-group">'+E(y.group||y.doc||"BNCC")+'</span></div>'
  +'<div class="card-identity"><span class="skill-tag">'+E(component)+'</span>'+extraHtml+'</div>'
  +'<p class="card-text">'+E(y.text)+'</p>'
  +'<div class="card-foot"><span>1 clique: detalhes · 2 cliques: abrir</span><span aria-hidden="true">↗</span></div>'
  +'</article>';
}
function relatedListHtml(list,kind,empty){const cards=list.slice(0,6).map(relationCard).join(""),remaining=Math.max(0,list.length-6);return '<div class="relation-grid">'+(cards||'<p class="empty-message">'+E(empty)+'</p>')+'</div>'+(remaining?'<details class="more-relations" data-relation-kind="'+E(kind)+'"><summary>Ver mais '+remaining+' habilidades relacionadas</summary><div class="relation-grid" data-relation-grid></div><button class="load-more-relations" type="button">Carregar mais</button></details>':"");}
function ciebRelations(x,related){
 const items=new Map(related.filter(r=>r.item.kind==="cieb").map(r=>[r.item.code,r])),byCode=new Map(S.all.filter(y=>y.kind==="cieb").map(y=>[y.code,y]));
 for(const y of S.data.cieb){if(y.code===x.code||items.has(y.code))continue;const item=byCode.get(y.code);if(!item)continue;const explicit=(y.bnccLinks||[]).some(h=>h.codigo===x.code);if(!explicit)continue;items.set(y.code,{item,rel:{kind:"cieb",type:"Vínculo indicado pelo CIEB",basis:"Esta relação consta no currículo de referência do CIEB.",score:110}});}
 return [...items.values()].sort((a,b)=>b.rel.score-a.rel.score||a.item.code.localeCompare(b.item.code));
}
function ehComputacao(x){return x.kind==="computacao"||x.kind==="cieb";}
function detailRelations(x){
 const related=relations(x,Infinity);
 if(x.kind==="competencia"){
  return {
   curriculo:related.filter(r=>r.item.kind==="bncc"||r.item.kind==="computacao"),
   cieb:related.filter(r=>r.item.kind==="cieb"),
   competencias:related.filter(r=>r.item.kind==="competencia")
  };
 }
 const computacao=ehComputacao(x);
 return {curriculo:related.filter(r=>computacao?r.item.kind==="bncc":(r.item.kind==="computacao"||r.item.kind==="cieb")),cieb:ciebRelations(x,related)};
}
function detailChipsHtml(items,getComponentFn){
 if(!items||items.length<=3)return '';
 const counts=new Map();
 for(const item of items){
  const comp=getComponentFn(item)||"Outros";
  counts.set(comp,(counts.get(comp)||0)+1);
 }
 const chips=['<button type="button" class="component-chip active" data-detail-chip="" aria-pressed="true"><span class="component-chip-dot" aria-hidden="true"></span><span>Todos</span><span class="component-chip-count">'+items.length+'</span></button>'];
 for(const [name,count] of counts.entries()){
  chips.push('<button type="button" class="component-chip" data-detail-chip="'+E(name)+'" aria-pressed="false" style="--chip-accent:'+color(name)+'"><span class="component-chip-dot" aria-hidden="true"></span><span>'+E(name)+'</span><span class="component-chip-count">'+count+'</span></button>');
 }
 return '<div class="row-components detail-chips-row"><div class="component-rail"><div class="row-component-list" role="group" aria-label="Filtrar por componente">'+chips.join("")+'</div></div></div>';
}
function relatedMapListHtml(related,x){
 if(!related?.length)return '';
 const isComp=x?.kind==="competencia";
 const isCompOrCieb=x&&ehComputacao(x);
 const heading=isComp?"Habilidades articuladas":(isCompOrCieb?"Habilidades da BNCC":"Computação");
 const chipsHtml=detailChipsHtml(related,r=>componentLabel(r.item));
 const accent=isComp?"#a49aff":(isCompOrCieb?"#61b8ff":"#f083b4");
 return '<div class="map-related-list detail-faixa-group" style="--row-accent:'+accent+'">'
  +'<div class="faixa-head"><h3 class="related-heading">'+heading+' <span>'+related.length+'</span></h3>'+chipsHtml+'</div>'
  +'<div class="row-rail detail-row-rail" data-relation-kind="curriculo">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Cartões anteriores"'+(related.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="'+heading+' relacionadas">'
  +related.map(relationCard).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximos cartões"'+(related.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
  +'</div>';
}
function mapWorkspaceHtml(x,related){
 if(ehComputacao(x)){
  if(!related?.length)return '';
  return '<section class="detail-section" id="detalhe-computacao">'+relatedMapListHtml(related,x)+'</section>';
 }
 if(x.kind==="competencia"){
  if(!related?.length)return '';
  return '<section class="detail-section" id="detalhe-articulacoes"><div class="section-heading"><span class="section-number">⌘</span><div><h2>Habilidades articuladas</h2><p class="section-caption">Habilidades da BNCC e de Computação articuladas ao desenvolvimento desta competência.</p></div></div>'+relatedMapListHtml(related,x)+'</section>';
 }
 const relacoes='<section class="detail-section" id="detalhe-relacoes"><div class="section-heading"><span class="section-number">⌘</span><div><h2>Relações de progressão</h2><p class="section-caption">As referências anteriores e posteriores desta habilidade, organizadas por etapa.</p></div></div><div id="detalhe-relacoes-conteudo"><div class="loading-state" role="status">Carregando relações…</div></div></section>';
 const mapa='<section class="detail-section map-workspace" id="detalhe-mapa-progressao"><div class="section-heading"><span class="section-number">⌘</span><div><h2>Mapa de progressão</h2><p class="section-caption">Explore a progressão em colunas por ano ou fase e alterne entre o mapa completo e o mapa focal.</p></div></div><div id="detalhe-mapa-conteudo"><div class="loading-state" role="status">Carregando mapa…</div></div></section>';
 const computacao=related?.length?'<section class="detail-section" id="detalhe-computacao"><div class="section-heading"><span class="section-number">↗</span><div><h2>Computação</h2><p class="section-caption">Habilidades do complemento de Computação que se relacionam a esta habilidade.</p></div></div>'+relatedMapListHtml(related,x)+'</section>':'';
 return relacoes+mapa+computacao;
}
function aiHtml(x){
 const entry=S.data.ai[x.code];if(!entry?.por_componente)return "";
 const groups=Object.entries(entry.por_componente).filter(([,d])=>d&&((d.codigos||[]).length||d.justificativa||d.atividade));
 const conceitos=entry.conceitos||[];

 const conceitosHtml=conceitos.length?(
  '<div class="concept-group detail-faixa-group" id="detalhe-conceitos" style="--row-accent:#9c78d4">'
  +'<h3 class="related-heading">Conceitos de aproximação <span>'+conceitos.length+'</span></h3>'
  +'<div class="row-rail detail-row-rail">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Conceitos anteriores"'+(conceitos.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="Conceitos de aproximação">'
  +conceitos.map(t=>
    '<article class="skill-card detail-rail-card detail-concept-card" role="button" tabindex="0" data-detail-kind="concept" data-concept="'+E(t)+'" style="--accent:#9c78d4">'
    +'<div class="card-top"><span class="skill-code">'+E(t)+'</span><span class="skill-group">Aproximação</span></div>'
    +'<div class="card-identity"><span class="skill-tag">Conceito-chave</span></div>'
    +'<p class="card-text">Conceito de aproximação temática articulado a esta aprendizagem para conexões curriculares e contextualização pedagógica.</p>'
    +'<div class="card-foot"><span>1 clique: detalhes</span><span aria-hidden="true">↗</span></div>'
    +'</article>'
  ).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximos conceitos"'+(conceitos.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
  +'</div>'
 ):"";

 const chipsHtml=detailChipsHtml(groups,([comp])=>comp);
 const suggestionsHtml=groups.length?(
  '<div class="ai-suggestions-group detail-faixa-group" style="--row-accent:#f0ad68">'
  +'<div class="faixa-head">'
  +'<h3 class="related-heading">Sugestões interdisciplinares <span>'+groups.length+'</span></h3>'
  +chipsHtml
  +'</div>'
  +'<div class="row-rail detail-row-rail">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Sugestões anteriores"'+(groups.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="Sugestões interdisciplinares">'
  +groups.map(([component,d])=>{
    const codes=[...new Set(d.codigos||[])];
    const confStr=d.confianca?String(d.confianca):"";
    const confBadge=confStr?'<span class="skill-tag skill-tag--extra">'+E(confStr.includes("%")?confStr:confStr+" similaridade")+'</span>':"";
    const codesTop=codes.length?codes.map(c=>'<span class="rel-code" data-code="'+E(c)+'">'+E(c)+'</span>').join(" · "):"IA";
    return '<article class="ai-card" data-ai-component="'+E(component)+'">'
      +'<div class="card-top"><span class="skill-code">'+codesTop+'</span><span class="skill-group">SUGESTÃO DE IA</span></div>'
      +'<div class="card-identity"><span class="skill-tag">'+E(component)+'</span>'+confBadge+'</div>'
      +'<p class="card-text">'+E(d.justificativa||"Relação sugerida na base interdisciplinar.")+'</p>'
      +(d.atividade?'<details class="activity-detail sr-only"><summary>Atividade</summary><p>'+E(d.atividade)+'</p></details>':"")
      +'<div class="card-foot"><span>1 clique: detalhes · 2 cliques: abrir</span><span aria-hidden="true">↗</span></div>'
      +'</article>';
  }).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximas sugestões"'+(groups.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
  +'</div>'
 ):"";

 return '<section class="detail-section" id="detalhe-interdisciplinar">'
  +'<div class="section-heading"><span class="section-number">↗</span><div><h2>Interdisciplinaridade</h2><p class="section-caption">Possibilidades geradas por IA para apoiar o planejamento e a revisão docente.</p></div></div>'
  +conceitosHtml
  +suggestionsHtml
  +'</section>';
}
function ciebHtml(x,list){
 const raw=x.raw||{},isCieb=x.kind==="cieb";
 const maturityTags=[
  raw.maturity?.escola?'<span class="cieb-pill cieb-pill--school">Maturidade da escola: <strong>'+E(raw.maturity.escola)+'</strong></span>':'',
  raw.maturity?.docente?'<span class="cieb-pill cieb-pill--teacher">Maturidade docente: <strong>'+E(raw.maturity.docente)+'</strong></span>':''
 ].filter(Boolean).join("");
 const keywordsTags=(raw.keywords||[]).map(k=>'<span class="cieb-keyword-chip">'+E(k)+'</span>').join("");
 const metaBlockHtml=isCieb&&(maturityTags||keywordsTags)?(
  '<div class="info-block cieb-meta-block">'
  +(maturityTags?'<div class="cieb-meta-line"><span class="cieb-block-label">Nível de maturidade sugerido</span><div class="cieb-pills-list">'+maturityTags+'</div></div>':'')
  +(keywordsTags?'<div class="cieb-meta-line"><span class="cieb-block-label">Palavras-chave</span><div class="cieb-keywords-list">'+keywordsTags+'</div></div>':'')
  +'</div>'
 ):"";
 const guidance=isCieb?[["Práticas sugeridas",raw.practices||[]],["Avaliação sugerida",raw.evaluations||[]],["Atitudes e valores",raw.attitudes||[]],["Recursos didáticos",raw.resources||[]],["Temáticas integradoras",raw.tematicas||[]]].filter(([,items])=>items.length):[];
 const guidanceHtml=guidance.length?'<div class="detail-columns cieb-guidance cieb-guidance-stacked">'+guidance.map(([label,items])=>'<div class="info-block"><h3>'+E(label)+'</h3><ul>'+items.map(t=>'<li>'+E(t)+'</li>').join("")+'</ul></div>').join("")+'</div>':"";
 const materialsHtml=isCieb&&raw.materials?.length?(
  '<div class="info-block cieb-materials-block">'
  +'<h3>Materiais e referências de apoio <span class="cieb-count-pill">'+raw.materials.length+'</span></h3>'
  +'<ul class="cieb-materials-list">'
  +raw.materials.map(m=>{
    const lang=m.idioma?'<span class="cieb-material-lang">'+E(m.idioma)+'</span>':'';
    const link=m.link||'#';
    return '<li class="cieb-material-item">'
      +'<a class="cieb-material-link" href="'+E(link)+'" target="_blank" rel="noopener noreferrer">'
      +'<span class="cieb-material-title">'+E(m.nome||link)+'</span>'
      +'<svg class="cieb-ext-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
      +'</a>'
      +lang
      +'</li>';
  }).join("")
  +'</ul></div>'
 ):"";
 const structureHtml=raw.structure?.length?(
  '<div class="info-block cieb-structure-block" style="margin-top:1.25rem;">'
  +'<h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;color:var(--text, #f0f4fc);">Estrutura e detalhamento da unidade curricular</h3>'
  +'<div class="cieb-structure-grid" style="display:flex;flex-direction:column;gap:0.75rem;">'
  +raw.structure.map(s=>
    '<div class="cieb-structure-item" style="padding:0.75rem 1rem;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">'
    +(s.habilidades?'<p style="margin:0 0 0.35rem 0;"><strong>Habilidade específica:</strong> '+E(s.habilidades)+'</p>':'')
    +(s.conhecimentos?'<p style="margin:0 0 0.35rem 0;"><strong>Conhecimentos:</strong> '+E(s.conhecimentos)+'</p>':'')
    +(s.praticas_sugeridas?'<p style="margin:0;"><strong>Práticas sugeridas:</strong> '+E(s.praticas_sugeridas)+'</p>':'')
    +'</div>'
  ).join("")
  +'</div></div>'
 ):"";
 const chipsHtml=detailChipsHtml(list,r=>componentLabel(r.item));
 const railHtml=list.length?(
  '<div class="row-rail detail-row-rail" data-relation-kind="cieb">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Habilidades CIEB anteriores"'+(list.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="Habilidades CIEB relacionadas">'
  +list.map(relationCard).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximas habilidades CIEB"'+(list.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
 ):'<p class="empty-message">Nenhuma referência CIEB diretamente vinculada a esta habilidade.</p>';
 return '<section class="detail-section" id="detalhe-cieb"><div class="section-heading"><span class="section-number">↗</span><div><h2>Computação e currículo CIEB</h2><p class="section-caption">Vínculos oficiais indicados pelo CIEB e orientações complementares em tecnologia e computação.</p></div></div>'+metaBlockHtml+guidanceHtml+materialsHtml+structureHtml+'<div class="detail-faixa-group" style="--row-accent:#7dc9e8"><div class="faixa-head"><h3 class="related-heading">Habilidades CIEB relacionadas <span>'+list.length+'</span></h3>'+chipsHtml+'</div>'+railHtml+'</div></section>';
}
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
function reunaRelCardsHtml(codes,k,expl,area,ano){
 const items=codes.map(c=>{
  const it=S.by.get(c)||{code:c,text:'Habilidade indicada no Mapa de Foco do Instituto Reúna.',discipline:area,group:ano};
  const explicacao=expl&&expl[c];
  const rel={
   type:REUNA_CLASSES[k]||"Aprendizagem focal (AF)",
   basis:explicacao||("Habilidade classificada como "+(REUNA_CLASSES[k]||k)+" no Mapa de Foco da BNCC do Instituto Reúna."),
   kind:"reuna-"+k.toLowerCase(),
   badge:k==="AF"?"Aprendizagem Focal":(k==="AC"?"Aprendizagem Complementar":"Expectativa de Fluência")
  };
  return {item:it,rel};
 });
 const heading=REUNA_CLASSES[k]||"Habilidades relacionadas";
 const chipsHtml=detailChipsHtml(items,r=>componentLabel(r.item));
 return '<div class="detail-faixa-group reuna-faixa-group" data-relation-kind="reuna-'+E(k.toLowerCase())+'" style="--row-accent:#d991f1">'
  +'<div class="faixa-head"><h4 class="related-heading">'+E(heading)+' <span>'+items.length+'</span></h4>'+chipsHtml+'</div>'
  +'<div class="row-rail detail-row-rail">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Cartões anteriores"'+(items.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="'+E(heading)+'">'
  +items.map(relationCard).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximos cartões"'+(items.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
  +'</div>';
}
function reunaOccurrenceHtml(o,resumo,area,code){
 const comp=o.competencias||{},rel=o.habilidadesRelacionadas||{},expl=o.explicacoesRelacionadas||{},parts=[];
 if(o.conhecimentoPrevio&&o.conhecimentoPrevio.length)parts.push(reunaBlock("Conhecimento prévio",reunaChipsGroup(o.conhecimentoPrevio)));
 if(o.objetivos&&o.objetivos.length)parts.push(reunaBlock("Objetivos de aprendizagem",reunaList(o.objetivos)));
 const refs=[];["CG","CA","CE"].forEach(k=>(comp[k]||[]).forEach(n=>refs.push(reunaCompRef(k,n,area,code))));
 if(refs.length)parts.push(reunaBlock("Competências relacionadas",reunaCompGroup(refs)));
 ["AF","AC","EF"].forEach(k=>{if(rel[k]&&rel[k].length)parts.push(reunaRelCardsHtml(rel[k],k,expl,area,o.ano));});
 if(o.comentario)parts.push('<details class="reuna-comment" open><summary>Comentário pedagógico</summary><p>'+E(o.comentario)+'</p></details>');
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
function modalAbrirInfo(opts){
 let d=document.getElementById("habilidadeDialog");
 if(!d){
  d=document.createElement("dialog");
  d.id="habilidadeDialog";d.className="hab-dialog";d.setAttribute("aria-labelledby","habilidadeDialogTitulo");
  d.addEventListener("click",e=>{if(e.target===d)d.close();});
  document.body.appendChild(d);
 }
 let acoesHtml=opts.acoes;
 if(!acoesHtml){
  if(opts.code){
   const isComp=opts.kicker&&opts.kicker.toLowerCase().includes("competência");
   const defaultBtnText=isComp?"Ir para os detalhes da competência →":"Ir para os detalhes da habilidade →";
   acoesHtml='<div class="hab-dialog-acoes"><button type="button" class="print-btn print-btn--primary" data-hab-abrir="'+E(opts.code)+'">'+E(opts.botaoTexto||defaultBtnText)+'</button><button type="submit" class="print-btn" value="fechar">Fechar</button></div>';
  }else{
   acoesHtml='<div class="hab-dialog-acoes"><button type="submit" class="print-btn print-btn--primary" value="fechar">Fechar</button></div>';
  }
 }
 d.innerHTML='<form method="dialog" class="hab-dialog-form">'
  +'<div class="hab-dialog-topo"><span class="hab-dialog-kicker">'+E(opts.kicker||"Detalhes")+'</span><button type="submit" class="hab-dialog-fechar" value="fechar" aria-label="Fechar">×</button></div>'
  +'<h2 id="habilidadeDialogTitulo">'+E(opts.title||"")+'</h2>'
  +(opts.meta?'<p class="hab-dialog-meta">'+E(opts.meta)+'</p>':'')
  +(opts.corpo||'')
  +(opts.texto?'<p class="hab-dialog-texto">'+E(opts.texto)+'</p>':'')
  +acoesHtml
  +'</form>';
 d.querySelectorAll("[data-hab-abrir]").forEach(btn=>{
  btn.addEventListener("click",()=>{d.close();open(btn.dataset.habAbrir);});
 });
 if(!d.open)d.showModal();
}
function habilidadeModalAbrir(code,extra){
 const x=S.by.get(code);if(!x)return;
 let d=document.getElementById("habilidadeDialog");
 if(!d){
  d=document.createElement("dialog");
  d.id="habilidadeDialog";d.className="hab-dialog";d.setAttribute("aria-labelledby","habilidadeDialogTitulo");
  d.addEventListener("click",e=>{if(e.target===d)d.close();});
  document.body.appendChild(d);
 }
 const isComp=x.kind==="competencia";
 const meta=[x.discipline,x.group||x.stage,x.area&&x.area!==x.discipline?x.area:null].filter(Boolean).join(" · ");
 let relHtml="";
 if(extra&&(extra.relType||extra.relBasis||extra.relConf)){
  relHtml='<div class="hab-dialog-rel"><strong>'+E(extra.relType||"Relação")+(extra.relConf?' · <span class="progress-badge is-suggested">'+E(extra.relConf)+'</span>':'')+'</strong>'+(extra.relBasis?'<p>'+E(extra.relBasis)+'</p>':'')+'</div>';
 }
 const kicker=isComp?"Competência":(x.kind==="cieb"?"Referência CIEB":"Habilidade");
 const btnText=isComp?"Ir para os detalhes da competência →":"Ir para os detalhes da habilidade →";
 d.innerHTML='<form method="dialog" class="hab-dialog-form">'
  +'<div class="hab-dialog-topo"><span class="hab-dialog-kicker">'+E(kicker)+'</span><button type="submit" class="hab-dialog-fechar" value="fechar" aria-label="Fechar">×</button></div>'
  +'<h2 id="habilidadeDialogTitulo">'+E(x.code)+'</h2>'
  +'<p class="hab-dialog-meta">'+E(meta)+'</p>'
  +relHtml
  +habilidadeMapaHtml(code)
  +'<p class="hab-dialog-texto">'+E(x.text)+'</p>'
  +'<div class="hab-dialog-acoes"><button type="button" class="print-btn print-btn--primary" data-hab-abrir="'+E(code)+'">'+E(btnText)+'</button><button type="submit" class="print-btn" value="fechar">Fechar</button></div>'
  +'</form>';
 d.querySelectorAll("[data-hab-abrir]").forEach(btn=>{
  btn.addEventListener("click",()=>{d.close();open(btn.dataset.habAbrir);});
 });
 if(!d.open)d.showModal();
}
function openCardDetailModal(card){
 const kind=card.dataset.detailKind;
 if(kind==="concept"){
  modalAbrirInfo({
   kicker:"Conceito de Aproximação",
   title:card.dataset.concept||"Conceito",
   meta:"Articulação Interdisciplinar",
   texto:"Conceito estruturante articulado a esta aprendizagem nas conexões interdisciplinares. Apoia o diálogo entre diferentes componentes curriculares e o planejamento de atividades integradas."
  });
  return;
 }
 if(kind==="competency"){
  const code=card.dataset.code||card.dataset.rotulo;
  const targetCode=code&&(S.by.has(code)?code:resolveCompDetails({id:code,rotulo:card.dataset.rotulo})?.code);
  const finalCode=targetCode&&(S.by.has(targetCode)?targetCode:code);
  modalAbrirInfo({
   kicker:card.dataset.tipo||"Competência",
   title:card.dataset.rotulo||code||"Competência",
   meta:card.dataset.area||"BNCC",
   texto:card.dataset.texto||"",
   code:finalCode,
   botaoTexto:"Ir para os detalhes da competência →"
  });
  return;
 }
 if(kind==="ai-suggestion"||card.classList.contains("ai-card")||card.dataset.aiComponent){
  const comp=card.dataset.aiComponent||"Sugestão";
  const just=card.querySelector(".card-text")?.textContent||card.querySelector("p")?.textContent||card.dataset.justificativa||"";
  const ativ=card.querySelector(".activity-detail p")?.textContent||card.dataset.atividade||"";
  const conf=card.querySelector(".skill-tag--extra")?.textContent||card.querySelector(".rel-type")?.textContent||card.dataset.confianca||"";
  const codes=[...card.querySelectorAll("[data-code]")].map(c=>c.dataset.code).filter(Boolean);
  const codesHtml=codes.length?'<div class="hab-dialog-codes"><span>Habilidades sugeridas:</span><div class="ai-card-codes">'+codes.map(c=>'<button type="button" class="print-btn print-btn--small" data-hab-abrir="'+E(c)+'">'+E(c)+' →</button>').join("")+'</div></div>':'';
  const corpo='<div class="hab-dialog-ai-corpo">'
   +(conf?'<p class="hab-dialog-meta"><strong>Confiança informada:</strong> '+E(conf)+'</p>':'')
   +(just?'<div class="hab-dialog-bloco"><strong>Justificativa pedagógica:</strong><p>'+E(just)+'</p></div>':'')
   +(ativ?'<div class="hab-dialog-bloco"><strong>Sugestão de atividade:</strong><p>'+E(ativ)+'</p></div>':'')
   +codesHtml
   +'</div>';
  modalAbrirInfo({
   kicker:"Sugestão Interdisciplinar · IA",
   title:comp,
   meta:"Conexão curricular apoiada por inteligência artificial",
   corpo,
   code:codes.length===1?codes[0]:null,
   botaoTexto:codes.length===1?"Ir para os detalhes da habilidade ("+codes[0]+") →":null
  });
  return;
 }
 const code=card.dataset.code||card.dataset.graphCode||card.querySelector("[data-code]")?.dataset.code;
 if(code){
  habilidadeModalAbrir(code,{
   relType:card.dataset.relType,
   relBasis:card.dataset.relBasis,
   relConf:card.dataset.relConf
  });
 }
}
function recolherSecoesDetalhe(page){
 ["detalhe-organizacao","detalhe-competencias","detalhe-articulacoes","detalhe-relacoes","detalhe-mapa-progressao","detalhe-computacao","detalhe-interdisciplinar","detalhe-cieb","detalhe-reuna"].forEach(id=>{
  const sec=page.querySelector("section#"+id);if(!sec)return;
  const organizacao=id==="detalhe-organizacao";
  let cabeca=sec.querySelector(":scope > .section-heading")||(organizacao?sec.querySelector(":scope > .detail-header-info-title"):null);
  if(!cabeca){
   cabeca=document.createElement("div");cabeca.className="section-heading";
   cabeca.innerHTML='<span class="section-number">↗</span><div><h2>Habilidades da BNCC</h2><p class="section-caption">Habilidades da BNCC relacionadas a esta aprendizagem de Computação.</p></div>';
   sec.prepend(cabeca);
  }
  const corpoId=id+"-conteudo",rotulo=organizacao?cabeca.querySelector(":scope > span"):cabeca.querySelector("h2");
  const texto=rotulo.textContent,botao=document.createElement("button");
  botao.type="button";botao.className="section-toggle";botao.dataset.sectionToggle="";botao.setAttribute("aria-expanded","false");botao.setAttribute("aria-controls",corpoId);
  botao.innerHTML='<span></span><span class="section-chevron" aria-hidden="true"></span>';botao.firstElementChild.textContent=texto;
  rotulo.textContent="";rotulo.append(botao);
  let legenda=null;
  if(organizacao){legenda=document.createElement("p");legenda.className="section-caption";legenda.textContent="Etapa, componente, competências e contextos desta aprendizagem na fonte oficial.";cabeca.after(legenda);}
  const corpo=document.createElement("div");corpo.className="detail-collapse-body";corpo.id=corpoId;
  [...sec.childNodes].forEach(n=>{if(n!==cabeca&&n!==legenda)corpo.append(n);});
  sec.append(corpo);
  cabeca.classList.add("detail-collapsible-head");
  sec.classList.add("detail-collapsible","is-collapsed");
 });
}
function detailAbrirSecao(sec,abrir=true){
 if(!sec)return;
 sec.classList.toggle("is-open",abrir);sec.classList.toggle("is-collapsed",!abrir);
 sec.querySelector("[data-section-toggle]")?.setAttribute("aria-expanded",String(abrir));
 if(!abrir)return;
 sec.querySelectorAll(".row-track").forEach(syncDetailRailArrows);
 if(detailMontarGrafo&&sec.querySelector("#skillGraph")){const montar=detailMontarGrafo;detailMontarGrafo=null;montar();}
 else if(sec.querySelector("#skillGraph"))SkillGraph.resize();
}
function detailAlternarSecao(sec){detailAbrirSecao(sec,sec.classList.contains("is-collapsed"));}
function detailMostrarFragmento(alvo){
 if(!alvo)return;
 detailRevelar(alvo);
 if(alvo.id==="detalhe-mapa-progressao")alvo.querySelector('[data-graph-view="progression"]')?.click();
}
function detailRevelar(el){
 let sec=el?.closest?.(".detail-collapsible.is-collapsed");
 while(sec){detailAbrirSecao(sec,true);sec=sec.parentElement?.closest(".detail-collapsible.is-collapsed")||null;}
}
function initializeDetailRails(scope){
 if(!scope)return;
 scope.querySelectorAll(".row-track").forEach(track=>{
  syncDetailRailArrows(track);
  track.addEventListener("scroll",()=>syncDetailRailArrows(track),{passive:true});
 });
}
function syncDetailRailArrows(track){
 const rail=track.closest(".row-rail");if(!rail)return;
 const prev=rail.querySelector(".rail-prev"),next=rail.querySelector(".rail-next");
 if(!prev||!next)return;
 const scrollable=track.scrollWidth>track.clientWidth+2;
 if(!scrollable){prev.hidden=true;next.hidden=true;return;}
 prev.hidden=track.scrollLeft<=4;
 next.hidden=track.scrollLeft+track.clientWidth>=track.scrollWidth-4;
}
function getCompetenciasForSkill(x){
 const list=[],seen=new Set();
 const isComp=x.kind==="competencia";
 if(isComp){
  const allComps=S.all.filter(c=>c.kind==="competencia"&&c.code!==x.code);
  const sameGroup=allComps.filter(c=>(x.compType==="geral"&&c.compType==="geral")||c.discipline===x.discipline||(c.area&&c.area===x.area&&c.area!=="Educação Básica")||(x.compType==="computacao"&&c.compType==="computacao"));
  const picks=sameGroup.length?sameGroup:allComps.slice(0,10);
  picks.forEach(c=>{
   list.push({id:c.code,rotulo:c.code,tipo:c.group||"Competência",area:c.area||c.discipline,texto:c.text});
  });
  return list;
 }
 const add=(id,rotulo,tipo,area,texto)=>{
  if(!texto&&!rotulo)return;
  const key=(rotulo||id)+"|"+(texto||"");
  if(seen.has(key))return;
  seen.add(key);
  list.push({id:id||rotulo,rotulo:rotulo||id,tipo:tipo||"Competência",area:area||"",texto:texto||""});
 };
 const ids=[...(x.raw?.competencias_especificas||[]),...(x.raw?.competencia?[x.raw.competencia]:[]),...(x.competencyIds||[])];
 ids.forEach(id=>{
  const bc=S.data.bnccCompetencies?.get(id);
  if(bc){
   const num=bc.numero?'Competência Específica '+bc.numero:'Competência Específica';
   const areaNome=reunaAreaNome(bc.area)||bc.area||x.discipline||x.area;
   add(id,num,"Competência específica",areaNome,bc.texto);
   return;
  }
  const cc=S.data.compCompetencies?.get(id);
  if(cc){
   const num=cc.numero?'Competência '+cc.numero:'Competência';
   add(id,num,"Competência de Computação","Computação",cc.texto||name(id,S.data.compCompetencies));
   return;
  }
 });
 (x.raw?.generalCompetencies||[]).forEach(gc=>{
  const code=gc.codigo||"";
  const m=code.match(/(\d+)/);
  const num=m?Number(m[1]):null;
  const texto=num?reunaCgTexto(num):"";
  add(code,"Competência Geral "+(num||code),"Competência Geral BNCC","Educação Básica",texto||gc.descricao||"");
 });
 const r=S.data.reuna?.[x.code];
 if(r?.mapaDeFoco?.ocorrencias){
  r.mapaDeFoco.ocorrencias.forEach(o=>{
   const comp=o.competencias||{};
   ['CG','CA','CE'].forEach(k=>{
    (comp[k]||[]).forEach(n=>{
     const ref=reunaCompRef(k,n,r.mapaDeFoco.area,x.code);
     if(ref&&(ref.texto||ref.nome)){
      add(ref.key,ref.sigla+" "+ref.numero,ref.nome,r.mapaDeFoco.area,ref.texto);
     }
    });
   });
  });
 }
 if(r?.bnccComentada?.competenciasEspecificasBNCC){
  r.bnccComentada.competenciasEspecificasBNCC.forEach(id=>{
   const bc=S.data.bnccCompetencies?.get(id);
   if(bc){
    const num=bc.numero?'Competência Específica '+bc.numero:'Competência Específica';
    add(id,num,"Competência específica",reunaAreaNome(bc.area),bc.texto);
   }
  });
 }
 if(!list.length&&x.kind==="computacao"&&S.data.compCompetencies){
  S.data.compCompetencies.forEach((cc,id)=>{
   const num=cc.numero?'Competência '+cc.numero:'Competência';
   add(id,num,"Competência de Computação","Computação",cc.texto||name(id,S.data.compCompetencies));
  });
 }
 if(!list.length&&S.data.structure?.competencias_especificas){
  const compId=x.raw?.componente;
  const comps=(S.data.structure.competencias_especificas||[]).filter(c=>(compId&&c.componente===compId)||c.area===x.discipline||c.area===x.area);
  comps.forEach(c=>{
   const num=c.numero?'Competência Específica '+c.numero:'Competência Específica';
   add(c.id,num,"Competência específica",reunaAreaNome(c.area),c.texto);
  });
 }
 if(!list.length&&S.data.structure?.competencias_gerais){
  (S.data.structure.competencias_gerais||[]).forEach(cg=>{
   add("cg-"+cg.numero,"Competência Geral "+cg.numero,"Competência Geral BNCC","Educação Básica",cg.texto);
  });
 }
 return list;
}
function resolveCompDetails(c){
 let target=(c.id&&S.by.get(c.id))||(c.rotulo&&S.by.get(c.rotulo));
 if(!target&&c.id){target=S.all.find(it=>it.kind==="competencia"&&(it._id===c.id||it.code===c.id));}
 if(!target){const m=(c.id||c.rotulo||"").match(/CG\s*0?(\d+)/i);if(m){target=S.by.get("CG"+String(m[1]).padStart(2,"0"));}}
 if(target){
  const comp=componentLabel(target)||c.area||"Competência";
  return {code:target.code,group:target.group||c.tipo||"BNCC",component:comp,text:target.text||c.texto,color:color(comp)};
 }
 let shortCode=c.rotulo||c.id||"COMP";
 const mEsp=shortCode.match(/Competência\s+Específica\s*(\d+)/i);if(mEsp)shortCode="CE"+String(mEsp[1]).padStart(2,"0");
 const mGer=shortCode.match(/Competência\s+Geral\s*(\d+)/i);if(mGer)shortCode="CG"+String(mGer[1]).padStart(2,"0");
 const mComp=shortCode.match(/Competência\s*(\d+)/i);if(mComp)shortCode="CO"+String(mComp[1]).padStart(2,"0");
 const comp=c.area||"Competência";
 return {code:shortCode,group:c.tipo||"BNCC",component:comp,text:c.texto||"Competência articulada na organização curricular.",color:color(comp)};
}
function competenciasHtml(x){
 const list=getCompetenciasForSkill(x);
 if(!list.length)return "";
 const chipsHtml=detailChipsHtml(list,c=>{
  const d=resolveCompDetails(c);
  return d.component;
 });
 return '<section class="detail-section detail-faixa-group" id="detalhe-competencias" style="--row-accent:#a49aff">'
  +'<div class="section-heading"><span class="section-number">✦</span><div><h2>Competências relacionadas</h2><p class="section-caption">Competências gerais, específicas e de área articuladas a esta aprendizagem.</p></div></div>'
  +'<div class="faixa-head"><h3 class="related-heading">Competências articuladas <span>'+list.length+'</span></h3>'+chipsHtml+'</div>'
  +'<div class="row-rail detail-row-rail">'
  +'<button type="button" class="rail-arrow rail-prev" data-direction="-1" aria-label="Competências anteriores"'+(list.length<=1?' hidden':'')+'>‹</button>'
  +'<div class="row-track" role="region" aria-label="Competências relacionadas">'
  +list.map(c=>{
   const d=resolveCompDetails(c);
   return '<article class="skill-card detail-rail-card detail-comp-card" role="button" tabindex="0" data-code="'+E(d.code)+'" data-detail-kind="competency" data-component="'+E(d.component)+'" data-rotulo="'+E(c.rotulo||d.code)+'" data-tipo="'+E(d.group)+'" data-area="'+E(d.component)+'" data-texto="'+E(d.text)+'" style="--accent:'+d.color+'">'
    +'<div class="card-top"><span class="skill-code">'+E(d.code)+'</span><span class="skill-group">'+E(d.group)+'</span></div>'
    +'<div class="card-identity"><span class="skill-tag">'+E(d.component)+'</span></div>'
    +'<p class="card-text">'+E(d.text)+'</p>'
    +'<div class="card-foot"><span>1 clique: texto completo · 2 cliques: abrir</span><span aria-hidden="true">↗</span></div>'
    +'</article>';
  }).join("")
  +'</div>'
  +'<button type="button" class="rail-arrow rail-next" data-direction="1" aria-label="Próximas competências"'+(list.length<=1?' hidden':'')+'>›</button>'
  +'</div>'
  +'</section>';
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
let detailTapTimer=null,detailMontarGrafo=null;
function detailNavItems(x,relationLists,competenciasList){
 const isComp=x.kind==="competencia";
 const isCompOrCieb=ehComputacao(x);
 return [
  ["detalhe-organizacao",isComp?"Enquadramento":"Organização"],
  ...(competenciasList?.length?[["detalhe-competencias",isComp?"Competências afins":"Competências"]]:[]),
  ...(!isComp&&!isCompOrCieb?[["detalhe-relacoes","Relações de progressão"],["detalhe-mapa-progressao","Mapa de progressão"]]:(isComp&&relationLists?.curriculo?.length?[["detalhe-articulacoes","Habilidades articuladas"]]:[])),
  ...(relationLists?.curriculo?.length&&isCompOrCieb?[["detalhe-computacao","Habilidades BNCC"]]:(relationLists?.curriculo?.length&&!isComp?[["detalhe-computacao","Computação"]]:[])),
  ...(S.data.ai[x.code]?.por_componente?[["detalhe-interdisciplinar","Interdisciplinar"]]:[]),
  ...(relationLists?.cieb?.length?[["detalhe-cieb","CIEB"]]:(x.kind==="cieb"?[["detalhe-cieb","CIEB"]]:[])),
  ...(S.data.reuna?.[x.code]?[["detalhe-reuna","Reúna"]]:[])
 ];
}
function detail(code){
 const x=S.by.get(code);if(!x){home();return;}S.currentSkill=x;closeMobileFilters();SkillGraph.detach();$("#catalogPage").hidden=true;const page=$("#detailPage");page.hidden=false;delete page.dataset.pendingGraphJump;detailMontarGrafo=null;
 const relationLists=detailRelations(x);
 const competenciasList=getCompetenciasForSkill(x);
 const isComp=x.kind==="competencia";
 const isCompOrCieb=ehComputacao(x);
 const nav=detailNavItems(x,relationLists,competenciasList);
 const kicker=isComp?"COMPETÊNCIA EM DETALHE":(x.kind==="cieb"?"REFERÊNCIA CIEB EM DETALHE":"HABILIDADE EM DETALHE");
 const docLabel=x.doc||(isComp?"BNCC":(x.kind==="cieb"?"CIEB":x.kind==="computacao"?"BNCC Computação":"BNCC"));
 const printBtnSvg='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
 const actionsHtml='<div class="detail-header-actions">'
  +'<button type="button" class="detail-copy-button" data-copy-official>Copiar texto oficial</button>'
  +'<button type="button" class="detail-copy-button" id="printOpen" aria-haspopup="dialog">'+printBtnSvg+'Imprimir / Salvar em PDF</button>'
  +(!isCompOrCieb&&!isComp?'<a class="detail-header-map" href="#skillGraph">Explorar progressão <span aria-hidden="true">↓</span></a>':'')
  +'</div>';
 page.classList.remove("has-compact-summary");page.innerHTML=printHeadHtml(x)+'<section class="detail-hero" style="--detail-accent:'+color(x.discipline||x.area)+'"><div class="detail-hero-inner"><div class="detail-top-nav-actions"><button class="back-button" id="backButton">← &nbsp; Voltar ao catálogo</button><button type="button" class="back-button proposal-graph-button" id="openProposalGraph"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Proposta Detalhes 2 ↗</button></div><div class="detail-header-grid"><div class="detail-header-main"><div class="detail-topline"><span class="detail-kicker">'+E(kicker)+'</span><span>'+E(docLabel)+'</span></div><div class="detail-title"><h1>'+E(x.code)+'</h1><p class="skill-long-text">'+E(x.text)+'</p></div>'+actionsHtml+'</div></div></div></section><nav class="detail-nav" aria-label="Nesta habilidade"><span>Nesta habilidade</span>'+nav.map(([id,label])=>'<a href="#'+id+'">'+E(label)+'</a>').join("")+'</nav><div class="detail-content">'+detailHeaderHtml(x)+competenciasHtml(x)+mapWorkspaceHtml(x,relationLists.curriculo)+aiHtml(x)+ciebHtml(x,relationLists.cieb)+reunaHtml(x)+'</div>';
 page.querySelector('[data-copy-official]')?.addEventListener('click',async e=>{const button=e.currentTarget;try{const textToCopy=page.querySelector('.skill-long-text')?.textContent||x.text||"";await navigator.clipboard.writeText(textToCopy);button.textContent='Texto copiado';setTimeout(()=>button.textContent='Copiar texto oficial',1800);}catch{button.textContent='Não foi possível copiar';}});
 recolherSecoesDetalhe(page);const detailHero=page.querySelector(".detail-hero"),detailNav=page.querySelector(".detail-nav"),stickySummary=document.createElement("div"),navShell=document.createElement("div");stickySummary.className="detail-sticky-summary";stickySummary.style.setProperty('--detail-accent',color(x.discipline||x.area));stickySummary.hidden=true;stickySummary.setAttribute("aria-hidden","true");stickySummary.setAttribute("aria-label","Habilidade em foco");stickySummary.innerHTML="<strong></strong><p></p>";stickySummary.querySelector("strong").textContent=x.code;stickySummary.querySelector("p").textContent=x.text;navShell.className="detail-sticky-shell";detailHero.after(stickySummary);detailNav.before(navShell);navShell.append(detailNav);requestAnimationFrame(()=>{syncDetailStickySummary();syncDetailNavScrollspy();});
 $("#backButton").addEventListener("click",()=>home());
 $("#openProposalGraph")?.addEventListener("click",()=>openProposalGraph(x.code));
 initializeDetailRails(page);

 page.onclick=e=>{
  if(e.target.closest("#habilidadeDialog"))return;
  const secaoBotao=e.target.closest("[data-section-toggle]");
  if(secaoBotao){e.preventDefault();detailAlternarSecao(secaoBotao.closest(".detail-collapsible"));return;}
  const secaoCabeca=!e.target.closest("a,button,input,select,summary")&&e.target.closest(".detail-collapsible.is-collapsed > .detail-collapsible-head, .detail-collapsible.is-collapsed > .section-caption");
  if(secaoCabeca){detailAbrirSecao(secaoCabeca.closest(".detail-collapsible"),true);return;}
  const linkInterno=e.target.closest('a[href^="#"]');
  if(linkInterno)detailMostrarFragmento(document.getElementById(linkInterno.getAttribute("href").slice(1)));
  const chip=e.target.closest("[data-detail-chip]");
  if(chip){
   e.preventDefault();
   const wrap=chip.closest(".detail-faixa-group, .detail-section, .progress-block");
   if(!wrap)return;
   const chips=wrap.querySelectorAll("[data-detail-chip]");
   chips.forEach(c=>{
    c.classList.remove("active");
    c.setAttribute("aria-pressed","false");
   });
   chip.classList.add("active");
   chip.setAttribute("aria-pressed","true");
   const selected=chip.dataset.detailChip;
   const cards=wrap.querySelectorAll(".detail-rail-card, .progress-relation-card, .ai-card, .skill-card");
   cards.forEach(card=>{
    const cardComp=card.dataset.component||card.dataset.aiComponent||"";
    const match=!selected||cardComp===selected;
    card.hidden=!match;
   });
   const track=wrap.querySelector(".row-track");
   if(track){
    track.scrollLeft=0;
    syncDetailRailArrows(track);
   }
   return;
  }
  const arrow=e.target.closest(".rail-arrow");
  if(arrow){
   const track=arrow.closest(".row-rail")?.querySelector(".row-track");
   if(track){
    const dir=Number(arrow.dataset.direction)||1;
    const distance=Math.max(280,track.clientWidth*.7);
    track.scrollBy({left:dir*distance,behavior:"smooth"});
    setTimeout(()=>syncDetailRailArrows(track),320);
   }
   return;
  }
  const jump=e.target.closest(".graph-jump,a[href=\"#skillGraph\"]");
  if(jump){
   e.preventDefault();
   if(!page.querySelector("#skillGraph")){page.dataset.pendingGraphJump="true";return;}
   detailRevelar(page.querySelector("#skillGraph"));
   const progressTab=page.querySelector('[data-graph-view="progression"]');
   if(progressTab&&!progressTab.classList.contains("active"))progressTab.click();
   requestAnimationFrame(()=>page.querySelector("#skillGraph")?.scrollIntoView({behavior:"smooth",block:"start"}));
   return;
  }
  if(e.target.closest("#backButton")){home();return;}
  const navFonte=e.target.closest('a[href="#detalhe-fonte"]');
  if(navFonte){
   const fonteEl=document.getElementById("detalhe-fonte");
   if(fonteEl)fonteEl.open=true;
  }
  const navLink=e.target.closest(".detail-nav a");
  if(navLink){
   const allLinks=[...page.querySelectorAll(".detail-nav a")];
   setActiveDetailNavLink(allLinks,navLink);
  }
  if(e.target.closest("[data-copy-official],#printOpen,[data-action-print],.detail-nav a"))return;
  if(e.target.closest(".reuna-code-btn,.mf-code"))return;

  const card=e.target.closest(".detail-rail-card,.progress-relation-card,.ai-card,[data-graph-code],[data-code]");
  if(card&&page.contains(card)){
   e.preventDefault();
   if(e.detail>=2)return;
   clearTimeout(detailTapTimer);
   detailTapTimer=setTimeout(()=>{
    detailTapTimer=null;
    openCardDetailModal(card);
   },240);
   return;
  }
 };

 page.ondblclick=e=>{
  if(e.target.closest("#habilidadeDialog"))return;
  if(e.target.closest(".reuna-code-btn,.mf-code"))return;
  const card=e.target.closest(".detail-rail-card,.progress-relation-card,.ai-card,[data-graph-code],[data-code]");
  if(card&&page.contains(card)){
   e.preventDefault();
   clearTimeout(detailTapTimer);
   detailTapTimer=null;
   habilidadeModalFechar();
   const code=card.dataset.code||card.dataset.graphCode||card.querySelector("[data-code]")?.dataset.code;
   if(code&&S.by.has(code)){
    open(code);
   }else{
    openCardDetailModal(card);
   }
  }
 };

 if(!isCompOrCieb&&!isComp)BnccData.load().then(state=>{const relacoesEl=document.getElementById("detalhe-relacoes-conteudo"),section=document.getElementById("detalhe-mapa-conteudo");if(page.hidden||!section||!relacoesEl||new URLSearchParams(location.search).get("codigo")!==code)return;const node=state.nodes.get(code);if(!node){const aviso='<p class="empty-message">Esta habilidade não está presente no grafo fornecido.</p>';relacoesEl.innerHTML=aviso;section.innerHTML=aviso;return;}page.querySelector('.skill-long-text').textContent=node.texto;const compactDescription=page.querySelector('.detail-sticky-summary p');if(compactDescription)compactDescription.textContent=node.texto;relacoesEl.innerHTML=SkillPanel.relacoesHtml(state,node);section.innerHTML=SkillPanel.mapaHtml();initializeDetailRails(relacoesEl);const montarGrafo=()=>{SkillGraph.mount(section.querySelector('#skillGraph'),state,code,open,()=>{});mapaFocalMonta(x);};if(section.closest(".detail-collapsible.is-collapsed"))detailMontarGrafo=montarGrafo;else montarGrafo();if(page.dataset.pendingGraphJump){delete page.dataset.pendingGraphJump;detailRevelar(section);page.querySelector('[data-graph-view="progression"]')?.click();requestAnimationFrame(()=>page.querySelector('#skillGraph')?.scrollIntoView({behavior:'smooth',block:'start'}));}page.querySelector('[data-copy-official]')?.addEventListener('click',async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText(node.texto);button.textContent='Texto copiado';setTimeout(()=>button.textContent='Copiar texto oficial',1800);}catch{button.textContent='Não foi possível copiar';}});}).catch(error=>{const aviso='<p class="empty-message">Não foi possível abrir o grafo local: '+E(error.message)+'</p>',relacoesEl=document.getElementById("detalhe-relacoes-conteudo"),section=document.getElementById("detalhe-mapa-conteudo");if(section&&!page.hidden&&new URLSearchParams(location.search).get("codigo")===code){section.innerHTML=aviso;if(relacoesEl)relacoesEl.innerHTML=aviso;}});
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
 {id:"detalhe-competencias",titulo:"Competências relacionadas"},
 {id:"detalhe-articulacoes",titulo:"Habilidades articuladas"},
 {id:"detalhe-relacoes",titulo:"Relações de progressão"},{id:"detalhe-mapa-progressao",titulo:"Mapa de progressão"},{id:"mapa-focal",titulo:"Mapa Focal"},
 {id:"detalhe-computacao",titulo:"Computação"},
 {id:"detalhe-interdisciplinar",titulo:"Sugestões interdisciplinares"},
 {id:"detalhe-cieb",titulo:"Computação e currículo CIEB"},
 {id:"detalhe-reuna",titulo:"Referência Reúna",subs:[{id:"reuna-legenda",titulo:"Como ler"},{id:"reuna-mapa",titulo:"Mapa de Foco"},{id:"reuna-comentada",titulo:"BNCC Comentada"},{id:"reuna-conexoes",titulo:"Conexões entre etapas"}]}
];
const PRINT_KEY="conecta-bncc-impressao";
let printEstado=null,printTimer=null,printRevelados=[],printColapsadas=[],printZoomSlot=null,printRestaurarAba=null;
function printPreferencias(){try{return JSON.parse(localStorage.getItem(PRINT_KEY)||"{}")||{};}catch(e){return {};}}
function printSalvarPreferencias(p){try{localStorage.setItem(PRINT_KEY,JSON.stringify(p));}catch(e){}}
function printBarHtml(){return '';}
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
 printRevelados.forEach(el=>{el.hidden=true;});printRevelados=[];printColapsadas.forEach(s=>detailAbrirSecao(s,false));printColapsadas=[];if(printRestaurarAba){const f=printRestaurarAba;printRestaurarAba=null;f();}if(printZoomSlot){printZoomSlot.style.zoom="";printZoomSlot=null;}
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
 incluidas.forEach(el=>{let s=el.closest?.(".detail-collapsible.is-collapsed");while(s){printColapsadas.push(s);detailAbrirSecao(s,true);s=s.parentElement?.closest(".detail-collapsible.is-collapsed")||null;}});
 pares.forEach(([el,marcado])=>{
  if(marcado)return;
  const dentro=incluidas.filter(t=>el.contains(t));
  if(dentro.length)printManter(el,dentro);else el.classList.add("print-hidden");
 });
  const cartaoPrint=document.querySelector("#detalhe-mapa-progressao .graph-card"),abaPrint=cartaoPrint?cartaoPrint.querySelector("[data-graph-view].active"):null;
 if(incluidas.indexOf(document.getElementById("detalhe-mapa-progressao"))>=0&&abaPrint&&abaPrint.dataset.graphView!=="progression"){const abaProg=cartaoPrint.querySelector('[data-graph-view="progression"]');if(abaProg){const voltar=abaPrint;abaProg.click();printRestaurarAba=()=>voltar.click();}}
 const grafoEl=document.getElementById("detalhe-mapa-progressao"),focalEl=document.getElementById("mapa-focal");
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
 const grafo=document.getElementById("detalhe-mapa-progressao");
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
 $("#detailPage").addEventListener("click",e=>{if(e.target.closest("#printOpen,[data-action-print]"))printAbrirDialogo();});
 setupMobileFilters();let searchTimer;
 let detailScrollRaf=null;
 const handleDetailScroll=()=>{
  if(detailScrollRaf)return;
  detailScrollRaf=requestAnimationFrame(()=>{
   detailScrollRaf=null;
   syncDetailStickySummary();
   syncDetailNavScrollspy();
   syncCatalogNavScrollspy();
  });
 };
 window.addEventListener("scroll",handleDetailScroll,{passive:true});window.addEventListener("resize",handleDetailScroll,{passive:true});
  const jumpToRow=row=>{if(!row)return;if(row.classList.contains("is-collapsed"))setRowOpen(row,true);const bar=$(".topbar"),stageBar=$(".stage-sticky-shell, #stageBar");const barHeight=bar?bar.getBoundingClientRect().height:68;const stageHeight=stageBar?stageBar.getBoundingClientRect().height:48;const offset=barHeight+stageHeight+18;window.scrollTo({top:Math.max(0,window.scrollY+row.getBoundingClientRect().top-offset),behavior:"smooth"});};
 $("#searchInput").addEventListener("input",e=>{const wasDetail=!$("#detailPage").hidden;S.q=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});},SEARCH_DELAY);});
  $("#stageSelect").addEventListener("change",e=>{const wasDetail=!$("#detailPage").hidden;S.stageFilter=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});});
 $("#areaSelect").addEventListener("change",e=>{const wasDetail=!$("#detailPage").hidden;S.filter=e.target.value;if(wasDetail)home(false);clearTimeout(searchTimer);render();if(wasDetail)$(".catalog")?.scrollIntoView({behavior:"smooth"});});
  $("#clearFilters").addEventListener("click",()=>{clearTimeout(searchTimer);$("#searchInput").value="";$("#stageSelect").value="";$("#areaSelect").value="";S.q=S.filter=S.stageFilter="";S.rowFilters.clear();S.yearFilters.clear();S.rowQueries?.clear();S.rowSearchOpen?.clear();render();});
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
    const searchToggle=e.target.closest("[data-row-search-toggle]");
    if(searchToggle){
      const id=searchToggle.dataset.rowSearchToggle,sec=searchToggle.closest(".catalog-row");
      const wrap=searchToggle.closest(".row-search-wrap"),field=wrap?.querySelector(".row-search-field"),input=field?.querySelector(".row-search-input");
      if(!field||!input)return;
      if(sec&&sec.classList.contains("is-collapsed"))setRowOpen(sec,true);
      const isHidden=field.hidden;
      if(isHidden){
        field.hidden=false;
        wrap.classList.add("is-expanded");
        searchToggle.classList.add("is-active");
        S.rowSearchOpen.add(id);
        input.focus();
      }else{
        if(!input.value.trim()){
          field.hidden=true;
          wrap.classList.remove("is-expanded");
          searchToggle.classList.remove("is-active");
          S.rowSearchOpen.delete(id);
        }else{
          input.focus();
        }
      }
      return;
    }
    const searchClear=e.target.closest("[data-row-search-clear]");
    if(searchClear){
      const id=searchClear.dataset.rowSearchClear,sec=searchClear.closest(".catalog-row");
      const wrap=searchClear.closest(".row-search-wrap"),input=wrap?.querySelector(".row-search-input"),row=ROWS.find(x=>x.id===id);
      if(!input||!row||!sec)return;
      input.value="";
      searchClear.classList.add("is-hidden");
      S.rowQueries.delete(id);
      updateRowSearchResults(sec,row);
      input.focus();
      return;
    }
   const toggle=e.target.closest("[data-row-toggle]");if(toggle){const sec=toggle.closest(".catalog-row");setRowOpen(sec,sec.classList.contains("is-collapsed"));return;}
   const collapsedRow=e.target.closest(".catalog-row.is-collapsed");if(collapsedRow&&!e.target.closest("button,a,input,select")){setRowOpen(collapsedRow,true);return;}
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
   const arrow=e.target.closest(".rail-arrow");if(arrow){const track=arrow.closest(".row-rail").querySelector(".row-track");moveRail(track,Number(arrow.dataset.direction));return;}const c=e.target.closest(".skill-card");if(c){open(c.dataset.code);}
 });
 $("#catalogRows").addEventListener("input",e=>{
    const input=e.target.closest("[data-row-search-input]");if(!input)return;
    const id=input.dataset.rowSearchInput,row=ROWS.find(x=>x.id===id),sec=input.closest(".catalog-row");if(!row||!sec)return;
    const val=input.value,clearBtn=input.closest(".row-search-wrap")?.querySelector(".row-search-clear");
    if(clearBtn)clearBtn.classList.toggle("is-hidden",!val);
    if(val.trim())S.rowQueries.set(id,val);else S.rowQueries.delete(id);
    updateRowSearchResults(sec,row);
  });
  const interruptRailMotion=e=>{const track=e.target.closest(".row-track");if(track)cancelRailAnimation(track);};
 $("#catalogRows").addEventListener("pointerdown",interruptRailMotion,{passive:true});$("#catalogRows").addEventListener("touchstart",interruptRailMotion,{passive:true});$("#catalogRows").addEventListener("wheel",interruptRailMotion,{passive:true});
 $("#catalogRows").addEventListener("scroll",e=>{const list=e.target.closest(".row-component-list");if(list)syncComponentArrows(list.closest(".catalog-row"));const track=e.target.closest(".row-track");if(track)scheduleRail(track);},true);
 $("#catalogRows").addEventListener("focusin",e=>{const c=e.target.closest(".skill-card"),track=c?.closest(".row-track");if(track){syncRailA11y(track);scheduleRail(track);}});
 window.addEventListener("resize",()=>requestAnimationFrame(()=>{initializeRails($("#catalogRows"));syncComponentArrows($("#catalogRows"));}));
 $("#catalogRows").addEventListener("keydown",e=>{
    const input=e.target.closest("[data-row-search-input]");
    if(input){
      if(e.key==="Escape"){
        e.preventDefault();
        const id=input.dataset.rowSearchInput,wrap=input.closest(".row-search-wrap"),toggle=wrap?.querySelector(".row-search-toggle");
        const sec=input.closest(".catalog-row"),row=ROWS.find(x=>x.id===id);
        if(input.value.trim()){
          input.value="";
          wrap.querySelector(".row-search-clear")?.classList.add("is-hidden");
          S.rowQueries.delete(id);
          if(sec&&row)updateRowSearchResults(sec,row);
        }
        const field=wrap?.querySelector(".row-search-field");if(field)field.hidden=true;
        wrap?.classList.remove("is-expanded");toggle?.classList.remove("is-active");
        S.rowSearchOpen.delete(id);
        toggle?.focus();
        return;
      }
      if(e.key==="Enter"){e.preventDefault();return;}
      return;
    }
    const c=e.target.closest(".skill-card");if(!c)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();open(c.dataset.code);}else if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();moveRailFocus(c.closest(".row-track"),c,e.key==="ArrowLeft"?-1:1);}});
 $("#stageShortcuts").addEventListener("click",e=>{const b=e.target.closest("[data-scroll]");if(!b)return;if(!$("#detailPage").hidden)home(false);let row=$("#row-"+b.dataset.scroll);if(!row){clearTimeout(searchTimer);$("#searchInput").value="";$("#stageSelect").value="";$("#areaSelect").value="";S.q=S.filter=S.stageFilter="";S.rowFilters.clear();S.yearFilters.clear();render();row=$("#row-"+b.dataset.scroll);}jumpToRow(row);});
 document.querySelectorAll("[data-home]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();if(!$("#detailPage").hidden)home();else window.scrollTo({top:0,behavior:"smooth"});}));
  document.querySelectorAll("[data-jump]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();if(!$("#detailPage").hidden)home(false);let row=$("#row-"+a.dataset.jump);if(!row){clearTimeout(searchTimer);$("#searchInput").value="";$("#stageSelect").value="";$("#areaSelect").value="";S.q=S.filter=S.stageFilter="";S.rowFilters.clear();S.yearFilters.clear();render();row=$("#row-"+a.dataset.jump);}jumpToRow(row);}));
 $("#aboutButton").addEventListener("click",()=>$("#aboutDialog").showModal());$("#themeButton").addEventListener("click",()=>{const t=document.body.dataset.theme==="light"?"dark":"light";document.body.dataset.theme=t;localStorage.setItem("conecta-bncc-theme",t);$("#themeButton").textContent=t==="light"?"☾":"☼";$("#themeButton").title=t==="light"?"Ativar tema escuro":"Ativar tema claro";});document.querySelectorAll("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>$("#aboutDialog").close()));
 $("#aboutMeta").innerHTML="1.721 aprendizagens BNCC + "+S.data.cieb.length+" referências CIEB · "+VERSION+"<br>BNCC-dados CC BY 4.0 · pipeline MIT<br>Todos os arquivos são locais; a aplicação não consulta a rede.";
 $("#footerVersion").textContent=VERSION;$("#themeButton").textContent=document.body.dataset.theme==="light"?"☾":"☼";window.addEventListener("popstate",()=>{const c=new URLSearchParams(location.search).get("codigo");if(c){if($("#detailPage").hidden||S.currentSkill?.code!==c)detail(c);if(location.hash)requestAnimationFrame(()=>{const alvo=document.getElementById(decodeURIComponent(location.hash.slice(1)));detailMostrarFragmento(alvo);alvo?.scrollIntoView();});else window.scrollTo({top:0,behavior:"instant"});}else{$("#detailPage").hidden=true;$("#catalogPage").hidden=false;requestAnimationFrame(()=>initializeRails($("#catalogRows")));window.scrollTo({top:S.catalogScroll||0,behavior:"instant"});}});
}

function getSkillConnectionsData(x){
 const result={central:x,allNodes:new Map(),groups:{anteriores:[],posteriores:[],competencias:[],interdisciplinar:[],cieb:[],reuna:[],curriculo:[]}};
 if(!x)return result;
 try{
  for(const c of getCompetenciasForSkill(x)){
   const code=c.code||c.id;
   if(code&&!result.allNodes.has(code)){
    const node={code,item:c,kind:'competencia',category:'competencias',label:c.nome||c.titulo||c.texto?.slice(0,38)||code,text:c.texto||''};
    result.allNodes.set(code,node);
    result.groups.competencias.push(node);
   }
  }
  const dRels=detailRelations(x);
  for(const r of dRels.curriculo||[]){
   const code=r.item?.code;
   if(code&&code!==x.code&&!result.allNodes.has(code)){
    const isBefore=(r.item.years?.[0]||0)<(x.years?.[0]||0);
    const isAfter=(r.item.years?.[0]||0)>(x.years?.[0]||0);
    const cat=isBefore?'anteriores':(isAfter?'posteriores':'curriculo');
    const node={code,item:r.item,kind:r.item.kind||'bncc',category:cat,rel:r.rel,text:r.item.text||''};
    result.allNodes.set(code,node);
    result.groups[cat].push(node);
   }
  }
  for(const r of dRels.cieb||[]){
   const code=r.item?.code;
   if(code&&code!==x.code&&!result.allNodes.has(code)){
    const node={code,item:r.item,kind:'cieb',category:'cieb',rel:r.rel,text:r.item.text||''};
    result.allNodes.set(code,node);
    result.groups.cieb.push(node);
   }
  }
  const ai=S.data.ai?.[x.code];
  if(ai?.por_componente){
   for(const k in ai.por_componente){
    for(const code of ai.por_componente[k]?.codigos||[]){
     if(code&&code!==x.code&&!result.allNodes.has(code)){
      const item=S.by.get(code);
      const node={code,item,kind:item?.kind||'bncc',category:'interdisciplinar',component:k,text:item?.text||'Sugestão interdisciplinar em '+k};
      result.allNodes.set(code,node);
      result.groups.interdisciplinar.push(node);
     }
    }
   }
  }
  const reuna=S.data.reuna?.[x.code];
  if(reuna?.mapaDeFoco?.ocorrencias){
   for(const oc of reuna.mapaDeFoco.ocorrencias){
    for(const code of oc.conhecimentoPrevio||[]){
     if(code&&code!==x.code&&!result.allNodes.has(code)){
      const item=S.by.get(code);
      const node={code,item,kind:item?.kind||'bncc',category:'anteriores',reason:'Pré-requisito Reúna',text:item?.text||''};
      result.allNodes.set(code,node);
      result.groups.anteriores.push(node);
     }
    }
    const rel=oc.habilidadesRelacionadas||{};
    for(const code of [...(rel.AF||[]),...(rel.AC||[]),...(rel.EF||[])]){
     if(code&&code!==x.code&&!result.allNodes.has(code)){
      const item=S.by.get(code);
      const node={code,item,kind:item?.kind||'bncc',category:'reuna',text:item?.text||''};
      result.allNodes.set(code,node);
      result.groups.reuna.push(node);
     }
    }
   }
  }
  // Try graph progression incoming / outgoing
  const gState=typeof window!=="undefined"?window.bnccGraphState:null;
  if(gState){
   for(const e of gState.incoming?.get(x.code)||[]){
    const code=e.o;
    if(code&&code!==x.code&&!result.allNodes.has(code)){
     const item=S.by.get(code);
     const node={code,item,kind:item?.kind||'bncc',category:'anteriores',reason:'Percurso (vem antes)',text:item?.text||''};
     result.allNodes.set(code,node);
     result.groups.anteriores.push(node);
    }
   }
   for(const e of gState.outgoing?.get(x.code)||[]){
    const code=e.d;
    if(code&&code!==x.code&&!result.allNodes.has(code)){
     const item=S.by.get(code);
     const node={code,item,kind:item?.kind||'bncc',category:'posteriores',reason:'Percurso (vem depois)',text:item?.text||''};
     result.allNodes.set(code,node);
     result.groups.posteriores.push(node);
    }
   }
  }
 }catch(err){console.warn('Erro ao mapear conexoes:',err);}
 return result;
}

function arrangeGraphPositions(central,allNodes,groups){
 const positions=new Map();
 positions.set(central.code,{x:0,y:0,node:{code:central.code,item:central,isCentral:true,category:'central'}});

 function layoutCluster(items,cx,cy,maxRows,spacingX,spacingY){
  if(!items||!items.length)return;
  const count=items.length;
  const cols=Math.ceil(count/maxRows);
  items.forEach((n,i)=>{
   const col=Math.floor(i/maxRows);
   const rowInCol=i%maxRows;
   const itemsInThisCol=Math.min(maxRows,count-col*maxRows);
   const rowOffset=rowInCol-(itemsInThisCol-1)/2;
   const colOffset=col-(cols-1)/2;
   positions.set(n.code,{
    x:cx+colOffset*spacingX,
    y:cy+rowOffset*spacingY,
    node:n
   });
  });
 }

 // Agrupamento coeso dos nós conforme sua procedência/origem com distâncias seguras
 // - Reúna (Mapa Focal): cluster no quadrante superior esquerdo
 layoutCluster(groups.reuna||[],-420,-260,3,145,82);

 // - CIEB / Computação: cluster no quadrante superior direito
 layoutCluster(groups.cieb||[],420,-260,3,145,82);

 // - Competências BNCC: cluster no topo central
 layoutCluster(groups.competencias||[],0,-370,2,150,82);

 // - Anteriores / Pré-requisitos: cluster à esquerda do percurso
 layoutCluster(groups.anteriores||[],-640,20,4,148,82);

 // - Posteriores / Continuidade: cluster à direita do percurso
 layoutCluster(groups.posteriores||[],640,20,4,148,82);

 // - Interdisciplinar IA: cluster na base central
 layoutCluster(groups.interdisciplinar||[],0,360,2,150,82);

 // - Currículo / Articulações: quadrantes inferiores
 const curr=groups.curriculo||[];
 const currLeft=curr.slice(0,Math.ceil(curr.length/2));
 const currRight=curr.slice(Math.ceil(curr.length/2));
 layoutCluster(currLeft,-360,260,2,145,82);
 layoutCluster(currRight,360,260,2,145,82);

 // Qualquer outro nó avulso não categorizado
 (allNodes||new Map()).forEach((node,code)=>{
  if(!positions.has(code)){
   const angle=positions.size*0.8;
   positions.set(code,{x:Math.cos(angle)*480,y:Math.sin(angle)*300,node});
  }
 });

 // Resolução e prevenção estrita de sobreposição de nós e títulos (Collision Avoidance Relaxation)
 const nodes=[...positions.values()];
 const PADDING_X=26;
 const PADDING_Y=22;
 const NODE_HEIGHT=62;

 for(let iter=0;iter<18;iter++){
  let moved=false;
  for(let i=0;i<nodes.length;i++){
   for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i];
    const b=nodes[j];
    const wA=Math.max(76,(a.node.code?.length||8)*9+22);
    const wB=Math.max(76,(b.node.code?.length||8)*9+22);
    const reqX=(wA+wB)/2+PADDING_X;
    const reqY=NODE_HEIGHT+PADDING_Y;

    const dx=b.x-a.x;
    const dy=b.y-a.y;
    const absX=Math.abs(dx);
    const absY=Math.abs(dy);

    if(absX<reqX&&absY<reqY){
     moved=true;
     const overlapX=reqX-absX;
     const overlapY=reqY-absY;

     if(overlapX<overlapY*1.4){
      const shiftX=(overlapX/2)+1;
      const signX=(dx>=0?1:-1)||1;
      if(!a.node.isCentral)a.x-=shiftX*signX;
      if(!b.node.isCentral)b.x+=shiftX*signX;
     }else{
      const shiftY=(overlapY/2)+1;
      const signY=(dy>=0?1:-1)||1;
      if(!a.node.isCentral)a.y-=shiftY*signY;
      if(!b.node.isCentral)b.y+=shiftY*signY;
     }
    }
   }
  }

  // Raio de segurança ao redor do nó central (r = 190px)
  for(let i=0;i<nodes.length;i++){
   const a=nodes[i];
   if(a.node.isCentral)continue;
   const dist=Math.hypot(a.x,a.y);
   if(dist<190){
    const factor=190/Math.max(dist,1);
    a.x*=factor;
    a.y*=factor;
   }
  }

  if(!moved)break;
 }

 return positions;
}
let proposalGraphState={activeSkill:null,activeCategory:'',zoom:1,panX:0,panY:0};

function openProposalGraph(code){
 const x=S.by.get(code);if(!x)return;
 proposalGraphState.activeSkill=x;
 proposalGraphState.activeCategory='';
 proposalGraphState.zoom=1;
 proposalGraphState.panX=0;
 proposalGraphState.panY=0;

 $("#catalogPage").hidden=true;
 $("#detailPage").hidden=true;
 const page=$("#proposalGraphPage");
 if(!page)return;
 page.hidden=false;

 const conn=getSkillConnectionsData(x);
 const positions=arrangeGraphPositions(x,conn.allNodes,conn.groups);
 const compName=componentLabel(x);
 const compCol=color(compName);
 page.style.setProperty("--skill-accent",compCol);

 const catLabels={
  anteriores:{label:"Vêm antes / Pré-requisitos",color:"#61b8ff"},
  posteriores:{label:"Vêm depois / Continuidade",color:"#ffb86b"},
  competencias:{label:"Competências",color:"#c9a4e0"},
  interdisciplinar:{label:"Interdisciplinar IA",color:"#7de2b8"},
  cieb:{label:"CIEB / Computação",color:"#7dc9e8"},
  reuna:{label:"Reúna (Focal)",color:"#f2a365"},
  curriculo:{label:"BNCC / Articulações",color:"#b5a0ff"}
 };

 const availableCats=Object.keys(conn.groups).filter(k=>conn.groups[k].length>0);
 const filterChips=['<button type="button" class="proposal-chip is-active" data-cat="" style="--filter-accent:'+compCol+'"><span class="proposal-chip-check">✓</span><span>Todas</span><span class="proposal-chip-count">'+conn.allNodes.size+'</span></button>']
  .concat(availableCats.map(k=>{
   const cfg=catLabels[k]||{label:k,color:"#b5a0ff"};
   return '<button type="button" class="proposal-chip" data-cat="'+E(k)+'" style="--filter-accent:'+cfg.color+'"><span class="proposal-chip-check">✓</span><span class="proposal-chip-dot"></span><span>'+E(cfg.label)+'</span><span class="proposal-chip-count">'+conn.groups[k].length+'</span></button>';
  })).join('');

 let wiresHtml='',flowsHtml='',nodesHtml='';

 positions.forEach((pos,nodeCode)=>{
  if(nodeCode===x.code)return;
  const nx=pos.x,ny=pos.y,node=pos.node;
  const mx=nx*0.5,my=ny*0.5-(ny>0?20:-20);
  const d='M 0 0 Q '+mx.toFixed(1)+' '+my.toFixed(1)+' '+nx.toFixed(1)+' '+ny.toFixed(1);
  const nodeItem=node.item||S.by.get(nodeCode);
  const nodeComp=nodeItem?componentLabel(nodeItem):compName;
  const c=color(nodeComp)||(catLabels[node.category]?.color||'#b5a0ff');
  const dur=(5+(Math.abs(nx)%4)*1.4).toFixed(1)+'s';
  wiresHtml+='<path class="graph2-wire" data-wire="'+E(nodeCode)+'" data-cat="'+E(node.category)+'" d="'+d+'" style="--c:'+c+'"></path>';
  flowsHtml+='<path class="graph2-flow" data-flow="'+E(nodeCode)+'" data-cat="'+E(node.category)+'" pathLength="100" d="'+d+'" style="--c:'+c+';--dur:'+dur+'"></path>';

  const badgeW=Math.max(72,nodeCode.length*8.5+20);
  nodesHtml+='<g class="graph2-node" data-code="'+E(nodeCode)+'" data-cat="'+E(node.category)+'" transform="translate('+nx.toFixed(1)+','+ny.toFixed(1)+')" tabindex="0" role="button" aria-label="'+E(nodeCode)+'">'
   +'<title>'+E(nodeCode)+(node.reason?' · '+E(node.reason):'')+'</title>'
   +'<circle class="graph2-halo" r="24" style="--c:'+c+'"></circle>'
   +'<circle class="graph2-core" r="7" style="--c:'+c+'"></circle>'
   +'<rect class="graph2-badge-bg" x="-'+(badgeW/2).toFixed(1)+'" y="10" width="'+badgeW+'" height="23" style="--c:'+c+'"></rect>'
   +'<text class="graph2-label" x="0" y="22">'+E(nodeCode)+'</text>'
   +'</g>';
 });

 const centralBadgeW=Math.max(90,x.code.length*9.5+24);
 const centralNodeHtml='<g class="graph2-node is-central" data-code="'+E(x.code)+'" transform="translate(0,0)" tabindex="0" role="button" aria-label="'+E(x.code)+'">'
  +'<title>'+E(x.code)+' · Habilidade ativa</title>'
  +'<circle class="graph2-halo" r="38" style="--c:'+compCol+'"></circle>'
  +'<circle class="graph2-core" r="14" style="--c:'+compCol+'"></circle>'
  +'<rect class="graph2-badge-bg" x="-'+(centralBadgeW/2).toFixed(1)+'" y="18" width="'+centralBadgeW+'" height="28" style="--c:'+compCol+'"></rect>'
  +'<text class="graph2-label" x="0" y="32">'+E(x.code)+'</text>'
  +'</g>';

 const legendHtml='<div class="graph2-map-legend" role="region" aria-label="Legenda do mapa">'
  +'<div class="legend-header"><strong class="legend-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Legenda:</strong></div>'
  +'<div class="legend-items">'
  +'<span class="legend-item"><span class="legend-dot is-central" style="--c:'+compCol+'"></span><strong>Centro:</strong> '+E(x.code)+'</span>'
  +(conn.groups.anteriores?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#61b8ff"></span><strong>← Esquerda:</strong> Vêm antes</span>':'')
  +(conn.groups.posteriores?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#ffb86b"></span><strong>Direita →:</strong> Vêm depois</span>':'')
  +(conn.groups.competencias?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#c9a4e0"></span><strong>↑ Topo:</strong> Competências</span>':'')
  +(conn.groups.interdisciplinar?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#7de2b8"></span><strong>↓ Base:</strong> Interdisciplinar IA</span>':'')
  +(conn.groups.cieb?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#7dc9e8"></span><strong>Diagonal:</strong> CIEB</span>':'')
  +(conn.groups.reuna?.length?'<span class="legend-item"><span class="legend-dot" style="--c:#f2a365"></span><strong>Diagonal:</strong> Reúna</span>':'')
  +'</div>'
  +'<span class="legend-hint"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg> Clique em qualquer nó para abrir detalhes completos</span>'
  +'</div>';

 page.innerHTML='<header class="proposal-topbar">'
  +'<div class="proposal-nav-group">'
  +'<button type="button" class="proposal-btn" id="proposalBackDetail">← Voltar aos detalhes</button>'
  +'<button type="button" class="proposal-btn" data-home>Catálogo</button>'
  +'</div>'
  +'<div class="proposal-skill-pill">'
  +'<span class="proposal-skill-code">'+E(x.code)+'</span>'
  +'<span class="proposal-skill-meta">'+E(compName)+(x.group?' · '+E(x.group):'')+'</span>'
  +'<span class="proposal-conn-tag">'+conn.allNodes.size+' conexões</span>'
  +'</div>'
  +'<div class="proposal-view-actions">'
  +'<button type="button" class="proposal-tool-btn" id="graphZoomIn" aria-label="Aumentar zoom" title="Aumentar zoom">+</button>'
  +'<button type="button" class="proposal-tool-btn" id="graphZoomOut" aria-label="Diminuir zoom" title="Diminuir zoom">−</button>'
  +'<button type="button" class="proposal-tool-btn" id="graphReset" aria-label="Centralizar grafo" title="Centralizar grafo">⟲</button>'
  +'</div>'
  +'</header>'
  +'<div class="proposal-canvas-wrap" id="proposalCanvasWrap">'
  +'<div class="graph2-map-controls-top" role="toolbar" aria-label="Filtrar conexões do mapa">'
  +'<span class="graph2-filter-label"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filtros:</span>'
  +filterChips
  +'</div>'
  +'<svg class="proposal-svg" id="proposalSvg" viewBox="-900 -520 1800 1040">'
  +'<g id="proposalZoomGroup" transform="translate(0,0) scale(1)">'
  +'<g class="graph2-wires-layer">'+wiresHtml+flowsHtml+'</g>'
  +'<g class="graph2-nodes-layer">'+nodesHtml+centralNodeHtml+'</g>'
  +'</g>'
  +'</svg>'
  +legendHtml
  +'</div>';

 page.querySelector("#proposalBackDetail")?.addEventListener("click",()=>{
  page.hidden=true;
  $("#detailPage").hidden=false;
 });
 page.querySelectorAll("[data-home]").forEach(b=>b.addEventListener("click",home));

 const zoomGroup=page.querySelector("#proposalZoomGroup");
 const canvasWrap=page.querySelector("#proposalCanvasWrap");

 function syncTransform(){
  if(zoomGroup)zoomGroup.setAttribute("transform","translate("+proposalGraphState.panX.toFixed(1)+","+proposalGraphState.panY.toFixed(1)+") scale("+proposalGraphState.zoom.toFixed(3)+")");
 }

 page.querySelector("#graphZoomIn")?.addEventListener("click",()=>{
  proposalGraphState.zoom=Math.min(2.5,proposalGraphState.zoom*1.2);
  syncTransform();
 });
 page.querySelector("#graphZoomOut")?.addEventListener("click",()=>{
  proposalGraphState.zoom=Math.max(0.4,proposalGraphState.zoom/1.2);
  syncTransform();
 });
 page.querySelector("#graphReset")?.addEventListener("click",()=>{
  proposalGraphState.zoom=1;
  proposalGraphState.panX=0;
  proposalGraphState.panY=0;
  syncTransform();
 });

 // Pan & Zoom via pointer/drag and wheel
 let isPanning=false,startX=0,startY=0;
 canvasWrap?.addEventListener("pointerdown",e=>{
  if(e.target.closest(".graph2-node, .proposal-chip, .graph2-map-controls-top, .graph2-map-legend"))return;
  isPanning=true;
  startX=e.clientX-proposalGraphState.panX;
  startY=e.clientY-proposalGraphState.panY;
  canvasWrap.classList.add("is-dragging");
  canvasWrap.setPointerCapture(e.pointerId);
 });
 canvasWrap?.addEventListener("pointermove",e=>{
  if(!isPanning)return;
  proposalGraphState.panX=e.clientX-startX;
  proposalGraphState.panY=e.clientY-startY;
  syncTransform();
 });
 const stopPan=e=>{
  if(!isPanning)return;
  isPanning=false;
  canvasWrap?.classList.remove("is-dragging");
 };
 canvasWrap?.addEventListener("pointerup",stopPan);
 canvasWrap?.addEventListener("pointercancel",stopPan);

 canvasWrap?.addEventListener("wheel",e=>{
  e.preventDefault();
  const delta=e.deltaY<0?1.12:0.89;
  proposalGraphState.zoom=Math.max(0.4,Math.min(2.5,proposalGraphState.zoom*delta));
  syncTransform();
 },{passive:false});

 // Multi-select filter chips
 const selectedCats=new Set();

 function updateGraphFilters(){
  const allBtn=page.querySelector('.proposal-chip[data-cat=""]');
  const isAll=selectedCats.size===0||selectedCats.size===availableCats.length;
  if(allBtn)allBtn.classList.toggle("is-active",selectedCats.size===0);

  page.querySelectorAll('.proposal-chip[data-cat]:not([data-cat=""])').forEach(chip=>{
   const cat=chip.dataset.cat;
   chip.classList.toggle("is-active",selectedCats.has(cat));
  });

  page.querySelectorAll(".graph2-node:not(.is-central)").forEach(n=>{
   const match=isAll||selectedCats.has(n.dataset.cat);
   n.style.display=match?"":"none";
  });

  page.querySelectorAll(".graph2-wire, .graph2-flow").forEach(w=>{
   const match=isAll||selectedCats.has(w.dataset.cat);
   w.style.display=match?"":"none";
  });
 }

 page.querySelectorAll(".proposal-chip").forEach(chip=>{
  chip.addEventListener("click",()=>{
   const cat=chip.dataset.cat||"";
   if(!cat){
    selectedCats.clear();
   }else{
    if(selectedCats.has(cat)){
     selectedCats.delete(cat);
    }else{
     selectedCats.add(cat);
    }
   }
   updateGraphFilters();
  });
 });

 // Node interactions: Hover wire highlight & Click for full modal details
 page.querySelectorAll(".graph2-node").forEach(n=>{
  const nCode=n.dataset.code;
  if(!nCode)return;

  n.addEventListener("mouseenter",()=>{
   page.querySelectorAll('.graph2-wire[data-wire="'+nCode+'"]').forEach(w=>w.classList.add("is-highlighted"));
  });

  n.addEventListener("mouseleave",()=>{
   page.querySelectorAll('.graph2-wire[data-wire="'+nCode+'"]').forEach(w=>w.classList.remove("is-highlighted"));
  });

  n.addEventListener("click",()=>{
   if(S.by.has(nCode)){
    habilidadeModalAbrir(nCode);
   }else{
    const nodeData=conn.allNodes.get(nCode);
    modalAbrirInfo({
     kicker:"Referência conectada",
     title:nCode,
     meta:nodeData?.reason||"Conexão curricular",
     texto:nodeData?.text||("Referência conectada à habilidade "+x.code+".")
    });
   }
  });
 });
}
async function load(){
 try{const files=["educacao-infantil.json","ensino-fundamental.json","ensino-medio.json","estrutura.json","computacao.json","curriculo_cieb_computacao.json","sugestoes_interdisciplinares_ia.json","hierarquia_reuna.json","bncc-busca.min.json","reuna_visao_geral.json"],data=await Promise.all(files.map(async f=>{const r=await fetch(D+f);if(!r.ok)throw Error(f+" HTTP "+r.status);return r.json();}));normalize({ei:data[0],ef:data[1],em:data[2],structure:data[3],comp:data[4],cieb:data[5],ai:data[6],reuna:data[7],reunaVisao:data[9]});const searchIndex=new Map(data[8].itens.map(x=>[x.c,x]));S.all.forEach(x=>{const entry=x.kind!=="cieb"&&searchIndex.get(x.code);if(!entry)return;x.text=entry.t;x._textWords=words(x.text);x._topicWords=words(x.text+" "+x.topic);x._search=N([x.code,x.text,x.discipline,x.area,x.topic,x.group,entry.x,entry.d].join(" "));});fillFilters();render();events();$("#datasetStatus").textContent="1.721 aprendizagens BNCC + "+S.data.cieb.length+" referências CIEB · grafo dados-2026.08";const code=new URLSearchParams(location.search).get("codigo");if(code){detail(code);if(location.hash)requestAnimationFrame(()=>{const alvo=document.getElementById(decodeURIComponent(location.hash.slice(1)));detailMostrarFragmento(alvo);alvo?.scrollIntoView();});}
 }catch(e){console.error(e);$("#catalogRows").innerHTML='<div class="loading-state">Abra INICIAR.bat para iniciar o catálogo offline.<br><small>'+E(e.message)+'</small></div>';$("#datasetStatus").textContent="Arquivos locais prontos; inicie o servidor offline.";}
}
load();
})();
