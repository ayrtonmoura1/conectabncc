const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..'),original=fs.readFileSync(path.join(root,'app.js'),'utf8');
const instrumented=original.replace(/load\(\);\s*\}\)\(\);\s*$/,'globalThis.railApi={S,railItemIndex,createRailState,railMarkup,initializeRail,rememberRailPositions,scheduleRail,moveRail,moveRailFocus,syncRailA11y};})();');
assert.notEqual(instrumented,original,'Não foi possível preparar as faixas para verificação');
const frames=[],timers=new Map();let nextFrame=0,nextTimer=0;
const sandbox={document:{body:{dataset:{}},activeElement:null},localStorage:{getItem:()=>null},window:{matchMedia:()=>({matches:true})},getComputedStyle:()=>({paddingLeft:'0px'}),requestAnimationFrame:fn=>{frames.push(fn);return ++nextFrame;},setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),console};
vm.runInNewContext(instrumented,sandbox,{filename:'app.js'});
const api=sandbox.railApi,STEP=110,CARD_WIDTH=100;
function flushFrames(){let guard=0;while(frames.length||timers.size){if(++guard>100)throw Error('Quadros de animação não terminaram');if(frames.length)frames.shift()();else{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}}}

class FakeCard{
 constructor(track,code,index){this.track=track;this.dataset={code,railIndex:String(index)};this.attributes={'aria-hidden':'true'};this.tabIndex=-1;}
 getBoundingClientRect(){const left=this.track.children.indexOf(this)*STEP-this.track.scrollLeft;return {left,right:left+CARD_WIDTH};}
 setAttribute(name,value){this.attributes[name]=String(value);}
 removeAttribute(name){delete this.attributes[name];}
 remove(){const index=this.track.children.indexOf(this);if(index>=0)this.track.children.splice(index,1);this.track.scrollLeft=this.track.scrollLeft;}
 focus(){sandbox.document.activeElement=this;}
}
class FakeTrack{
 constructor(id,width=440){this.dataset={rail:id};this.clientWidth=width;this.isConnected=true;this.style={scrollBehavior:''};this.children=[];this._scrollLeft=0;}
 get scrollWidth(){return Math.max(this.clientWidth,this.children.length*STEP);}
 get scrollLeft(){return this._scrollLeft;}
 set scrollLeft(value){this._scrollLeft=Math.max(0,Math.min(Number(value)||0,this.scrollWidth-this.clientWidth));}
 getBoundingClientRect(){return {left:0,right:this.clientWidth};}
 querySelectorAll(selector){return selector==='.skill-card'?this.children.slice():[];}
 querySelector(selector){if(selector==='.skill-card')return this.children[0]||null;const match=selector.match(/data-rail-index="(-?\d+)"/);return match?this.children.find(c=>c.dataset.railIndex===match[1])||null:null;}
 insertAdjacentHTML(where,html){const cards=[...html.matchAll(/data-code="([^"]+)" data-rail-index="(-?\d+)"/g)].map(m=>new FakeCard(this,m[1],Number(m[2])));if(where==='afterbegin')this.children.unshift(...cards);else if(where==='beforeend')this.children.push(...cards);else throw Error('Posição inesperada');}
 scrollBy(options){this.scrollLeft+=options.left;}
}
const items=n=>Array.from({length:n},(_,i)=>({code:'H'+i,text:'Habilidade '+i,discipline:'Matemática',area:'Matemática',kind:'bncc',stage:'EF',group:'1º'}));
function mount(list,id='faixa',width=440){sandbox.document.activeElement=null;const rail=api.createRailState(list),track=new FakeTrack(id,width);api.S.rails.set(id,rail);track.insertAdjacentHTML('beforeend',api.railMarkup(rail,rail.start,rail.end));api.initializeRail(track);return {rail,track};}
function assertSequence(track,rail){assert.equal(track.children.length,rail.end-rail.start);track.children.forEach((card,i)=>{const virtual=rail.start+i;assert.equal(Number(card.dataset.railIndex),virtual);assert.equal(card.dataset.code,rail.items[api.railItemIndex(virtual,rail.items.length)].code);});}

test('a faixa inicia no primeiro cartão e conecta o último ao primeiro nos dois sentidos',()=>{
 const {rail,track}=mount(items(5));assert.equal(track.querySelector('[data-rail-index="0"]').getBoundingClientRect().left,0);assertSequence(track,rail);
 assert.equal(track.querySelector('[data-rail-index="-1"]').dataset.code,'H4');assert.equal(track.querySelector('[data-rail-index="0"]').dataset.code,'H0');
 const first=track.querySelector('[data-rail-index="0"]');api.moveRailFocus(track,first,-1);flushFrames();assert.equal(sandbox.document.activeElement.dataset.code,'H4');assert.equal(sandbox.document.activeElement.dataset.railIndex,'-1');
 api.moveRailFocus(track,sandbox.document.activeElement,1);flushFrames();assert.equal(sandbox.document.activeElement.dataset.code,'H0');assert.equal(sandbox.document.activeElement.dataset.railIndex,'0');
});

test('a navegação contínua mantém a sequência e limita a quantidade de cartões montados',()=>{
 const {rail,track}=mount(items(200),'longa');const visited=new Set();
 for(let i=0;i<120;i++){for(const c of track.children){const r=c.getBoundingClientRect();if(r.right>0&&r.left<track.clientWidth)visited.add(c.dataset.code);}api.moveRail(track,1);flushFrames();assertSequence(track,rail);}
 assert.equal(visited.size,200);assert.ok(rail.start>0);assert.ok(track.children.length<=104);
 for(let i=0;i<240;i++){api.moveRail(track,-1);flushFrames();assertSequence(track,rail);}
 assert.ok(rail.start<0);assert.ok(track.children.length<=104);
});

test('deslizar até as pontas prepara o próximo trecho sem deslocar o cartão visível',()=>{
 const {rail,track}=mount(items(40),'deslize');track.scrollLeft=track.scrollWidth-track.clientWidth-10;
 let anchor=track.children.find(c=>c.getBoundingClientRect().right>0),left=anchor.getBoundingClientRect().left,end=rail.end;
 api.scheduleRail(track);flushFrames();assert.ok(rail.end>end);assert.equal(anchor.getBoundingClientRect().left,left);assertSequence(track,rail);
 track.scrollLeft=10;anchor=track.children.find(c=>c.getBoundingClientRect().right>0);left=anchor.getBoundingClientRect().left;const start=rail.start;
 api.scheduleRail(track);flushFrames();assert.ok(rail.start<start);assert.equal(anchor.getBoundingClientRect().left,left);assertSequence(track,rail);
});

test('faixas pequenas não duplicam cartões visíveis para tecnologias assistivas',()=>{
 const {rail,track}=mount(items(2),'pequena');assertSequence(track,rail);
 const announced=track.children.filter(c=>c.attributes['aria-hidden']==='false');assert.equal(new Set(announced.map(c=>c.dataset.code)).size,announced.length);assert.equal(track.children.filter(c=>c.tabIndex===0).length,1);
 api.moveRail(track,1);flushFrames();const after=track.children.filter(c=>c.attributes['aria-hidden']==='false');assert.equal(new Set(after.map(c=>c.dataset.code)).size,after.length);
});

test('faixas vazias ou com um cartão não entram em ciclo',()=>{
 for(const n of [0,1]){const {rail,track}=mount(items(n),'tamanho'+n);assert.equal(rail.loop,false);assert.equal(track.children.length,n);const before=track.scrollLeft;api.moveRail(track,-1);api.moveRail(track,1);flushFrames();assert.equal(track.scrollLeft,before);if(n)assert.equal(track.children[0].tabIndex,0);}
});

test('a inicialização após abrir detalhes e a troca de filtros preservam somente os itens da faixa',()=>{
 const hidden=mount(items(4),'oculta',0);assert.equal(hidden.rail.initialized,false);hidden.track.clientWidth=440;api.initializeRail(hidden.track);assert.equal(hidden.rail.initialized,true);assert.equal(hidden.track.querySelector('[data-rail-index="0"]').getBoundingClientRect().left,0);
 const filtered=items(3).slice(1),{rail,track}=mount(filtered,'filtrada');for(let i=0;i<12;i++){api.moveRail(track,1);flushFrames();}assertSequence(track,rail);assert.ok(track.children.every(c=>['H1','H2'].includes(c.dataset.code)));
});

test('voltar dos detalhes restaura a posição e não adiciona cartões enquanto a faixa está oculta',()=>{
 const {rail,track}=mount(items(60),'retorno');for(let i=0;i<4;i++){api.moveRail(track,1);flushFrames();}
 api.moveRail(track,1);api.rememberRailPositions();const saved=rail.savedPosition,anchor=track.querySelector('[data-rail-index="'+saved.index+'"]');assert.ok(anchor);
 const count=track.children.length;track.clientWidth=0;flushFrames();assert.equal(track.children.length,count);
 track.clientWidth=440;track.scrollLeft=0;api.initializeRail(track);assert.equal(anchor.getBoundingClientRect().left,saved.offset);assert.equal(rail.savedPosition,null);
});
