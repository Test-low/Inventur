'use strict';
/* HolzOptiX Inventur 1.1: lokale Foto-Zählhilfe ohne Upload und ohne Bibliotheken. */
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
    (getDraft().photoMarks||[]).forEach((p,i)=>{
      const x=f.x+p.x*f.drawW,y=f.y+p.y*f.drawH;
      if(x < -18 || x > width+18 || y < -18 || y > height+18)return;
      ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fillStyle='#f69b31';ctx.fill();
      ctx.lineWidth=2.5;ctx.strokeStyle='#ffffff';ctx.stroke();
      if(i<999){
        ctx.fillStyle='#302618';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(String(i+1),x,y);
      }
    });
  }
  function releaseImage() {
    if(imageUrl)URL.revokeObjectURL(imageUrl);
    image=null;imageUrl=null;imageId=null;
  }
  async function renderCurrent() {
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
      requestAnimationFrame(draw);
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
    if(mode==='remove'){
      let index=-1,min=25*25;
      marks.forEach((p,i)=>{
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
      const point={x:Math.round(nx*100000)/100000,y:Math.round(ny*100000)/100000};
      marks.push(point);history.push({mode:'add',index:marks.length-1,point});
    }
    if(history.length>200)history.shift();
    saveDraft();updateCount();draw();
  }
  function undo() {
    const last=history.pop();if(!last)return;
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
    if((draft.photoId || (draft.photoMarks?.length||0)>0) &&
       !confirm('Neues Foto wählen? Das bisherige Foto und alle Markierungen dieser Fotozählung werden ersetzt.'))return;
    const oldId=draft.photoId;
    $('photo-info').textContent='Foto wird vorbereitet und lokal gespeichert …';
    try{
      const blob=await compressImage(file);
      const id=uid();
      await putBlob(id,blob);
      draft.photoId=id;draft.photoMarks=[];
      saveDraft();await renderCurrent();
      $('photo-info').textContent='Foto lokal gespeichert. Tippen markiert ein Brett. Mit zwei Fingern zoomen und bei Vergrößerung verschieben.';
      return oldId;
    }catch(err){alert('Foto konnte nicht übernommen werden: '+err.message);}
    finally{$('photo-file').value='';}
    return null;
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
    if(!ctx){$('photo-info').textContent='Fotozählung wird von diesem Browser nicht unterstützt.';return;}
    wirePointerEvents();
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
      d.photoId=null;d.photoMarks=[];saveDraft();renderCurrent();options.cleanupPhoto(oldId);
    });
    $('photo-mode-add').addEventListener('click',()=>setMode('add'));
    $('photo-mode-remove').addEventListener('click',()=>setMode('remove'));
    $('photo-zoom-in').addEventListener('click',()=>setZoom(zoom*1.5));
    $('photo-zoom-out').addEventListener('click',()=>setZoom(zoom/1.5));
    $('photo-zoom-reset').addEventListener('click',()=>{panX=0;panY=0;setZoom(1);});
    $('photo-undo').addEventListener('click',undo);
    if('ResizeObserver' in window)new ResizeObserver(draw).observe($('photo-stage'));
    window.addEventListener('resize',draw);
    setMode('add');updateCount();
  }
  return {init,renderCurrent,draw,removeStored,exportImages,importImages};
})();
