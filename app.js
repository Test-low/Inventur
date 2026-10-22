'use strict';
(() => {
  if (typeof window !== 'undefined') window.HolzOptiXAppVersion = '1.4';
  // Auf Touch-Geräten nur den Seitenzoom sperren. Der Foto-Canvas besitzt
  // eigene Pointer-Gesten zum Vergrößern und Verschieben des Bildes.
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    // iOS Safari verwendet zusätzlich eigene, nicht standardisierte Gesten.
    for (const eventName of ['gesturestart', 'gesturechange']) {
      document.addEventListener(eventName, event => event.preventDefault(), {passive:false});
    }
  }
  const STORAGE_KEY = 'holzoptix:inventur-helfer:v1';
  const LIMIT = 100000000;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, places = 0) => new Intl.NumberFormat('de-DE', {maximumFractionDigits:places}).format(n);
  const uid = () => (globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2));
  const newZone = (index=0) => ({id:uid(),name:'Bereich '+(index+1),color:['#e75b35','#298ed1','#229c58','#ca8b19','#9959ca','#cb4b89','#167d83','#6e6fce'][index%8],locked:false});
  const emptyDraft = (type = 'package') => ({
    type, editingId: null, editingGroupId:null, name: '', articleNo: '', note: '', length: '', width: '',thickness:'',
    packages: [{id:uid(), packs:'', perPack:''}], loosePackage: '', openPacks:[],
    openPackDraft:{perPack:'',mode:'remaining',amount:''},
    blocks: [{id:uid(), perLayer:'', layers:''}], rows: [], rowInput:'', looseStack:'',
    heightDraft:{height:'',thickness:'',perLayer:'',withSpacers:false,spacers:'',spacerThickness:''},heightBlocks:[],
    photoId:null,photoMarks:[],photoZones:[newZone()],activePhotoZoneId:null,
    lengthRows:[{id:uid(),length:'',count:''}]
  });
  const toolType = tool => tool==='photo'?'stack':tool;
  const newDrafts = () => ({package:emptyDraft('package'),stack:emptyDraft('stack'),
    length:emptyDraft('length'),photo:emptyDraft('stack')});
  let state = {version:1,items:[],draft:emptyDraft(),drafts:newDrafts(),parkedDrafts:{},presets:[]};
  let activeTab = 'home';
  let activeTool = 'package';
  let packageMode = 'whole';
  let stackMode = 'blocks';
  let photoReady = false;
  let storageReadError = false;

  function normalizePhoto(d) {
    const input=Array.isArray(d.photoZones)?d.photoZones:[];
    const zones=[],seen=new Set();
    input.slice(0,50).forEach((z,i)=>{
      if(!z||typeof z!=='object')return;
      const id=typeof z.id==='string'&&z.id.length<=100&&!seen.has(z.id)?z.id:uid();
      seen.add(id);
      zones.push({id,name:String(z.name||'Bereich '+(i+1)).slice(0,50),
        color:typeof z.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(z.color)?z.color:newZone(i).color,locked:z.locked===true});
    });
    d.photoZones=zones.length?zones:[newZone()];
    const ids=new Set(d.photoZones.map(z=>z.id));
    d.activePhotoZoneId=ids.has(d.activePhotoZoneId)?d.activePhotoZoneId:d.photoZones[0].id;
    d.photoMarks=Array.isArray(d.photoMarks)?d.photoMarks.map(p=>({...p,zoneId:ids.has(p?.zoneId)?p.zoneId:d.photoZones[0].id})):[];
  }
  function normalizeDraft(d) {
    if(!d||typeof d!=='object'||Array.isArray(d)||!['package','stack','length'].includes(d.type))return emptyDraft();
    const blank=emptyDraft(d.type);
    for(const [key,value] of Object.entries(blank))if(d[key]===undefined||d[key]===null)d[key]=value;
    if(!Array.isArray(d.packages)||!Array.isArray(d.blocks)||!Array.isArray(d.rows))return emptyDraft();
    if(!Array.isArray(d.openPacks))d.openPacks=[];
    if(!Array.isArray(d.heightBlocks))d.heightBlocks=[];
    if(!Array.isArray(d.lengthRows))d.lengthRows=blank.lengthRows;
    if(!d.openPackDraft||typeof d.openPackDraft!=='object')d.openPackDraft=blank.openPackDraft;
    if(!d.heightDraft||typeof d.heightDraft!=='object')d.heightDraft=blank.heightDraft;
    normalizePhoto(d);
    return d;
  }

  function storageMessage(message, error = false) {
    const target = $('save-status');
    target.textContent = message;
    target.classList.toggle('error', error);
  }
  function persist() {
    if (storageReadError) {
      storageMessage('Alte Zählungen geschützt – Daten konnten nicht gelesen werden', true);
      return false;
    }
    try {
      state.drafts[activeTool]=state.draft;
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
  function positive(value, field) {
    const n=quantity(value,field);
    if(n<=0)throw Error(field+': bitte eine Zahl größer als 0 eingeben.');
    return n;
  }
  function openPackCount(g) {
    const size=positive(g.perPack,'Ursprüngliche Paketgröße');
    const amount=quantity(g.amount,'Rest-/Entnahmemenge');
    if(amount>size)throw Error('Restmenge oder Entnahme darf nicht größer als das Paket sein.');
    if(!['remaining','removed'].includes(g.mode))throw Error('Ungültige Restpaket-Rechenart.');
    return g.mode==='remaining'?amount:size-amount;
  }
  function heightCalculation(h) {
    const height=positive(h.height,'Stapelhöhe'),thickness=positive(h.thickness,'Brettstärke');
    const perLayer=positive(h.perLayer,'Bretter pro Lage');
    const withSpacers=h.withSpacers===true || (h.withSpacers===undefined && Number(h.spacers)>0);
    const spacers=withSpacers?quantity(h.spacers,'Anzahl Zwischenhölzer'):0;
    const spacerThickness=withSpacers?positive(h.spacerThickness,'Zwischenholzstärke'):0;
    const net=height-spacers*spacerThickness;
    if(net<=0)throw Error('Die Zwischenhölzer sind höher als der eigentliche Stapel.');
    const layers=Math.floor(net/thickness);
    if(layers<=0)throw Error('Die verbleibende Höhe reicht nicht für eine volle Lage.');
    return {height,thickness,perLayer,withSpacers,spacers,spacerThickness,layers,
      remainder:net-layers*thickness,count:mul(layers,perLayer)};
  }
  function lengthRows(d) {
    if(!Array.isArray(d.lengthRows)||d.lengthRows.length>1000)throw Error('Zu viele Holzlängen.');
    const seen=new Set();
    return d.lengthRows.filter(r=>String(r.length??'').trim()!==''||String(r.count??'').trim()!=='').map(r=>{
      const length=positive(r.length,'Holzlänge (mm)'),count=quantity(r.count,'Stückzahl zur Länge');
      if(seen.has(length))throw Error('Länge '+fmt(length)+' mm kommt mehrfach vor. Bitte Stückzahlen zusammenfassen.');
      seen.add(length);return {length,count};
    });
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
      (d.openPacks||[]).forEach(g=>{
        const n=openPackCount(g);total=add(total,n);parts++;
        breakdown.push('Restpaket '+g.perPack+': '+n+' übrig');
      });
      if(strict && String(d.openPackDraft?.amount??'').trim()!=='')
        throw Error('Restpaket bitte zuerst mit „+ Restpaket“ übernehmen.');
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
      (d.heightBlocks||[]).forEach(h=>{
        const result=heightCalculation(h);total=add(total,result.count);parts++;
        breakdown.push('Höhenschätzung: '+result.layers+' Lagen × '+result.perLayer+' = '+result.count);
      });
      const marks=d.photoMarks || [];
      if(!Array.isArray(marks)||marks.length>10000 || marks.some(p => !p || !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1)) throw Error('Ungültige Foto-Markierungen.');
      if(marks.some(p=>p.zoneId!==undefined&&!d.photoZones?.some(z=>z.id===p.zoneId)))throw Error('Ungültiger Foto-Zählbereich.');
      if(marks.length){total=add(total,marks.length);parts++;breakdown.push('Foto: '+marks.length+' markiert');}
      if (strict && String(d.rowInput ?? '').trim() !== '') throw Error('Die letzte Einzelreihe bitte mit „+ Reihe“ übernehmen.');
      if(strict && ['height','thickness','perLayer'].some(k=>String(d.heightDraft?.[k]??'').trim()!==''))
        throw Error('Höhenrechner bitte zuerst mit „Berechneten Stapel übernehmen“ abschließen oder Eingaben entfernen.');
    } else if (d.type === 'length') {
      const rows=lengthRows(d);
      rows.forEach(r=>{total=add(total,r.count);parts++;});
      if(strict&&!rows.length)throw Error('Bitte mindestens eine Länge mit Stückzahl eingeben.');
      const width=measure(d.width,'Breite'),thickness=measure(d.thickness,'Stärke');
      const lfm=rows.reduce((n,r)=>n+r.length*r.count/1000,0);
      const area=width===null?null:lfm*width/1000;
      const volume=width===null||thickness===null?null:area*thickness/1000;
      return {total,parts,breakdown:rows.map(r=>fmt(r.length)+' mm: '+r.count+' St.').join(' · '),
        length:null,width,thickness,lfm,area,volume};
    } else throw Error('Unbekannter Zählmodus.');
    if (strict && parts === 0) throw Error('Bitte mindestens eine Menge eingeben.');
    const length = measure(d.length, 'Länge');
    const width = measure(d.width, 'Breite');
    const lfm = length === null ? null : total * length / 1000;
    const area = length === null || width === null ? null : total * length * width / 1000000;
    return {total, parts, breakdown:breakdown.join(' · '), length, width, lfm, area,
      thickness:null,volume:null};
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
      d.openPacks=(item.openPacks||[]).map(g=>({id:uid(),perPack:String(g.perPack),mode:g.mode,amount:String(g.amount)}));
      if (!d.packages.length) d.packages = [{id:uid(),packs:'',perPack:''}];
    } else if(item.type==='stack') {
      d.blocks = item.blocks.map(g => ({id:uid(),perLayer:String(g.perLayer),layers:String(g.layers)}));
      d.rows = item.rows.map(Number);
      d.looseStack = item.loose == null ? '' : String(item.loose);
      d.heightBlocks=(item.heightBlocks||[]).map(h=>({...h,id:uid()}));
      if (!d.blocks.length) d.blocks = [{id:uid(),perLayer:'',layers:''}];
      d.photoId=typeof item.photoId==='string' ? item.photoId : null;
      d.photoMarks=Array.isArray(item.photoMarks) ? item.photoMarks.map(p=>({x:p.x,y:p.y,zoneId:p.zoneId})) : [];
      d.photoZones=Array.isArray(item.photoZones) ? item.photoZones.map(z=>({...z})) : [];
      normalizePhoto(d);
    }
    return d;
  }
  function createEntry(d, id = uid(), createdAt = new Date().toISOString()) {
    const name = String(d.name || '').trim();
    if (!name) throw Error('Bitte eine Artikelbezeichnung eingeben.');
    if (name.length > 100 || String(d.articleNo).length > 60 || String(d.note).length > 160) throw Error('Text ist zu lang.');
    normalizePhoto(d);
    const v = calculate(d, true);
    const item = {
      id, type:d.type, tool:activeTool==='photo'?'photo':d.type, name, articleNo:String(d.articleNo || '').trim(),note:String(d.note || '').trim(),
      length:v.length,width:v.width,total:v.total,parts:v.parts,breakdown:v.breakdown,
      lfm:v.lfm,area:v.area,createdAt,updatedAt:new Date().toISOString(),
      packages:[],openPacks:[],blocks:[],heightBlocks:[],rows:[],loose:null,
      photoId:null,photoMarks:[],photoZones:[]
    };
    if (d.type === 'package') {
      item.packages = d.packages.filter(g => String(g.packs).trim() !== '' || String(g.perPack).trim() !== '')
        .map(g => ({packs:quantity(g.packs,'Pakete'),perPack:quantity(g.perPack,'Stück je Paket')}));
      item.loose = quantity(d.loosePackage,'Lose Stücke',true);
      item.openPacks=(d.openPacks||[]).map(g=>({perPack:positive(g.perPack,'Paketgröße'),mode:g.mode,
        amount:quantity(g.amount,'Rest-/Entnahmemenge')}));
    } else {
      item.blocks = d.blocks.filter(g => String(g.perLayer).trim() !== '' || String(g.layers).trim() !== '')
        .map(g => ({perLayer:quantity(g.perLayer,'Bretter je Lage'),layers:quantity(g.layers,'Anzahl Lagen')}));
      item.rows = d.rows.slice();
      item.loose = quantity(d.looseStack,'Einzelne Bretter',true);
      item.heightBlocks=(d.heightBlocks||[]).map(h=>{
        const c=heightCalculation(h);
        return {height:c.height,thickness:c.thickness,perLayer:c.perLayer,
          withSpacers:c.withSpacers,spacers:c.spacers,spacerThickness:c.spacerThickness};
      });
      item.photoId=typeof d.photoId==='string' ? d.photoId : null;
      item.photoMarks=(d.photoMarks||[]).map(p=>({x:p.x,y:p.y,zoneId:p.zoneId||d.photoZones[0].id}));
      item.photoZones=d.photoZones.map(z=>({...z}));
    }
    return item;
  }
  function createLengthEntry(d,row,options={}) {
    const name=String(d.name||'').trim();
    if(!name || name.length>100)throw Error('Bitte eine gültige Artikelbezeichnung eingeben.');
    const articleNo=String(d.articleNo||'').trim(),note=String(d.note||'').trim();
    if(articleNo.length>60||note.length>160)throw Error('Artikelnummer oder Bemerkung ist zu lang.');
    const length=positive(row.length,'Holzlänge (mm)'),total=quantity(row.count,'Stückzahl');
    const width=measure(d.width,'Breite'),thickness=measure(d.thickness,'Stärke');
    const lfm=total*length/1000;
    const area=width===null?null:lfm*width/1000;
    const volume=area===null||thickness===null?null:area*thickness/1000;
    return {id:options.id||uid(),groupId:options.groupId||uid(),type:'length',tool:'length',name,articleNo,note,
      length,width,thickness,total,parts:1,lfm,area,volume,
      breakdown:fmt(length)+' mm: '+total+' Stück',
      createdAt:options.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
      packages:[],openPacks:[],blocks:[],heightBlocks:[],rows:[],loose:null,photoId:null,photoMarks:[],photoZones:[]};
  }
  function fromLengthGroup(items) {
    const first=items[0],d=emptyDraft('length');
    d.editingGroupId=first.groupId||first.id;
    d.name=first.name;d.articleNo=first.articleNo;d.note=first.note;
    d.width=first.width==null?'':String(first.width);
    d.thickness=first.thickness==null?'':String(first.thickness);
    d.lengthRows=items.map(x=>({id:uid(),length:String(x.length),count:String(x.total)}));
    return d;
  }
  function validImportedItem(item) {
    if(!item||typeof item!=='object')throw Error('Ungültiger Artikel.');
    if(item.type==='length'){
      const rebuilt=createLengthEntry(item,{length:item.length,count:item.total},
        {groupId:typeof item.groupId==='string'&&item.groupId?item.groupId:uid()});
      return rebuilt;
    }
    if(!['package','stack'].includes(item.type))throw Error('Ungültiger Artikeltyp.');
    if ((item.packages?.length || 0) > 1000 || (item.openPacks?.length||0)>1000 ||
        (item.blocks?.length || 0) > 1000 || (item.heightBlocks?.length||0)>1000 ||
        (item.rows?.length || 0) > 10000 || (item.photoZones?.length||0)>50) throw Error('Zu viele Zählgruppen.');
    const d = fromItem(item);
    const rebuilt = createEntry(d);
    rebuilt.tool=item.type==='stack'&&item.tool==='photo'?'photo':item.type;
    return rebuilt;
  }
  function validatePresets(input) {
    if(!Array.isArray(input)||input.length>1000)throw Error('Ungültige Standard-Paketgrößen.');
    const seen=new Set();
    return input.map(p=>{
      const name=String(p?.name||'').trim();
      if(!name||name.length>80)throw Error('Ungültiger Name einer Standard-Paketgröße.');
      const size=positive(p.size,'Standard-Paketgröße');
      if(seen.has(name.toLowerCase()))throw Error('Doppelte Standard-Paketgröße.');
      seen.add(name.toLowerCase());
      return {id:typeof p.id==='string'&&p.id.length<=100?p.id:uid(),name,size};
    });
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(raw && (raw.version!==1 || !Array.isArray(raw.items) || raw.items.length>5000))
        throw Error('Unbekanntes oder zu großes Inventur-Speicherformat.');
      if (raw?.version === 1 && Array.isArray(raw.items) && raw.items.length <= 5000) {
        const items = raw.items.map(item => ({...validImportedItem(item),id:String(item.id),createdAt:item.createdAt || new Date().toISOString()}));
        const drafts=newDrafts();
        if(raw.drafts && typeof raw.drafts==='object' && !Array.isArray(raw.drafts)){
          for(const tool of Object.keys(drafts)){
            const candidate=normalizeDraft(raw.drafts[tool]);
            if(candidate.type===toolType(tool))drafts[tool]=candidate;
          }
        }else if(raw.draft){
          // v1.0–v1.3.2: den einzigen bisherigen Entwurf ohne Verlust übernehmen.
          const old=normalizeDraft(raw.draft);
          drafts[old.type]=old;
        }
        const parkedDrafts={};
        if(raw.parkedDrafts && typeof raw.parkedDrafts==='object'){
          for(const tool of Object.keys(drafts)){
            if(raw.parkedDrafts[tool]?.type===toolType(tool))
              parkedDrafts[tool]=normalizeDraft(raw.parkedDrafts[tool]);
          }
        }
        state = {version:1,items,draft:drafts.package,drafts,parkedDrafts,
          presets:validatePresets(raw.presets||[])};
      }
    } catch (err) {
      state = {version:1,items:[],draft:emptyDraft(),drafts:newDrafts(),parkedDrafts:{},presets:[]};
      // Nicht stillschweigend den alten Datensatz beim Tabwechsel überschreiben.
      storageReadError = true;
      storageMessage('Alte Zählungen geschützt – bitte Sicherung prüfen',true);
      console.error('Inventurdaten konnten nicht eingelesen werden:',err);
    }
    activeTab = 'home';
    activeTool = 'package';
    state.draft = state.drafts.package;
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
  function numberInput(value,placeholder,onInput) {
    const input=document.createElement('input');
    input.type='text';input.inputMode='numeric';input.autocomplete='off';
    input.value=value;input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);
    input.addEventListener('input',()=>onInput(input.value));
    return input;
  }
  function removeButton(title,onClick,disabled=false) {
    const button=document.createElement('button');
    button.type='button';button.textContent='×';button.title=title;button.disabled=disabled;
    button.addEventListener('click',onClick);return button;
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
  function renderOpenPacks() {
    const target=$('open-pack-list');target.replaceChildren();
    if(!state.draft.openPacks.length){target.textContent='Noch keine Restpakete übernommen.';target.classList.add('muted');return;}
    target.classList.remove('muted');
    state.draft.openPacks.forEach((g,i)=>{
      const chip=document.createElement('span');chip.className='chip';
      let text='Restpaket '+(i+1);
      try{text+=': '+openPackCount(g)+' von '+g.perPack+' Stück';}catch(_){text+=': ungültige Eingabe';}
      chip.append(document.createTextNode(text),removeButton('Restpaket entfernen',()=>{
        state.draft.openPacks=state.draft.openPacks.filter(x=>x.id!==g.id);
        persist();renderOpenPacks();renderPreview();
      }));target.append(chip);
    });
  }
  function renderPresets(selected='') {
    const select=$('preset-select');select.replaceChildren();
    const blank=document.createElement('option');blank.value='';blank.textContent='Bitte auswählen';select.append(blank);
    state.presets.forEach(p=>{
      const option=document.createElement('option');option.value=p.id;option.textContent=p.name+' · '+p.size+' Stück';select.append(option);
    });
    select.value=selected;
    $('preset-delete').disabled=!selected;
  }
  function renderHeightBlocks() {
    const target=$('height-block-list');target.replaceChildren();
    state.draft.heightBlocks.forEach((h,i)=>{
      const chip=document.createElement('span');chip.className='chip';
      const value=heightCalculation(h);
      chip.append(document.createTextNode('Schätzung '+(i+1)+': '+fmt(value.count)+' St. ('+value.layers+' Lagen)'),
        removeButton('Höhenschätzung entfernen',()=>{
          state.draft.heightBlocks=state.draft.heightBlocks.filter(x=>x.id!==h.id);
          persist();renderHeightBlocks();renderPreview();
        }));target.append(chip);
    });
  }
  function renderHeightPreview() {
    const el=$('height-preview'),h=state.draft.heightDraft;
    $('height-spacer-fields').hidden=!h.withSpacers;
    el.className='estimate-preview';
    if(![h.height,h.thickness,h.perLayer].some(x=>String(x??'').trim()!=='')){
      el.textContent='Maße eingeben, um die ungefähre Stückzahl zu berechnen.';return;
    }
    try{
      const result=heightCalculation(h);
      el.textContent='Geschätzt: '+fmt(result.count)+' Stück · '+result.layers+' Lagen à '+result.perLayer+
        (result.remainder?' · Resthöhe '+result.remainder+' mm – Maße prüfen':'');
      if(result.remainder)el.classList.add('warning');
    }catch(err){el.textContent=err.message;el.classList.add('error');}
  }
  function renderLengths() {
    const target=$('length-rows');target.replaceChildren();
    state.draft.lengthRows.forEach(r=>{
      const row=document.createElement('div');row.className='group-row';
      row.append(numberInput(r.length,'Länge in mm',value=>{r.length=value;persist();renderPreview();}),
        numberInput(r.count,'Stückzahl',value=>{r.count=value;persist();renderPreview();}),
        removeButton('Länge entfernen',()=>{
          state.draft.lengthRows=state.draft.lengthRows.filter(x=>x.id!==r.id);
          persist();renderLengths();renderPreview();
        },state.draft.lengthRows.length<=1));target.append(row);
    });
  }
  function renderLengthSummary(v) {
    const el=$('length-summary');
    if(!v||!v.parts){el.textContent='Noch keine Längen eingetragen.';return;}
    const parts=[fmt(v.total)+' Stück',fmt(v.lfm,2)+' lfm'];
    if(v.area!==null)parts.push(fmt(v.area,3)+' m²');
    if(v.volume!==null)parts.push(fmt(v.volume,4)+' m³');
    el.textContent=parts.join(' · ');
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
    normalizePhoto(d);
    $('article-name').value=d.name || '';
    $('article-no').value=d.articleNo || '';
    $('article-note').value=d.note || '';
    $('uniform-length').value=d.length || '';
    $('uniform-width').value=d.width || '';
    $('loose-package').value=d.loosePackage || '';
    $('loose-stack').value=d.looseStack || '';
    $('row-input').value=d.rowInput || '';
    $('length-width').value=d.width || '';
    $('length-thickness').value=d.thickness || '';
    $('open-pack-size').value=d.openPackDraft.perPack || '';
    $('open-pack-mode').value=d.openPackDraft.mode || 'remaining';
    $('open-pack-amount').value=d.openPackDraft.amount || '';
    $('open-pack-amount-label').textContent=d.openPackDraft.mode==='removed'?'Entnommene Stücke':'Noch vorhanden (Stück)';
    $('height-total').value=d.heightDraft.height || '';
    $('height-thickness').value=d.heightDraft.thickness || '';
    $('height-per-layer').value=d.heightDraft.perLayer || '';
    $('height-with-spacers').checked=!!d.heightDraft.withSpacers;
    $('height-spacers').value=d.heightDraft.spacers || '';
    $('height-spacer-thickness').value=d.heightDraft.spacerThickness || '';
    $('editor-heading').textContent=(d.editingId||d.editingGroupId) ? 'Artikel bearbeiten' : 'Zählung speichern';
    $('confirm-save-item').textContent=(d.editingId||d.editingGroupId) ? '✓ Änderungen speichern' : '✓ Zur Ergebnisliste hinzufügen';
    renderGroups('package');renderGroups('stack');renderRows();renderPreview();
    renderOpenPacks();renderPresets();renderHeightBlocks();renderHeightPreview();renderLengths();
    if(photoReady && ['stack','photo'].includes(activeTool))Promise.resolve(window.HolzOptiXPhoto.renderCurrent()).catch(err=>{
      $('photo-info').textContent='Foto konnte nicht angezeigt werden: '+err.message;
    });
  }
  function renderPreview() {
    const d=state.draft;
    $('validation-message').hidden=true;
    $('count-error').hidden=true;
    try{
      const value=calculate(d);
      $('preview-total').textContent=fmt(value.total);
      $('total-formula').textContent=value.parts ? value.parts+' Teilzählung'+(value.parts===1?'':'en') : 'Noch keine Mengen eingetragen';
      const output=[];
      if (value.lfm!==null) output.push(fmt(value.lfm,2)+' lfm');
      if (value.area!==null) output.push(fmt(value.area,3)+' m²');
      if (value.volume!==null) output.push(fmt(value.volume,4)+' m³');
      $('conversion-result').textContent=output.join(' · ') || 'Für die Umrechnung Maße eingeben.';
      renderLengthSummary(d.type==='length'?value:null);
    }catch(err){
      $('preview-total').textContent='—';
      $('total-formula').textContent='Eingaben prüfen';
      $('conversion-result').textContent=err.message;
      $('count-error').textContent=err.message;
      $('count-error').hidden=false;
      if(d.type==='length')$('length-summary').textContent=err.message;
    }
  }
  function setPackageMode(mode) {
    packageMode=mode;
    document.querySelectorAll('[data-package-mode]').forEach(button=>
      button.classList.toggle('is-active',button.dataset.packageMode===mode));
    document.querySelectorAll('[data-package-section]').forEach(section=>
      section.hidden=section.dataset.packageSection!==mode);
  }
  function setStackMode(mode) {
    stackMode=mode;
    document.querySelectorAll('[data-stack-mode]').forEach(button=>
      button.classList.toggle('is-active',button.dataset.stackMode===mode));
    document.querySelectorAll('[data-stack-section]').forEach(section=>
      section.hidden=section.dataset.stackSection!==mode);
    if(mode==='photo'&&photoReady)requestAnimationFrame(()=>window.HolzOptiXPhoto.draw());
  }
  function renderHome() {
    $('home-result-count').textContent=String(state.items.length);
    document.querySelectorAll('[data-draft-badge]').forEach(badge=>{
      badge.hidden=!hasDraftContent(state.drafts[badge.dataset.draftBadge]);
    });
  }
  function switchTab(tab) {
    activeTab=tab;
    const isTool=['package','stack','length','photo'].includes(tab);
    if(isTool){
      state.drafts[activeTool]=state.draft;
      activeTool=tab;
      state.draft=state.drafts[tab];
      state.draft.type=toolType(tab);
      if(tab==='photo')stackMode='photo';
      if(tab==='stack'&&stackMode==='photo')stackMode='blocks';
      renderEditor();
      persist();
    }
    for(const button of document.querySelectorAll('.tab')){
      const chosen=button.dataset.tab===tab;
      button.classList.toggle('is-active',chosen);
      if(chosen)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    $('home-screen').hidden=tab!=='home';
    $('editor').hidden=!isTool;
    $('panel-package').hidden=tab!=='package';
    $('panel-stack').hidden=!['stack','photo'].includes(tab);
    $('panel-length').hidden=tab!=='length';
    $('conversion').hidden=tab==='length';
    $('panel-results').hidden=tab!=='results';
    if(isTool){
      $('tool-heading').textContent={package:'Pakete zählen',stack:'Stapel zählen',length:'Holzlängen zählen',photo:'Fotozählung'}[tab];
      $('stack-methods').hidden=tab==='photo';
      $('attach-photo-stack').hidden=tab!=='photo';
      setPackageMode(packageMode);
      setStackMode(stackMode);
      renderPreview();
    }
    if(tab==='results')renderResults();
    renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function openSaveSheet() {
    try{
      const value=calculate(state.draft,true);
      if(!value.parts)throw Error('Bitte zuerst eine Menge erfassen.');
      $('count-error').hidden=true;
      $('save-sheet-total').textContent=fmt(value.total)+' Stück';
      $('save-sheet').hidden=false;
      $('validation-message').hidden=true;
      $('article-name').focus();
    }catch(err){
      $('count-error').textContent=err.message;
      $('count-error').hidden=false;
      $('count-error').scrollIntoView?.({block:'nearest'});
    }
  }
  function closeSaveSheet(){$('save-sheet').hidden=true;}
  function hasDraftContent(d) {
    return Boolean(d.editingId||d.editingGroupId || String(d.name||'').trim() || String(d.articleNo||'').trim() ||
      String(d.note||'').trim() || String(d.length||'').trim() || String(d.width||'').trim() ||
      String(d.thickness||'').trim() || String(d.rowInput||'').trim() ||
      String(d.loosePackage||'').trim() || String(d.looseStack||'').trim() ||
      (d.openPacks?.length||0)>0 || String(d.openPackDraft?.amount||'').trim() ||
      (d.heightBlocks?.length||0)>0 || ['height','thickness','perLayer'].some(k=>String(d.heightDraft?.[k]||'').trim()) ||
      Boolean(d.photoId) || (d.photoMarks?.length||0)>0 ||
      (d.lengthRows||[]).some(r=>r.length||r.count) ||
      d.rows.length || d.packages.some(g=>g.packs||g.perPack) || d.blocks.some(g=>g.perLayer||g.layers));
  }
  function cleanupPhoto(id) {
    if(id && photoReady && !Object.values(state.drafts).some(d=>d.photoId===id) &&
       !Object.values(state.parkedDrafts).some(d=>d.photoId===id) &&
       !state.items.some(item=>item.photoId===id))
      window.HolzOptiXPhoto.removeStored(id);
  }
  function newItem(type=activeTool, confirmDiscard=true) {
    if(type!==activeTool)switchTab(type);
    if(confirmDiscard && hasDraftContent(state.draft) && !confirm('Aktuelle, noch nicht übernommene Eingaben verwerfen und einen neuen Artikel beginnen?'))return;
    const oldPhoto=state.draft.photoId;
    state.draft=state.parkedDrafts[activeTool] || emptyDraft(toolType(activeTool));
    state.drafts[activeTool]=state.draft;
    delete state.parkedDrafts[activeTool];
    closeSaveSheet();persist();renderEditor();renderHome();cleanupPhoto(oldPhoto);
    const field=activeTool==='package'?$('package-groups').querySelector?.('input'):
      activeTool==='length'?$('length-rows').querySelector?.('input'):$('row-input');
    field?.focus();
  }
  function finishSavedDraft() {
    const parked=state.parkedDrafts[activeTool];
    state.draft=parked || emptyDraft(toolType(activeTool));
    state.drafts[activeTool]=state.draft;
    delete state.parkedDrafts[activeTool];
    closeSaveSheet();persist();renderResults();switchTab('results');
  }
  function saveItem() {
    try {
      const d=state.draft;
      if(d.type==='length'){
        const rows=lengthRows(d);
        if(!rows.length)throw Error('Bitte mindestens eine Länge mit Stückzahl eintragen.');
        if(rows.length>1000)throw Error('Zu viele Holzlängen.');
        const groupId=d.editingGroupId||uid();
        const old=state.items.filter(x=>x.type==='length'&&x.groupId===groupId);
        if(state.items.length-old.length+rows.length>5000)throw Error('Maximal 5.000 Ergebnispositionen.');
        if(d.editingGroupId&&!old.length)throw Error('Die zu bearbeitende Längengruppe ist nicht mehr vorhanden.');
        const entries=rows.map(r=>{
          const previous=old.find(x=>x.length===r.length);
          return createLengthEntry(d,r,{groupId,id:previous?.id,createdAt:previous?.createdAt});
        });
        if(entries.some(x=>x.total===0)&&!confirm('Mindestens eine Länge hat 0 Stück. Trotzdem speichern?'))return;
        if(entries.some(entry=>state.items.some(x=>x.groupId!==groupId && x.name.toLowerCase()===entry.name.toLowerCase() &&
           x.articleNo===entry.articleNo && x.length===entry.length))) {
          if(!confirm('Mindestens eine dieser Holzlängen existiert bereits. Trotzdem zusätzliche Positionen speichern?'))return;
        }
        const prior=state.items;
        if(old.length){
          const index=state.items.findIndex(x=>x.type==='length'&&x.groupId===groupId);
          state.items=state.items.filter(x=>!(x.type==='length'&&x.groupId===groupId));
          state.items.splice(index,0,...entries);
        }else state.items=[...state.items,...entries];
        if(!persist()){state.items=prior;throw Error('Speicherung fehlgeschlagen. Bitte freien Speicher prüfen.');}
        finishSavedDraft();
        return true;
      }
      const old=state.items.find(x=>x.id===d.editingId);
      const entry=createEntry(d,old?.id || uid(),old?.createdAt);
      entry.tool=activeTool;
      if(entry.total===0 && !confirm('Der Artikel hat 0 Stück. Wirklich so in die Ergebnisliste übernehmen?'))return;
      if(d.type==='stack' && entry.photoMarks.length &&
         (entry.blocks.length||entry.heightBlocks.length||entry.rows.length||entry.loose!==null) &&
         !confirm('Die Fotozählung wird mit anderen Teilzählungen addiert. Sind es sicher unterschiedliche Bretter?'))return;
      if(!old&&state.items.length>=5000)throw Error('Maximal 5.000 Ergebnispositionen.');
      if(!old && state.items.some(x=>x.name.toLowerCase()===entry.name.toLowerCase() && x.articleNo===entry.articleNo)) {
        if(!confirm('Dieser Artikel ist bereits in der Ergebnisliste. Trotzdem eine weitere Zählung speichern?'))return;
      }
      const prior=state.items;
      if(old)state.items=state.items.map(x=>x.id===old.id?entry:x);else state.items=[...state.items,entry];
      if(!persist()){state.items=prior;throw Error('Speicherung fehlgeschlagen. Bitte freien Speicher prüfen.');}
      finishSavedDraft();if(old)cleanupPhoto(old.photoId);
      return true;
    }catch(err){
      $('validation-message').textContent=err.message;
      $('validation-message').hidden=false;
      $('validation-message').scrollIntoView?.({block:'center'});
    }
  }
  function renderResults() {
    $('result-count').textContent=state.items.length;
    $('summary-articles').textContent=state.items.length;
    $('summary-counts').textContent=fmt(state.items.reduce((n,x)=>n+x.parts,0));
    const query=String($('results-search').value||'').toLocaleLowerCase('de-DE').trim();
    const visible=state.items.map((item,index)=>({item,index})).filter(({item})=>
      !query || [item.name,item.articleNo,item.note,String(item.length??'')].some(value=>
        String(value||'').toLocaleLowerCase('de-DE').includes(query)));
    $('results-empty').hidden=visible.length>0;
    $('results-empty').textContent=state.items.length?
      'Keine passenden Artikel gefunden.':'Noch keine Positionen erfasst. Starte über die großen Werkzeug-Kacheln.';
    const container=$('results-list');container.replaceChildren();
    visible.forEach(({item,index})=>{
      const card=document.createElement('article');card.className='result-card';
      const info=document.createElement('div');
      const title=document.createElement('h3');title.textContent=(index+1)+'. '+item.name+
        (item.type==='length'?' – '+fmt(item.length)+' mm':'');info.append(title);
      const details=document.createElement('p');
      details.textContent=[item.articleNo?'Art.-Nr. '+item.articleNo:null,
        item.type==='package'?'Paketrechner':item.type==='length'?'Längenzähler':item.tool==='photo'?'Fotozähler':'Stapelzähler',
        item.note,item.heightBlocks?.length?'Höhenschätzung enthalten':null].filter(Boolean).join(' · ');
      info.append(details);
      const breakdown=document.createElement('p');breakdown.className='breakdown';breakdown.textContent=item.breakdown || 'Keine Gruppen';
      info.append(breakdown);
      if(item.lfm!==null){
        const conv=document.createElement('p');conv.textContent=fmt(item.lfm,2)+' lfm'+
          (item.area!==null?' · '+fmt(item.area,3)+' m²':'')+
          (item.volume!==null&&item.volume!==undefined?' · '+fmt(item.volume,4)+' m³':'');
        info.append(conv);
      }
      const qty=document.createElement('div');qty.className='result-qty';qty.append(document.createTextNode(fmt(item.total)+' '));
      const small=document.createElement('small');small.textContent='Stück';qty.append(small);
      const controls=document.createElement('div');controls.className='result-controls';
      const edit=document.createElement('button');edit.className='btn subtle';edit.type='button';edit.textContent='✎ Bearbeiten';
      edit.addEventListener('click',()=>{
        const tool=item.type==='stack'&&item.tool==='photo'?'photo':item.type;
        const existing=state.drafts[tool];
        if((existing.editingId||existing.editingGroupId)&&
            !confirm('Du bearbeitest hier bereits einen Artikel. Diese Bearbeitung ersetzen?'))return;
        if(hasDraftContent(existing) && !state.parkedDrafts[tool])state.parkedDrafts[tool]=existing;
        const draft=item.type==='length'?fromLengthGroup(state.items.filter(x=>x.type==='length'&&x.groupId===item.groupId)):
          fromItem(item);
        state.drafts[tool]=draft;
        if(activeTool===tool)state.draft=draft;
        switchTab(tool);
      });
      const remove=document.createElement('button');remove.className='btn danger';remove.type='button';remove.textContent='× Entfernen';
      remove.addEventListener('click',()=>{
        if(!confirm('„'+item.name+'“ wirklich aus der Ergebnisliste entfernen?'))return;
        state.items=state.items.filter(x=>x.id!==item.id);persist();renderResults();cleanupPhoto(item.photoId);
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
    const rows=[['Nr.','Artikelnummer','Artikel','Werkzeug','Stück','Länge mm','Breite mm','Laufmeter','Quadratmeter','Berechnung','Bemerkung','Stärke mm','Kubikmeter','Höhenschätzung']];
    state.items.forEach((x,i)=>rows.push([
      i+1,x.articleNo,x.name,x.type==='package'?'Paket':x.type==='length'?'Längen':x.tool==='photo'?'Foto':'Stapel',x.total,
      x.length??'',x.width??'',x.lfm===null?'':String(Math.round(x.lfm*1000000)/1000000).replace('.',','),x.area===null?'':String(Math.round(x.area*1000000)/1000000).replace('.',','),
      x.breakdown,x.note,x.thickness??'',x.volume==null?'':String(Math.round(x.volume*1000000)/1000000).replace('.',','),
      x.heightBlocks?.length?'Ja – geschätzt':'Nein'
    ]));
    download('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'HolzOptiX_Inventur_Ergebnisse.csv','text/csv;charset=utf-8');
  }
  async function exportJson() {
    try{
      const images=await window.HolzOptiXPhoto.exportImages(state.items.map(x=>x.photoId));
      const missing=state.items.filter(x=>x.photoId && !images[x.photoId]).length;
      if(missing && !confirm(missing+' Foto(s) sind auf diesem Gerät nicht verfügbar. Sicherung trotzdem mit den gespeicherten Zählwerten erstellen?'))return;
      download(JSON.stringify({format:'holzoptix-inventur/v1',exportedAt:new Date().toISOString(),items:state.items,
        presets:state.presets,photos:images},null,2),
        'HolzOptiX_Inventur_Sicherung.json','application/json');
    }catch(err){alert('Datensicherung nicht möglich: '+err.message);}
  }
  async function importJson(file) {
    if(!file)return;
    if(file.size>100*1024*1024){alert('Sicherung zu groß (maximal 100 MB).');return;}
    try{
      const payload=JSON.parse(await file.text());
      if(payload?.format!=='holzoptix-inventur/v1'||!Array.isArray(payload.items)||payload.items.length>5000)
        throw Error('Keine gültige Inventur-Helfer-Sicherung.');
      const imports=payload.items.map(validImportedItem);
      const presets=validatePresets(payload.presets||[]);
      if(!imports.length&&!presets.length){alert('Diese Sicherung enthält keine Artikel oder Standard-Paketgrößen.');return;}
      if(!confirm(imports.length+' Ergebnispositionen und '+presets.length+' Standard-Paketgrößen übernehmen? Bestehende Daten bleiben erhalten.'))return;
      if(state.items.length+imports.length>5000)throw Error('Die Liste würde zu groß werden.');
      const photos=await window.HolzOptiXPhoto.importImages(payload.photos);
      const groupIds=new Map();
      for(const item of imports){
        item.photoId=photos.get(item.photoId)||null;
        if(item.type==='length'){
          if(!groupIds.has(item.groupId))groupIds.set(item.groupId,uid());
          item.groupId=groupIds.get(item.groupId);
        }
      }
      const known=new Set(state.presets.map(p=>p.name.toLowerCase()));
      const incoming=presets.filter(p=>!known.has(p.name.toLowerCase())).map(p=>({...p,id:uid()}));
      if(state.presets.length+incoming.length>1000)throw Error('Zu viele Standard-Paketgrößen.');
      const priorItems=state.items,priorPresets=state.presets;
      state.items=[...state.items,...imports];
      state.presets=[...state.presets,...incoming];
      if(!persist()){
        state.items=priorItems;state.presets=priorPresets;
        for(const id of photos.values())window.HolzOptiXPhoto.removeStored(id);
        throw Error('Zu wenig Speicher für den Import.');
      }
      renderResults();renderPresets();alert(imports.length+' Positionen und '+incoming.length+' neue Standardgrößen übernommen.');
    }catch(err){alert('Import nicht möglich: '+err.message);}
  }
  function attachPhotoToStack() {
    const source=state.drafts.photo,target=state.drafts.stack;
    if(!source.photoMarks.length)return alert('Bitte zuerst Bretter auf dem Foto markieren.');
    if(target.photoId || target.photoMarks.length)
      return alert('Dein Stapelentwurf enthält bereits eine Fotozählung. Bitte diese erst speichern oder entfernen.');
    if(!confirm(source.photoMarks.length+' Fotomarkierungen zur bestehenden Stapelzählung übernehmen? Die Fotos werden nicht doppelt gezählt.'))return;
    target.photoId=source.photoId;
    target.photoMarks=source.photoMarks.map(mark=>({...mark}));
    target.photoZones=source.photoZones.map(zone=>({...zone}));
    target.activePhotoZoneId=source.activePhotoZoneId;
    state.drafts.photo=emptyDraft('stack');
    state.draft=state.drafts.photo;
    persist();
    switchTab('stack');
    setStackMode('photo');
  }
  function wire() {
    // Ein fehlendes oder beschädigtes Foto-Modul darf die übrigen Zähler nicht lahmlegen.
    try {
      if(window.HolzOptiXPhoto?.version !== '1.4')
        throw Error('Die Fotodatei passt nicht zur Version 1.4.');
      const initialized=window.HolzOptiXPhoto.init({getDraft:()=>state.draft,persist,onCountChange:renderPreview,cleanupPhoto});
      if(initialized===false)throw Error('Dieses Gerät unterstützt den Fotomodus nicht.');
      photoReady = true;
    } catch(err) {
      photoReady = false;
      $('photo-info').textContent='Fotozählung momentan nicht verfügbar: '+err.message;
      console.error('Foto-Modul konnte nicht gestartet werden:',err);
    }
    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    document.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tool)));
    document.querySelectorAll('[data-package-mode]').forEach(btn=>btn.addEventListener('click',()=>setPackageMode(btn.dataset.packageMode)));
    document.querySelectorAll('[data-stack-mode]').forEach(btn=>btn.addEventListener('click',()=>setStackMode(btn.dataset.stackMode)));
    $('home-results').addEventListener('click',()=>switchTab('results'));
    $('back-home').addEventListener('click',()=>switchTab('home'));
    $('results-home').addEventListener('click',()=>switchTab('home'));
    $('results-search').addEventListener('input',renderResults);
    $('attach-photo-stack').addEventListener('click',attachPhotoToStack);
    $('save-cancel').addEventListener('click',closeSaveSheet);
    $('confirm-save-item').addEventListener('click',saveItem);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!$('save-sheet').hidden)closeSaveSheet();
    });
    for(const [id,key] of [['article-name','name'],['article-no','articleNo'],['article-note','note'],
      ['uniform-length','length'],['uniform-width','width'],['length-width','width'],['length-thickness','thickness'],
      ['loose-package','loosePackage'],['loose-stack','looseStack'],['row-input','rowInput']]){
      $(id).addEventListener('input',e=>{state.draft[key]=e.target.value;persist();renderPreview();});
    }
    $('add-package').addEventListener('click',()=>{state.draft.packages.push({id:uid(),packs:'',perPack:''});persist();renderGroups('package');});
    $('add-block').addEventListener('click',()=>{state.draft.blocks.push({id:uid(),perLayer:'',layers:''});persist();renderGroups('stack');});
    for(const [id,key] of [['open-pack-size','perPack'],['open-pack-amount','amount']]){
      $(id).addEventListener('input',e=>{state.draft.openPackDraft[key]=e.target.value;persist();});
    }
    $('open-pack-mode').addEventListener('change',e=>{
      state.draft.openPackDraft.mode=e.target.value;
      $('open-pack-amount-label').textContent=e.target.value==='removed'?'Entnommene Stücke':'Noch vorhanden (Stück)';
      persist();
    });
    $('add-open-pack').addEventListener('click',()=>{
      try{
        const d=state.draft.openPackDraft;
        const count=openPackCount(d);
        if(state.draft.openPacks.length>=1000)throw Error('Maximal 1.000 Restpakete.');
        state.draft.openPacks.push({id:uid(),perPack:positive(d.perPack,'Paketgröße'),mode:d.mode,
          amount:quantity(d.amount,'Rest-/Entnahmemenge')});
        state.draft.openPackDraft={perPack:d.perPack,mode:d.mode,amount:''};
        $('open-pack-amount').value='';persist();renderOpenPacks();renderPreview();
        $('open-pack-amount').focus();
      }catch(err){alert(err.message);}
    });
    $('preset-select').addEventListener('change',e=>{
      const preset=state.presets.find(p=>p.id===e.target.value);
      $('preset-delete').disabled=!preset;
      if(!preset)return;
      $('preset-name').value=preset.name;$('preset-size').value=String(preset.size);
      state.draft.packages[0].perPack=String(preset.size);
      state.draft.openPackDraft.perPack=String(preset.size);
      $('open-pack-size').value=String(preset.size);
      persist();renderGroups('package');renderPreview();
    });
    $('preset-save').addEventListener('click',()=>{
      try{
        const name=$('preset-name').value.trim(),size=positive($('preset-size').value,'Standard-Paketgröße');
        if(!name||name.length>80)throw Error('Bitte einen Namen mit maximal 80 Zeichen eingeben.');
        const selected=state.presets.find(p=>p.id===$('preset-select').value);
        const duplicate=state.presets.find(p=>p.name.toLowerCase()===name.toLowerCase()&&p!==selected);
        if(duplicate)throw Error('Dieser Name ist bereits vergeben. Bitte einen anderen wählen.');
        let id;
        if(selected){selected.name=name;selected.size=size;id=selected.id;}
        else {if(state.presets.length>=1000)throw Error('Maximal 1.000 Standard-Paketgrößen.');
          id=uid();state.presets.push({id,name,size});}
        persist();renderPresets(id);
      }catch(err){alert(err.message);}
    });
    $('preset-delete').addEventListener('click',()=>{
      const id=$('preset-select').value;
      const preset=state.presets.find(p=>p.id===id);
      if(!preset||!confirm('Standardgröße „'+preset.name+'“ löschen? Bereits gezählte Artikel bleiben erhalten.'))return;
      state.presets=state.presets.filter(p=>p.id!==id);persist();renderPresets();
      $('preset-name').value='';$('preset-size').value='';
    });
    for(const [id,key] of [['height-total','height'],['height-thickness','thickness'],['height-per-layer','perLayer'],
      ['height-spacers','spacers'],['height-spacer-thickness','spacerThickness']]){
      $(id).addEventListener('input',e=>{
        state.draft.heightDraft[key]=e.target.value;persist();renderHeightPreview();
      });
    }
    $('height-with-spacers').addEventListener('change',e=>{
      state.draft.heightDraft.withSpacers=e.target.checked;
      persist();renderHeightPreview();
    });
    $('add-height-block').addEventListener('click',()=>{
      try{
        const result=heightCalculation(state.draft.heightDraft);
        if(result.remainder&&!confirm('Die Maße ergeben '+result.remainder+' mm Resthöhe. Schätzung trotzdem übernehmen?'))return;
        if(state.draft.heightBlocks.length>=1000)throw Error('Maximal 1.000 Höhenblöcke.');
        state.draft.heightBlocks.push({id:uid(),height:result.height,thickness:result.thickness,perLayer:result.perLayer,
          withSpacers:result.withSpacers,spacers:result.spacers,spacerThickness:result.spacerThickness});
        state.draft.heightDraft={height:'',thickness:'',perLayer:'',withSpacers:false,spacers:'',spacerThickness:''};
        for(const id of ['height-total','height-thickness','height-per-layer','height-spacers','height-spacer-thickness'])$(id).value='';
        $('height-with-spacers').checked=false;
        persist();renderHeightBlocks();renderHeightPreview();renderPreview();
      }catch(err){alert(err.message);}
    });
    $('add-length').addEventListener('click',()=>{
      if(state.draft.lengthRows.length>=1000)return alert('Maximal 1.000 Holzlängen.');
      state.draft.lengthRows.push({id:uid(),length:'',count:''});persist();renderLengths();renderPreview();
    });
    const addRow=()=>{
      try{
        const n=quantity(state.draft.rowInput,'Einzelreihe');
        state.draft.rows.push(n);state.draft.rowInput='';$('row-input').value='';
        persist();renderRows();renderPreview();$('row-input').focus();
      }catch(err){alert(err.message);}
    };
    $('add-row').addEventListener('click',addRow);
    $('row-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addRow();}});
    $('save-item').addEventListener('click',openSaveSheet);
    $('go-results').addEventListener('click',()=>switchTab('results'));
    $('new-item').addEventListener('click',()=>newItem());
    $('result-new').addEventListener('click',()=>switchTab('home'));
    $('export-csv').addEventListener('click',exportCsv);
    $('export-json').addEventListener('click',exportJson);
    $('print-results').addEventListener('click',()=>{if(!state.items.length)return alert('Noch keine Ergebnisse vorhanden.');window.print();});
    $('import-json').addEventListener('click',()=>$('import-file').click());
    $('import-file').addEventListener('change',async e=>{await importJson(e.target.files[0]);e.target.value='';});
    $('clear-results').addEventListener('click',()=>{
      if(!state.items.length)return;
      if(!confirm('Alle '+state.items.length+' Artikel aus der Ergebnisliste entfernen?'))return;
      if(!confirm('Wirklich ALLE Ergebnisse löschen? Eine Rückgängig-Funktion gibt es dafür nicht.'))return;
      const oldPhotos=state.items.map(x=>x.photoId);
      state.items=[];persist();renderResults();oldPhotos.forEach(cleanupPhoto);
    });
  }
  load();wire();renderEditor();renderResults();switchTab('home');
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
  }
})();
