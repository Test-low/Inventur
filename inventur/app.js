'use strict';
(() => {
  const STORAGE_KEY = 'holzoptix:inventur-helfer:v1';
  const LIMIT = 100000000;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, places = 0) => new Intl.NumberFormat('de-DE', {maximumFractionDigits:places}).format(n);
  const uid = () => (globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2));
  const emptyDraft = (type = 'package') => ({
    type, editingId: null, name: '', articleNo: '', note: '', length: '', width: '',
    packages: [{id:uid(), packs:'', perPack:''}], loosePackage: '',
    blocks: [{id:uid(), perLayer:'', layers:''}], rows: [], rowInput:'', looseStack:''
  });
  let state = {version:1, items:[], draft:emptyDraft()};
  let activeTab = 'package';

  function storageMessage(message, error = false) {
    const target = $('save-status');
    target.textContent = message;
    target.classList.toggle('error', error);
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageMessage('Lokal gespeichert');
      return true;
    } catch (_) {
      storageMessage('Speicherung nicht möglich', true);
      return false;
    }
  }
  function quantity(value, field, allowEmpty = false) {
    const raw = String(value ?? '').trim();
    if (allowEmpty && raw === '') return null;
    if (!/^\d+$/.test(raw)) throw Error(field + ': bitte eine ganze, nicht negative Zahl eingeben.');
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n > LIMIT) throw Error(field + ': Zahl ist zu groß.');
    return n;
  }
  function measure(value, field) {
    if (String(value ?? '').trim() === '') return null;
    const n = quantity(value, field);
    if (n <= 0) throw Error(field + ': Maß muss größer als 0 sein.');
    return n;
  }
  function mul(a, b) {
    const x = a * b;
    if (!Number.isSafeInteger(x) || x > LIMIT) throw Error('Die Gesamtmenge ist zu groß.');
    return x;
  }
  function add(a, b) {
    const x = a + b;
    if (!Number.isSafeInteger(x) || x > LIMIT) throw Error('Die Gesamtmenge ist zu groß.');
    return x;
  }
  function calculate(d, strict = false) {
    let total = 0, parts = 0;
    const breakdown = [];
    if (d.type === 'package') {
      d.packages.forEach((g, i) => {
        const a = quantity(g.packs, 'Paketgruppe ' + (i+1), true);
        const b = quantity(g.perPack, 'Stück je Paket ' + (i+1), true);
        if (a === null && b === null) return;
        if (a === null || b === null) throw Error('Paketgruppe ' + (i+1) + ' bitte vollständig ausfüllen.');
        const n = mul(a, b);
        total = add(total, n);
        parts++;
        breakdown.push(a + ' Pakete × ' + b);
      });
      const loose = quantity(d.loosePackage, 'Lose Stücke', true);
      if (loose !== null) {total = add(total, loose);parts++;breakdown.push(loose + ' lose');}
    } else if (d.type === 'stack') {
      d.blocks.forEach((g, i) => {
        const a = quantity(g.perLayer, 'Bretter/Lage ' + (i+1), true);
        const b = quantity(g.layers, 'Lagen ' + (i+1), true);
        if (a === null && b === null) return;
        if (a === null || b === null) throw Error('Teilblock ' + (i+1) + ' bitte vollständig ausfüllen.');
        total = add(total, mul(a, b));
        parts++;
        breakdown.push(a + ' × ' + b + ' Lagen');
      });
      d.rows.forEach((row, i) => {
        total = add(total, quantity(row, 'Reihe ' + (i+1)));
        parts++;
      });
      if (d.rows.length) breakdown.push(d.rows.length + ' Einzelreihen: ' + d.rows.join(' + '));
      const loose = quantity(d.looseStack, 'Einzelne Bretter', true);
      if (loose !== null) {total = add(total, loose);parts++;breakdown.push(loose + ' einzelne');}
      if (strict && String(d.rowInput ?? '').trim() !== '') throw Error('Die letzte Einzelreihe bitte mit „+ Reihe“ übernehmen.');
    } else throw Error('Unbekannter Zählmodus.');
    if (strict && parts === 0) throw Error('Bitte mindestens eine Menge eingeben.');
    const length = measure(d.length, 'Länge');
    const width = measure(d.width, 'Breite');
    const lfm = length === null ? null : total * length / 1000;
    const area = length === null || width === null ? null : total * length * width / 1000000;
    return {total, parts, breakdown:breakdown.join(' · '), length, width, lfm, area};
  }
  function fromItem(item) {
    const d = emptyDraft(item.type);
    d.editingId = item.id;
    for (const key of ['name','articleNo','note']) d[key] = String(item[key] || '');
    d.length = item.length == null ? '' : String(item.length);
    d.width = item.width == null ? '' : String(item.width);
    if (item.type === 'package') {
      d.packages = item.packages.map(g => ({id:uid(), packs:String(g.packs),perPack:String(g.perPack)}));
      d.loosePackage = item.loose == null ? '' : String(item.loose);
      if (!d.packages.length) d.packages = [{id:uid(),packs:'',perPack:''}];
    } else {
      d.blocks = item.blocks.map(g => ({id:uid(),perLayer:String(g.perLayer),layers:String(g.layers)}));
      d.rows = item.rows.map(Number);
      d.looseStack = item.loose == null ? '' : String(item.loose);
      if (!d.blocks.length) d.blocks = [{id:uid(),perLayer:'',layers:''}];
    }
    return d;
  }
  function createEntry(d, id = uid(), createdAt = new Date().toISOString()) {
    const name = String(d.name || '').trim();
    if (!name) throw Error('Bitte eine Artikelbezeichnung eingeben.');
    if (name.length > 100 || String(d.articleNo).length > 60 || String(d.note).length > 160) throw Error('Text ist zu lang.');
    const v = calculate(d, true);
    const item = {
      id, type:d.type, name, articleNo:String(d.articleNo || '').trim(),note:String(d.note || '').trim(),
      length:v.length,width:v.width,total:v.total,parts:v.parts,breakdown:v.breakdown,
      lfm:v.lfm,area:v.area,createdAt,updatedAt:new Date().toISOString(),
      packages:[],blocks:[],rows:[],loose:null
    };
    if (d.type === 'package') {
      item.packages = d.packages.filter(g => String(g.packs).trim() !== '' || String(g.perPack).trim() !== '')
        .map(g => ({packs:quantity(g.packs,'Pakete'),perPack:quantity(g.perPack,'Stück je Paket')}));
      item.loose = quantity(d.loosePackage,'Lose Stücke',true);
    } else {
      item.blocks = d.blocks.filter(g => String(g.perLayer).trim() !== '' || String(g.layers).trim() !== '')
        .map(g => ({perLayer:quantity(g.perLayer,'Bretter je Lage'),layers:quantity(g.layers,'Anzahl Lagen')}));
      item.rows = d.rows.slice();
      item.loose = quantity(d.looseStack,'Einzelne Bretter',true);
    }
    return item;
  }
  function validImportedItem(item) {
    if (!item || typeof item !== 'object' || !['package','stack'].includes(item.type)) throw Error('Ungültiger Artikel.');
    if ((item.packages?.length || 0) > 1000 || (item.blocks?.length || 0) > 1000 || (item.rows?.length || 0) > 10000) throw Error('Zu viele Zählgruppen.');
    const d = fromItem(item);
    const rebuilt = createEntry(d);
    return rebuilt;
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw?.version === 1 && Array.isArray(raw.items) && raw.items.length <= 5000) {
        const items = raw.items.map(item => ({...validImportedItem(item),id:String(item.id),createdAt:item.createdAt || new Date().toISOString()}));
        state = {version:1,items,draft:raw.draft && typeof raw.draft==='object' ? raw.draft : emptyDraft()};
        if (!['package','stack'].includes(state.draft.type) || !Array.isArray(state.draft.packages) ||
            !Array.isArray(state.draft.blocks) || !Array.isArray(state.draft.rows)) state.draft = emptyDraft();
      }
    } catch (_) {
      state = {version:1,items:[],draft:emptyDraft()};
      storageMessage('Alte Daten nicht lesbar – bitte Sicherung prüfen',true);
    }
    activeTab = state.draft.type || 'package';
  }
  function createNumberInput(value, placeholder, kind, id, field) {
    const input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
    input.placeholder = placeholder; input.value = value;
    input.setAttribute('aria-label', placeholder);
    input.addEventListener('input', () => {
      const rows = kind === 'package' ? state.draft.packages : state.draft.blocks;
      const target = rows.find(x => x.id === id);
      if (!target) return;
      target[field] = input.value;
      persist(); renderPreview();
    });
    return input;
  }
  function renderGroups(kind) {
    const isPackage = kind === 'package';
    const target = $(isPackage ? 'package-groups':'stack-blocks');
    const groups = isPackage ? state.draft.packages : state.draft.blocks;
    target.replaceChildren();
    groups.forEach(g => {
      const row = document.createElement('div'); row.className='group-row';
      row.append(
        createNumberInput(isPackage ? g.packs : g.perLayer,isPackage?'Anzahl Pakete':'Bretter je Lage',kind,g.id,isPackage?'packs':'perLayer'),
        createNumberInput(isPackage ? g.perPack : g.layers,isPackage?'Stück je Paket':'Anzahl Lagen',kind,g.id,isPackage?'perPack':'layers')
      );
      const remove = document.createElement('button');
      remove.type='button'; remove.textContent='×';remove.title='Gruppe entfernen';
      remove.disabled = groups.length <= 1;
      remove.addEventListener('click', () => {
        const key = isPackage ? 'packages' : 'blocks';
        state.draft[key] = state.draft[key].filter(x=>x.id!==g.id);
        persist();renderGroups(kind);renderPreview();
      });
      row.append(remove);target.append(row);
    });
  }
  function renderRows() {
    const target = $('row-chips');target.replaceChildren();
    if (!state.draft.rows.length) {
      const text = document.createElement('span');text.className='muted';
      text.textContent='Noch keine Einzelreihen hinzugefügt.';target.append(text);return;
    }
    state.draft.rows.forEach((n,i)=>{
      const chip=document.createElement('span');chip.className='chip';
      chip.append(document.createTextNode('Reihe '+(i+1)+': '+n));
      const button=document.createElement('button');button.type='button';button.textContent='×';button.title='Reihe entfernen';
      button.addEventListener('click',()=>{state.draft.rows.splice(i,1);persist();renderRows();renderPreview();});
      chip.append(button);target.append(chip);
    });
  }
  function renderEditor() {
    const d=state.draft;
    $('article-name').value=d.name || '';
    $('article-no').value=d.articleNo || '';
    $('article-note').value=d.note || '';
    $('uniform-length').value=d.length || '';
    $('uniform-width').value=d.width || '';
    $('loose-package').value=d.loosePackage || '';
    $('loose-stack').value=d.looseStack || '';
    $('row-input').value=d.rowInput || '';
    $('editor-heading').textContent=d.editingId ? 'Artikel bearbeiten' : 'Neue Zählung';
    $('save-item').textContent=d.editingId ? '✓ Änderungen speichern' : '✓ Artikel zur Ergebnisliste hinzufügen';
    renderGroups('package');renderGroups('stack');renderRows();renderPreview();
  }
  function renderPreview() {
    const d=state.draft;
    $('validation-message').hidden=true;
    try{
      const value=calculate(d);
      $('preview-total').textContent=fmt(value.total);
      $('total-formula').textContent=value.parts ? value.parts+' Teilzählung'+(value.parts===1?'':'en') : 'Noch keine Mengen eingetragen';
      const output=[];
      if (value.lfm!==null) output.push(fmt(value.lfm,2)+' lfm');
      if (value.area!==null) output.push(fmt(value.area,3)+' m²');
      $('conversion-result').textContent=output.join(' · ') || 'Für die Umrechnung Maße eingeben.';
    }catch(err){
      $('preview-total').textContent='—';
      $('total-formula').textContent='Eingaben prüfen';
      $('conversion-result').textContent=err.message;
    }
  }
  function switchTab(tab) {
    activeTab=tab;
    if(tab!=='results'){state.draft.type=tab;persist();}
    for(const button of document.querySelectorAll('.tab')){
      const chosen=button.dataset.tab===tab;
      button.classList.toggle('is-active',chosen);
      if(chosen)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    $('editor').hidden=tab==='results';
    $('panel-package').hidden=tab!=='package';
    $('panel-stack').hidden=tab!=='stack';
    $('panel-results').hidden=tab!=='results';
    if(tab==='results')renderResults();else renderPreview();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function hasDraftContent(d) {
    return Boolean(d.editingId || String(d.name||'').trim() || String(d.articleNo||'').trim() ||
      String(d.note||'').trim() || String(d.length||'').trim() || String(d.width||'').trim() ||
      String(d.rowInput||'').trim() ||
      String(d.loosePackage||'').trim() || String(d.looseStack||'').trim() ||
      d.rows.length || d.packages.some(g=>g.packs||g.perPack) || d.blocks.some(g=>g.perLayer||g.layers));
  }
  function newItem(type=activeTab==='results'?'package':activeTab, confirmDiscard=true) {
    if(confirmDiscard && hasDraftContent(state.draft) && !confirm('Aktuelle, noch nicht übernommene Eingaben verwerfen und einen neuen Artikel beginnen?'))return;
    state.draft=emptyDraft(type);persist();renderEditor();switchTab(type);
    $('article-name').focus();
  }
  function saveItem() {
    try {
      const d=state.draft;
      const old=state.items.find(x=>x.id===d.editingId);
      const entry=createEntry(d,old?.id || uid(),old?.createdAt);
      if(entry.total===0 && !confirm('Der Artikel hat 0 Stück. Wirklich so in die Ergebnisliste übernehmen?'))return;
      if(!old && state.items.some(x=>x.name.toLowerCase()===entry.name.toLowerCase() && x.articleNo===entry.articleNo)) {
        if(!confirm('Dieser Artikel ist bereits in der Ergebnisliste. Trotzdem eine weitere Zählung speichern?'))return;
      }
      if(old)state.items=state.items.map(x=>x.id===old.id?entry:x);else state.items.push(entry);
      state.draft=emptyDraft(d.type);
      if(!persist()){alert('Speicherung fehlgeschlagen. Bitte genügend freien Speicher prüfen.');return;}
      renderEditor();renderResults();switchTab('results');
    }catch(err){$('validation-message').textContent=err.message;$('validation-message').hidden=false;}
  }
  function renderResults() {
    $('result-count').textContent=state.items.length;
    $('summary-articles').textContent=state.items.length;
    $('summary-counts').textContent=fmt(state.items.reduce((n,x)=>n+x.parts,0));
    $('results-empty').hidden=state.items.length>0;
    const container=$('results-list');container.replaceChildren();
    state.items.forEach((item,index)=>{
      const card=document.createElement('article');card.className='result-card';
      const info=document.createElement('div');
      const title=document.createElement('h3');title.textContent=(index+1)+'. '+item.name;info.append(title);
      const details=document.createElement('p');
      details.textContent=[item.articleNo?'Art.-Nr. '+item.articleNo:null,item.type==='package'?'Paketrechner':'Stapelzähler',item.note].filter(Boolean).join(' · ');
      info.append(details);
      const breakdown=document.createElement('p');breakdown.className='breakdown';breakdown.textContent=item.breakdown || 'Keine Gruppen';
      info.append(breakdown);
      if(item.lfm!==null){
        const conv=document.createElement('p');conv.textContent=fmt(item.lfm,2)+' lfm'+(item.area!==null?' · '+fmt(item.area,3)+' m²':'');
        info.append(conv);
      }
      const qty=document.createElement('div');qty.className='result-qty';qty.append(document.createTextNode(fmt(item.total)+' '));
      const small=document.createElement('small');small.textContent='Stück';qty.append(small);
      const controls=document.createElement('div');controls.className='result-controls';
      const edit=document.createElement('button');edit.className='btn subtle';edit.type='button';edit.textContent='✎ Bearbeiten';
      edit.addEventListener('click',()=>{
        if(hasDraftContent(state.draft)&&!confirm('Aktuelle Eingaben verwerfen und diesen Artikel bearbeiten?'))return;
        state.draft=fromItem(item);persist();renderEditor();switchTab(item.type);
      });
      const remove=document.createElement('button');remove.className='btn danger';remove.type='button';remove.textContent='× Entfernen';
      remove.addEventListener('click',()=>{
        if(!confirm('„'+item.name+'“ wirklich aus der Ergebnisliste entfernen?'))return;
        state.items=state.items.filter(x=>x.id!==item.id);persist();renderResults();
      });
      controls.append(edit,remove);card.append(info,qty,controls);container.append(card);
    });
  }
  function download(text, filename, mime) {
    const blob=new Blob([text],{type:mime});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function csvCell(value) {
    let s=String(value??'');
    // Textfelder nicht als Excel-Formel ausführen lassen.
    if(/^\s*[=+\-@]/.test(s))s="'"+s;
    return '"' + s.replace(/"/g,'""') + '"';
  }
  function exportCsv() {
    if(!state.items.length){alert('Noch keine Ergebnisse vorhanden.');return;}
    const rows=[['Nr.','Artikelnummer','Artikel','Werkzeug','Stück','Länge mm','Breite mm','Laufmeter','Quadratmeter','Berechnung','Bemerkung']];
    state.items.forEach((x,i)=>rows.push([
      i+1,x.articleNo,x.name,x.type==='package'?'Paket':'Stapel',x.total,
      x.length??'',x.width??'',x.lfm===null?'':String(Math.round(x.lfm*1000000)/1000000).replace('.',','),x.area===null?'':String(Math.round(x.area*1000000)/1000000).replace('.',','),
      x.breakdown,x.note
    ]));
    download('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'HolzOptiX_Inventur_Ergebnisse.csv','text/csv;charset=utf-8');
  }
  function exportJson() {
    download(JSON.stringify({format:'holzoptix-inventur/v1',exportedAt:new Date().toISOString(),items:state.items},null,2),
      'HolzOptiX_Inventur_Sicherung.json','application/json');
  }
  async function importJson(file) {
    if(!file)return;
    if(file.size>5*1024*1024){alert('Sicherung zu groß (maximal 5 MB).');return;}
    try{
      const payload=JSON.parse(await file.text());
      if(payload?.format!=='holzoptix-inventur/v1'||!Array.isArray(payload.items)||payload.items.length>5000)
        throw Error('Keine gültige Inventur-Helfer-Sicherung.');
      const imports=payload.items.map(validImportedItem);
      if(!imports.length){alert('Diese Sicherung enthält keine Artikel.');return;}
      if(!confirm(imports.length+' Artikel aus der Sicherung zur aktuellen Ergebnisliste hinzufügen? Bestehende Einträge bleiben erhalten.'))return;
      if(state.items.length+imports.length>5000)throw Error('Die Liste würde zu groß werden.');
      state.items.push(...imports);persist();renderResults();alert(imports.length+' Artikel übernommen.');
    }catch(err){alert('Import nicht möglich: '+err.message);}
  }
  function wire() {
    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    for(const [id,key] of [['article-name','name'],['article-no','articleNo'],['article-note','note'],
      ['uniform-length','length'],['uniform-width','width'],['loose-package','loosePackage'],['loose-stack','looseStack'],['row-input','rowInput']]){
      $(id).addEventListener('input',e=>{state.draft[key]=e.target.value;persist();renderPreview();});
    }
    $('add-package').addEventListener('click',()=>{state.draft.packages.push({id:uid(),packs:'',perPack:''});persist();renderGroups('package');});
    $('add-block').addEventListener('click',()=>{state.draft.blocks.push({id:uid(),perLayer:'',layers:''});persist();renderGroups('stack');});
    const addRow=()=>{
      try{
        const n=quantity(state.draft.rowInput,'Einzelreihe');
        state.draft.rows.push(n);state.draft.rowInput='';$('row-input').value='';
        persist();renderRows();renderPreview();$('row-input').focus();
      }catch(err){alert(err.message);}
    };
    $('add-row').addEventListener('click',addRow);
    $('row-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addRow();}});
    $('save-item').addEventListener('click',saveItem);
    $('go-results').addEventListener('click',()=>switchTab('results'));
    $('new-item').addEventListener('click',()=>newItem());
    $('result-new').addEventListener('click',()=>newItem('package'));
    $('export-csv').addEventListener('click',exportCsv);
    $('export-json').addEventListener('click',exportJson);
    $('print-results').addEventListener('click',()=>{if(!state.items.length)return alert('Noch keine Ergebnisse vorhanden.');window.print();});
    $('import-json').addEventListener('click',()=>$('import-file').click());
    $('import-file').addEventListener('change',async e=>{await importJson(e.target.files[0]);e.target.value='';});
    $('clear-results').addEventListener('click',()=>{
      if(!state.items.length)return;
      if(!confirm('Alle '+state.items.length+' Artikel aus der Ergebnisliste entfernen?'))return;
      if(!confirm('Wirklich ALLE Ergebnisse löschen? Eine Rückgängig-Funktion gibt es dafür nicht.'))return;
      state.items=[];persist();renderResults();
    });
  }
  load();wire();renderEditor();renderResults();switchTab(activeTab);
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
  }
})();
