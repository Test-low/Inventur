'use strict';
/* HolzOptiX Inventur 1.3.2: lokale Foto-Zählhilfe mit Farbgruppen, ohne Upload. */
window.HolzOptiXPhoto = (() => {
  const DB_NAME = 'holzoptix-inventur-fotos-v1';
  const STORE = 'photos';
  const $ = id => document.getElementById(id);
  const uid = () => (globalThis.crypto?.randomUUID?.() || String(Date.now())+'-'+Math.random().toString(36).slice(2));
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  let dbPromise;
  let getDraft, saveDraft, onChange;
  let image = null, imageUrl = null, imageId = null, loadToken = 0;
  let zoom = 1, panX = 0, panY = 0, mode = 'add';
  let history = [];
  let canvas, ctx;
  const pointers = new Map();
  let pinch = null;
  const COLORS=['#e75b35','#298ed1','#229c58','#ca8b19','#9959ca','#cb4b89','#167d83','#6e6fce'];
  const defaultZone=()=>({id:uid(),name:'Bereich 1',color:COLORS[0],locked:false});

  function selectedZone() {
    const d=getDraft();
    return (d.photoZones||[]).find(z=>z.id===d.activePhotoZoneId) || d.photoZones?.[0];
  }
  function renderZones() {
    if(!getDraft)return;
    const d=getDraft(),container=$('photo-zones');container.replaceChildren();
    (d.photoZones||[]).forEach(z=>{
      const count=(d.photoMarks||[]).filter(p=>p.zoneId===z.id).length;
      const row=document.createElement('div');row.className='photo-zone';
      if(z.id===d.activePhotoZoneId)row.classList.add('active');
      if(z.locked)row.classList.add('locked');
      const color=document.createElement('input');color.type='color';color.value=z.color;
      color.setAttribute('aria-label','Markierungsfarbe für '+z.name);
      color.addEventListener('input',()=>{z.color=color.value;saveDraft();draw();});
      const name=document.createElement('input');name.type='text';name.maxLength=50;name.value=z.name;
      name.setAttribute('aria-label','Name des Zählbereichs');
      name.addEventListener('change',()=>{z.name=name.value.trim().slice(0,50)||'Zählbereich';saveDraft();renderZones();});
      const number=document.createElement('span');number.className='zone-count';number.textContent=count+' Stück';
      const select=document.createElement('button');select.type='button';select.className='btn subtle zone-select';
      select.textContent=z.id===d.activePhotoZoneId?'✓ Aktiv':'Auswählen';
      select.addEventListener('click',()=>{d.activePhotoZoneId=z.id;saveDraft();renderZones();draw();});
      const actions=document.createElement('div');actions.className='zone-actions';
      const lock=document.createElement('button');lock.type='button';lock.className='btn subtle';
      lock.textContent=z.locked?'↪ Freigeben':'🔒 Abschließen';
      lock.addEventListener('click',()=>{z.locked=!z.locked;saveDraft();renderZones();updateCount();draw();});
      const remove=document.createElement('button');remove.type='button';remove.className='btn danger';
      remove.textContent='×';remove.title='Zählbereich mit Markierungen entfernen';
      remove.disabled=d.photoZones.length<=1;
      remove.addEventListener('click',()=>{
        if(count&&!confirm('Bereich „'+z.name+'“ und seine '+count+' Markierungen wirklich löschen?'))return;
        d.photoZones=d.photoZones.filter(x=>x.id!==z.id);
        d.photoMarks=d.photoMarks.filter(p=>p.zoneId!==z.id);
        if(d.activePhotoZoneId===z.id)d.activePhotoZoneId=d.photoZones[0].id;
        history=[];saveDraft();renderZones();updateCount();draw();
      });
      actions.append(select,lock,remove);row.append(color,name,number,actions);container.append(row);
    });
  }

  function openDb() {
    if(!dbPromise) {
      dbPromise = new Promise((resolve,reject) => {
        if(!('indexedDB' in window)) return reject(Error('Dieser Browser unterstützt keine lokale Fotospeicherung.'));
        const request = indexedDB.open(DB_NAME,1);
        request.onupgradeneeded = () => {
          if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || Error('Fotospeicher nicht verfügbar.'));
        request.onblocked = () => reject(Error('Fotospeicher durch ein anderes Fenster blockiert.'));
      });
    }
    return dbPromise;
  }
  async function putBlob(id,blob) {
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(blob,id);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error || Error('Foto konnte nicht gespeichert werden.'));
      tx.onabort=()=>reject(tx.error || Error('Foto-Speicherung abgebrochen.'));
    });
  }
  async function getBlob(id) {
    if(!id)return null;
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      req.onsuccess=()=>resolve(req.result || null);
      req.onerror=()=>reject(req.error || Error('Foto konnte nicht geöffnet werden.'));
    });
  }
  async function removeStored(id) {
    if(!id)return;
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error);
      });
    }catch(_){ /* Verwaiste Bilder blockieren keine Zählung. */ }
  }
  function decodeImage(blob) {
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(blob);
      const img=new Image();
      img.onload=()=>resolve({img,url});
      img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Das Foto konnte nicht geöffnet werden.'));};
      img.src=url;
    });
  }
  async function compressImage(file) {
    if(!file.type.startsWith('image/')) throw Error('Bitte eine Bilddatei auswählen.');
    if(file.size > 35*1024*1024) throw Error('Das Foto ist zu groß (maximal 35 MB).');
    const source=await decodeImage(file);
    try{
      const factor=Math.min(1,2600/Math.max(source.img.naturalWidth,source.img.naturalHeight));
      const target=document.createElement('canvas');
      target.width=Math.max(1,Math.round(source.img.naturalWidth*factor));
      target.height=Math.max(1,Math.round(source.img.naturalHeight*factor));
      const c=target.getContext('2d');
      if(!c)throw Error('Bildbearbeitung ist auf diesem Gerät nicht möglich.');
      c.drawImage(source.img,0,0,target.width,target.height);
      return await new Promise((resolve,reject)=>{
        target.toBlob(blob=>blob?resolve(blob):reject(Error('Foto konnte nicht vorbereitet werden.')),'image/jpeg',0.82);
      });
    }finally{URL.revokeObjectURL(source.url);}
  }
  function updateCount() {
    const d=getDraft();
    $('photo-mark-count').textContent=String(d.photoMarks?.length || 0);
    $('photo-undo').disabled=history.length===0;
    $('photo-clear').disabled=!d.photoId && !(d.photoMarks?.length);
    $('photo-download').disabled=!image;
    renderZones();
    onChange();
  }
  function frame() {
    if(!image || !canvas)return null;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<=0 || h<=0)return null;
    const fit=Math.min(w/image.naturalWidth,h/image.naturalHeight);
    const drawW=image.naturalWidth*fit*zoom;
    const drawH=image.naturalHeight*fit*zoom;
    return {w,h,drawW,drawH,x:(w-drawW)/2+panX,y:(h-drawH)/2+panY};
  }
  function clampPan() {
    const f=frame();
    if(!f)return;
    const maxX=Math.max(0,(f.drawW-f.w)/2);
    const maxY=Math.max(0,(f.drawH-f.h)/2);
    panX=clamp(panX,-maxX,maxX);
    panY=clamp(panY,-maxY,maxY);
  }
  function draw() {
    if(!canvas || !image)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(width<=0||height<=0)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const pxW=Math.round(width*dpr),pxH=Math.round(height*dpr);
    if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#e8eee8';ctx.fillRect(0,0,width,height);
    const f=frame();if(!f)return;
    ctx.drawImage(image,f.x,f.y,f.drawW,f.drawH);
    const zones=new Map((getDraft().photoZones||[]).map(z=>[z.id,z]));
    const indexes=new Map();
    (getDraft().photoMarks||[]).forEach(p=>{
      const zone=zones.get(p.zoneId),number=(indexes.get(p.zoneId)||0)+1;
      indexes.set(p.zoneId,number);
      const x=f.x+p.x*f.drawW,y=f.y+p.y*f.drawH;
      if(x < -18 || x > width+18 || y < -18 || y > height+18)return;
      ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fillStyle=zone?.color||COLORS[0];ctx.fill();
      ctx.lineWidth=2.5;ctx.strokeStyle='#ffffff';ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='bold '+(number<100?'10':number<1000?'8':'7')+'px Arial';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(number),x,y);
    });
  }
  function releaseImage() {
    if(imageUrl)URL.revokeObjectURL(imageUrl);
    image=null;imageUrl=null;imageId=null;
  }
  async function renderCurrent() {
    renderZones();
    updateCount();
    const wanted=getDraft().photoId || null;
    if(wanted && wanted===imageId && image){draw();return;}
    const token=++loadToken;
    releaseImage();zoom=1;panX=0;panY=0;history=[];
    $('photo-zoom-reset').textContent='100 %';
    $('photo-stage').hidden=true;
    $('photo-placeholder').hidden=false;
    $('photo-placeholder').textContent=wanted?'Foto wird geladen …':'Noch kein Foto ausgewählt. Du kannst direkt mit dem Handy fotografieren oder ein vorhandenes Bild öffnen.';
    if(!wanted)return;
    try{
      const blob=await getBlob(wanted);
      if(token!==loadToken)return;
      if(!blob){
        $('photo-placeholder').textContent='Das gespeicherte Foto ist auf diesem Gerät nicht vorhanden. Die Markierungsanzahl bleibt erhalten.';
        return;
      }
      const decoded=await decodeImage(blob);
      if(token!==loadToken){URL.revokeObjectURL(decoded.url);return;}
      image=decoded.img;imageUrl=decoded.url;imageId=wanted;
      $('photo-stage').hidden=false;$('photo-placeholder').hidden=true;
      updateCount();requestAnimationFrame(draw);
    }catch(err){if(token===loadToken)$('photo-placeholder').textContent=err.message;}
  }
  function setMode(next) {
    mode=next;
    $('photo-mode-add').classList.toggle('is-selected',mode==='add');
    $('photo-mode-remove').classList.toggle('is-selected',mode==='remove');
    canvas.style.cursor=mode==='add'?'crosshair':'not-allowed';
  }
  function setZoom(next) {
    zoom=clamp(next,1,8);clampPan();draw();
    $('photo-zoom-reset').textContent=Math.round(zoom*100)+' %';
  }
  function pointerXY(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  function tap(x,y) {
    const f=frame();if(!f)return;
    const d=getDraft(),marks=d.photoMarks || (d.photoMarks=[]);
    const zone=selectedZone();
    if(!zone||zone.locked){$('photo-info').textContent='Dieser Bereich ist abgeschlossen. Erst wieder freigeben, um Markierungen zu ändern.';return;}
    if(mode==='remove'){
      let index=-1,min=25*25;
      marks.forEach((p,i)=>{
        if(p.zoneId!==zone.id)return;
        const dx=f.x+p.x*f.drawW-x,dy=f.y+p.y*f.drawH-y,dist=dx*dx+dy*dy;
        if(dist<min){index=i;min=dist;}
      });
      if(index<0)return;
      const point=marks.splice(index,1)[0];
      history.push({mode:'remove',index,point});
    }else{
      const nx=(x-f.x)/f.drawW,ny=(y-f.y)/f.drawH;
      if(nx<0||nx>1||ny<0||ny>1)return;
      if(marks.length>=10000){alert('Maximal 10.000 Markierungen pro Foto.');return;}
      const near=marks.some(p=>Math.hypot((p.x-nx)*f.drawW,(p.y-ny)*f.drawH)<9);
      if(near)return;
      const point={x:Math.round(nx*100000)/100000,y:Math.round(ny*100000)/100000,zoneId:zone.id};
      marks.push(point);history.push({mode:'add',index:marks.length-1,point});
    }
    if(history.length>200)history.shift();
    saveDraft();updateCount();draw();
  }
  function undo() {
    const last=history[history.length-1];if(!last)return;
    if(getDraft().photoZones?.find(z=>z.id===last.point.zoneId)?.locked){
      $('photo-info').textContent='Zum Rückgängigmachen bitte den abgeschlossenen Bereich erst freigeben.';return;
    }
    history.pop();
    const marks=getDraft().photoMarks;
    if(last.mode==='add')marks.splice(last.index,1);
    else marks.splice(last.index,0,last.point);
    saveDraft();updateCount();draw();
  }
  function wirePointerEvents() {
    canvas.addEventListener('pointerdown',e=>{
      if(!image)return;
      const pos=pointerXY(e);
      pointers.set(e.pointerId,{...pos,startX:pos.x,startY:pos.y,startPanX:panX,startPanY:panY,moved:false,multi:false});
      canvas.setPointerCapture(e.pointerId);
      if(pointers.size===2){
        for(const p of pointers.values())p.multi=true;
        const [a,b]=[...pointers.values()];
        pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,zoom,panX,panY};
      }
    });
    canvas.addEventListener('pointermove',e=>{
      const p=pointers.get(e.pointerId);if(!p||!image)return;
      const pos=pointerXY(e);p.x=pos.x;p.y=pos.y;
      if(pointers.size>=2&&pinch){
        const [a,b]=[...pointers.values()];
        const distance=Math.hypot(a.x-b.x,a.y-b.y)||1;
        const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
        zoom=clamp(pinch.zoom*distance/pinch.distance,1,8);
        panX=pinch.panX+midX-pinch.midX;panY=pinch.panY+midY-pinch.midY;
        clampPan();draw();$('photo-zoom-reset').textContent=Math.round(zoom*100)+' %';
      }else if(Math.hypot(p.x-p.startX,p.y-p.startY)>7){
        p.moved=true;
        panX=p.startPanX+p.x-p.startX;panY=p.startPanY+p.y-p.startY;
        clampPan();draw();
      }
    });
    function end(e,wasCancelled){
      const p=pointers.get(e.pointerId);if(!p)return;
      if(!wasCancelled && !p.moved && !p.multi && pointers.size===1)tap(p.x,p.y);
      pointers.delete(e.pointerId);
      if(pointers.size<2)pinch=null;
      if(pointers.size===1){
        const remaining=[...pointers.values()][0];
        remaining.startX=remaining.x;remaining.startY=remaining.y;remaining.startPanX=panX;remaining.startPanY=panY;
      }
    }
    canvas.addEventListener('pointerup',e=>end(e,false));
    canvas.addEventListener('pointercancel',e=>end(e,true));
  }
  async function choosePhoto(file) {
    if(!file)return;
    const draft=getDraft();
    const replacing=Boolean(draft.photoId || (draft.photoMarks?.length||0)>0);
    if(replacing &&
       !confirm('Neues Foto wählen? Das bisherige Foto und alle Markierungen dieser Fotozählung werden ersetzt.'))return;
    const oldId=draft.photoId;
    $('photo-info').textContent='Foto wird vorbereitet und lokal gespeichert …';
    try{
      const blob=await compressImage(file);
      const id=uid();
      await putBlob(id,blob);
      draft.photoId=id;draft.photoMarks=[];
      if(replacing){draft.photoZones=[defaultZone()];draft.activePhotoZoneId=draft.photoZones[0].id;}
      saveDraft();await renderCurrent();
      $('photo-info').textContent='Foto lokal gespeichert. Tippen markiert ein Brett. Mit zwei Fingern zoomen und bei Vergrößerung verschieben.';
      return oldId;
    }catch(err){alert('Foto konnte nicht übernommen werden: '+err.message);}
    finally{$('photo-file').value='';}
    return null;
  }
  async function downloadMarkedPhoto() {
    if(!image)return alert('Bitte zuerst ein Foto öffnen.');
    try{
      const d=getDraft(),zones=d.photoZones||[],marks=d.photoMarks||[];
      const w=image.naturalWidth,h=image.naturalHeight;
      const font=Math.max(16,Math.round(w/75)),line=Math.round(font*1.6);
      const pad=Math.round(font*1.2),footer=Math.round(line*(zones.length+2)+pad*2);
      const target=document.createElement('canvas');target.width=w;target.height=h+footer;
      const c=target.getContext('2d');if(!c)throw Error('Bildexport nicht verfügbar.');
      c.fillStyle='#fff';c.fillRect(0,0,w,h+footer);c.drawImage(image,0,0,w,h);
      const zoneMap=new Map(zones.map(z=>[z.id,z]));const numbers=new Map();
      const radius=Math.max(12,Math.round(w/125));
      marks.forEach(p=>{
        const z=zoneMap.get(p.zoneId),n=(numbers.get(p.zoneId)||0)+1;
        numbers.set(p.zoneId,n);
        const x=p.x*w,y=p.y*h;
        c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.fillStyle=z?.color||COLORS[0];c.fill();
        c.lineWidth=Math.max(2,radius/5);c.strokeStyle='white';c.stroke();
        c.fillStyle='#fff';c.font='bold '+Math.max(9,Math.round(radius*.86))+'px Arial';
        c.textAlign='center';c.textBaseline='middle';c.fillText(String(n),x,y);
      });
      c.fillStyle='#173f30';c.fillRect(0,h,w,footer);
      c.textAlign='left';c.textBaseline='top';c.fillStyle='#fff';c.font='bold '+font+'px Arial';
      c.fillText('Fotozählung · '+marks.length+' Stück',pad,h+pad);
      zones.forEach((z,i)=>{
        const y=h+pad+line*(i+1);
        c.fillStyle=z.color;c.fillRect(pad,y+2,font,font);
        c.fillStyle='#fff';c.font=Math.round(font*.9)+'px Arial';
        const count=marks.filter(p=>p.zoneId===z.id).length;
        c.fillText(z.name+' · '+count+' Stück',pad+font*1.5,y);
      });
      const blob=await new Promise((resolve,reject)=>target.toBlob(b=>b?resolve(b):reject(Error('Foto konnte nicht exportiert werden.')),'image/jpeg',.92));
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      const name=String(d.name||'Inventur').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g,'_').slice(0,50);
      a.href=url;a.download='HolzOptiX_Fotozaehlung_'+name+'.jpg';document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(err){alert('Kontrollbild konnte nicht gespeichert werden: '+err.message);}
  }
  async function blobToDataUrl(blob) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result));
      reader.onerror=()=>reject(Error('Foto für die Sicherung nicht lesbar.'));
      reader.readAsDataURL(blob);
    });
  }
  async function exportImages(ids) {
    const images={};
    for(const id of new Set(ids.filter(Boolean))){
      try{
        const blob=await getBlob(id);
        if(blob)images[id]=await blobToDataUrl(blob);
      }catch(_){ /* Zählwerte können auch ohne das Foto gesichert werden. */ }
    }
    return images;
  }
  function dataUrlToBlob(text) {
    if(typeof text!=='string'||!text.startsWith('data:image/jpeg;base64,')||text.length>20*1024*1024)
      throw Error('Ungültige Fotodaten in der Sicherung.');
    const binary=atob(text.slice('data:image/jpeg;base64,'.length));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:'image/jpeg'});
  }
  async function importImages(images) {
    const ids=new Map();
    if(images===undefined)return ids;
    if(!images||typeof images!=='object'||Array.isArray(images)||Object.keys(images).length>5000)
      throw Error('Ungültiger Fotospeicher in der Sicherung.');
    try{
      for(const [oldId,data] of Object.entries(images)){
        const next=uid();
        await putBlob(next,dataUrlToBlob(data));
        ids.set(oldId,next);
      }
    }catch(err){
      await Promise.all([...ids.values()].map(removeStored));
      throw err;
    }
    return ids;
  }
  function init(options) {
    getDraft=options.getDraft;saveDraft=options.persist;onChange=options.onCountChange;
    canvas=$('photo-canvas');ctx=canvas.getContext('2d');
    if(!ctx){$('photo-info').textContent='Fotozählung wird von diesem Browser nicht unterstützt.';return false;}
    wirePointerEvents();
    $('photo-zone-add').addEventListener('click',()=>{
      const d=getDraft();
      if(d.photoZones.length>=50)return alert('Maximal 50 Zählbereiche pro Foto.');
      const index=d.photoZones.length;
      const zone={id:uid(),name:'Bereich '+(index+1),color:COLORS[index%COLORS.length],locked:false};
      d.photoZones.push(zone);d.activePhotoZoneId=zone.id;
      saveDraft();renderZones();draw();
    });
    $('photo-choose').addEventListener('click',()=>$('photo-file').click());
    $('photo-file').addEventListener('change',async e=>{
      const oldId=await choosePhoto(e.target.files[0]);
      if(oldId)options.cleanupPhoto(oldId);
    });
    $('photo-clear').addEventListener('click',()=>{
      const d=getDraft();
      if(!d.photoId && !(d.photoMarks?.length))return;
      if(!confirm('Foto und alle Markierungen dieser Zählung entfernen?'))return;
      const oldId=d.photoId;
      d.photoId=null;d.photoMarks=[];d.photoZones=[defaultZone()];d.activePhotoZoneId=d.photoZones[0].id;
      saveDraft();renderCurrent();options.cleanupPhoto(oldId);
    });
    $('photo-mode-add').addEventListener('click',()=>setMode('add'));
    $('photo-mode-remove').addEventListener('click',()=>setMode('remove'));
    $('photo-zoom-in').addEventListener('click',()=>setZoom(zoom*1.5));
    $('photo-zoom-out').addEventListener('click',()=>setZoom(zoom/1.5));
    $('photo-zoom-reset').addEventListener('click',()=>{panX=0;panY=0;setZoom(1);});
    $('photo-undo').addEventListener('click',undo);
    $('photo-download').addEventListener('click',downloadMarkedPhoto);
    if('ResizeObserver' in window)new ResizeObserver(draw).observe($('photo-stage'));
    window.addEventListener('resize',draw);
    setMode('add');updateCount();
    return true;
  }
  return {version:'1.3.2',init,renderCurrent,draw,removeStored,exportImages,importImages};
})();
