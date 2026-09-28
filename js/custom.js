import { $, icon } from './ui.js';
import { CUSTOM_LIMITS, maxCustomMines, validDimensions, validCustom, copyCustom } from './config.js';

export function customSetup(ui, config, start) {
  const fields = [['width','Width',CUSTOM_LIMITS.minWidth,CUSTOM_LIMITS.maxWidth],
    ['height','Height',CUSTOM_LIMITS.minHeight,CUSTOM_LIMITS.maxHeight], ['mines','Mines',1,maxCustomMines(config.width,config.height)]];
  ui.dialog(`<p class="eyebrow">MAKE IT YOUR OWN</p><h2 id="modal-title">Custom game</h2><form id="custom-form" class="custom-form" novalidate>
    ${fields.map(([id,label,min,max]) => `<div class="custom-row"><label for="custom-${id}">${label}</label><div class="custom-stepper"><button type="button" class="icon-button" data-field="${id}" data-step="-1" aria-label="Decrease ${label.toLowerCase()}">−</button><input id="custom-${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" required value="${config[id]}" aria-describedby="custom-error custom-range"><button type="button" class="icon-button" data-field="${id}" data-step="1" aria-label="Increase ${label.toLowerCase()}">+</button></div></div>`).join('')}
    <p id="custom-range"></p><p id="custom-error" class="custom-error" role="status"></p>
    <button id="custom-start" type="submit" class="primary">Start game ${icon('arrow')}</button><button id="custom-cancel" type="button" class="secondary">Cancel</button></form>`, () => ui.close());
  const read = () => Object.fromEntries(fields.map(([id]) => [id, $(`custom-${id}`).valueAsNumber]));
  function validate(dimensionsChanged = false) {
    const c=read(), dims=validDimensions(c.width,c.height);
    if(dims) {
      const max=maxCustomMines(c.width,c.height);$('custom-mines').max=max;
      if(dimensionsChanged && Number.isInteger(c.mines) && c.mines>max) {c.mines=max;$('custom-mines').value=max;}
      $('custom-range').textContent=`${c.width} × ${c.height} · 1–${max} mines. First opening stays safe.`;
    } else $('custom-range').textContent='Width 5–40 · Height 5–30';
    const valid=validCustom(c);$('custom-start').disabled=!valid;
    $('custom-error').textContent=valid?'':!dims?'Use whole numbers: width 5–40 and height 5–30.':`Mines must be a whole number from 1 to ${maxCustomMines(c.width,c.height)}.`;
    for(const button of $('custom-form').querySelectorAll('[data-step]')) {
      const input=$(`custom-${button.dataset.field}`), n=input.valueAsNumber;
      button.disabled=Number(button.dataset.step)<0 ? n<=Number(input.min) : n>=Number(input.max);
    }
    return valid;
  }
  for(const [id] of fields) $(`custom-${id}`).oninput=()=>validate(id!=='mines');
  $('custom-form').querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.field,input=$(`custom-${id}`),value=input.valueAsNumber;
    const base=Number.isFinite(value)?Math.trunc(value):config[id];
    input.value=Math.max(Number(input.min),Math.min(Number(input.max),base+Number(button.dataset.step)));
    validate(id!=='mines');
  });
  $('custom-form').onsubmit=event=>{event.preventDefault();if(validate())start(copyCustom(read()));};
  $('custom-cancel').onclick=()=>ui.close();validate();
}
