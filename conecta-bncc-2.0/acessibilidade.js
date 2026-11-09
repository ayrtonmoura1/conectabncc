(()=>{
 const storageKey='conecta-bncc-large-text',root=document.documentElement;
 const themeButton=document.querySelector('#themeButton');
 if(!themeButton||document.querySelector('#fontSizeButton'))return;
 const button=document.createElement('button');
 button.type='button';button.id='fontSizeButton';button.className='icon-button font-size-button';button.setAttribute('aria-pressed','false');
 themeButton.insertAdjacentElement('afterend',button);
 let large=false;
 const elementsIn=node=>node.nodeType===Node.ELEMENT_NODE?[node,...node.querySelectorAll('*')]:[];
 function measure(elements){for(const el of elements)el.style.setProperty('--a11y-base-font-size',getComputedStyle(el).fontSize);}
 function setLarge(enabled,persist=true){
  if(enabled){measure([document.body,...document.body.querySelectorAll('*')]);root.dataset.largeText='true';}
  else{delete root.dataset.largeText;for(const el of [document.body,...document.body.querySelectorAll('*')])el.style.removeProperty('--a11y-base-font-size');}
  large=enabled;button.setAttribute('aria-pressed',String(large));button.textContent=large?'A−':'A+';button.setAttribute('aria-label',large?'Desativar letras grandes':'Ativar letras grandes');button.title=large?'Voltar ao tamanho normal':'Ativar letras grandes';
  if(persist)localStorage.setItem(storageKey,large?'true':'false');
  window.SkillGraph?.refresh?.();
 }
 button.addEventListener('click',()=>setLarge(!large));
 const observer=new MutationObserver(records=>{
  if(!large)return;
  const added=records.flatMap(r=>[...r.addedNodes]).filter(n=>n.nodeType===Node.ELEMENT_NODE);
  if(!added.length)return;
  delete root.dataset.largeText;
  measure([...new Set(added.flatMap(elementsIn))]);
  root.dataset.largeText='true';
 });
 observer.observe(document.body,{childList:true,subtree:true});
 setLarge(localStorage.getItem(storageKey)==='true',false);
})();
