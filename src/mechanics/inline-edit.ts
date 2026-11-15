// Renaming and deleting without the browser's own dialogs: prompt() and confirm() are blocked in some browsers and
// embedded views (they return at once), so the name turns into a field in place and a delete asks on its own button.

/** Turns `target` into a text field holding `current`: Enter or leaving it keeps the new name, Escape keeps the old. */
export function renameInPlace(target:HTMLElement,current:string,done:(name:string)=>void){
 if(target.querySelector('input'))return;
 const input=document.createElement('input');input.type='text';input.value=current;input.className='rename-input';input.maxLength=80;input.setAttribute('aria-label','Neuer Name');
 target.replaceChildren(input);input.focus();input.select();let over=false;
 const finish=(keep:boolean)=>{if(over)return;over=true;const name=input.value.trim();target.textContent=current;if(keep&&name&&name!==current)done(name);};
 // The page's keys (Delete removes, Ctrl+Z undoes) do not reach it.
 input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}};
 input.onblur=()=>finish(true);}

/** A button that asks before it acts: the first click turns it into the question, a second click within a few seconds does it. */
export function confirmByClick(button:HTMLElement,question:string,go:()=>void){
 if(button.dataset.armed){delete button.dataset.armed;button.textContent=button.dataset.text??button.textContent;go();return;}
 button.dataset.armed='true';button.dataset.text=button.textContent??'';button.textContent=question;
 setTimeout(()=>{if(!button.dataset.armed)return;delete button.dataset.armed;button.textContent=button.dataset.text??'';},4000);}
