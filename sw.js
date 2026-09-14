const DB='hyper-upload-queue', STORE='tasks', CHUNK_DEFAULT=1024*1024;
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})}})}
async function getTasks(){const db=await openDB();return await new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>{db.close();res(r.result||[])};r.onerror=()=>{db.close();rej(r.error)}})}
async function putTask(x){const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(x);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function delTask(id){const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function notify(title,body,tag='hyper-transfer'){try{await self.registration.showNotification(title,{body,tag,renotify:false,data:{url:self.location.origin}})}catch(e){}}
async function postClients(msg){const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});cs.forEach(c=>c.postMessage(msg))}

async function processUpload(q){
 if(!q||!q.fileBlob)return;
 const token=q.token||'';const headers=token?{Authorization:'Bearer '+token}:{};
 const uploadId=String(q.upload_id||q.id);const base=self.location.origin+'/api/uploads/'+encodeURIComponent(uploadId);
 const file=q.fileBlob;const CHUNK=Number(q.chunk_size)||CHUNK_DEFAULT;const total=Math.ceil(file.size/CHUNK);
 try{
  const st=await fetch(base+'/status',{headers,cache:'no-store'});
  if(!st.ok)throw new Error('Upload session unavailable ('+st.status+')');
  const sd=await st.json();
  const received=new Set((sd.received||[]).map(Number));
  if(sd.complete){await delTask(q.id);await notify('HYPER Upload complete',q.title||'Video published', 'hyper-upload-'+q.id);await postClients({type:'HYPER_UPLOAD_DONE',id:q.id});return}
  let completed=received.size;
  await notify('HYPER Upload resumed',`${q.title||'Video'} • ${Math.floor(completed/Math.max(1,total)*100)}%`, 'hyper-upload-'+q.id);
  for(let i=0;i<total;i++){
   if(received.has(i))continue;
   const slice=file.slice(i*CHUNK,Math.min(file.size,(i+1)*CHUNK));
   const fd=new FormData();fd.append('upload_id',uploadId);fd.append('chunk',slice,q.filename||file.name);fd.append('chunk_index',String(i));fd.append('total_chunks',String(total));
   let ok=false,lastErr=null;
   for(let a=0;a<3&&!ok;a++){try{const r=await fetch(base+'/chunk',{method:'POST',headers,body:fd});if(!r.ok){let j={};try{j=await r.json()}catch{};throw new Error(j.message||'Chunk failed '+r.status)}ok=true}catch(e){lastErr=e;await new Promise(r=>setTimeout(r,700*(a+1)))}}
   if(!ok)throw lastErr||new Error('Chunk upload failed');
   completed++;q.progress=Math.floor(completed/total*95);q.committed_progress=q.progress;q.state='uploading';await putTask(q);
   await notify('HYPER Uploading',`${q.title||'Video'} • ${Math.floor(completed/total*100)}%`, 'hyper-upload-'+q.id);
   await postClients({type:'HYPER_UPLOAD_PROGRESS',id:q.id,progress:Math.floor(completed/total*95),message:`Background upload • ${Math.floor(completed/total*100)}%`});
  }
  const fd=new FormData();fd.append('title',q.title||'Untitled');fd.append('description',q.description||'');fd.append('type',q.type||'video');fd.append('category',q.category||'Discover');fd.append('upload_id',uploadId);fd.append('duration_seconds',String(q.duration_seconds||0));fd.append('total_chunks',String(total));fd.append('filename',q.filename||file.name);fd.append('mimetype',q.mimetype||file.type||'video/mp4');fd.append('original_language',q.original_language||'auto');fd.append('language_tracks',q.language_tracks||'{}');fd.append('subtitle_tracks',q.subtitle_tracks||'{}');
  if(q.thumbnailBlob)fd.append('thumbnail',q.thumbnailBlob,q.thumbnailName||'thumbnail.jpg');
  const r=await fetch(base+'/complete',{method:'POST',headers,body:fd});let data={};try{data=await r.json()}catch{};if(!r.ok)throw new Error(data.message||'Publish failed');
  await delTask(q.id);await notify('HYPER Upload complete',q.title||'Video published','hyper-upload-'+q.id);await postClients({type:'HYPER_UPLOAD_DONE',id:q.id});
 }catch(e){q.state='paused';q.error=String(e?.message||'Background upload failed');await putTask(q);await notify('HYPER Upload paused',`${q.title||'Video'} • ${q.error}`,'hyper-upload-'+q.id);await postClients({type:'HYPER_UPLOAD_PROGRESS',id:q.id,progress:Number(q.progress)||0,message:'Background upload paused — will retry'});throw e}
}

async function processQueue(){const tasks=await getTasks();for(const q of tasks){if(q.state==='done')continue;try{await processUpload(q)}catch(e){}}}
self.addEventListener('sync',e=>{if(e.tag==='hyper-upload')e.waitUntil(processQueue())});
self.addEventListener('message',e=>{if(e.data?.type==='HYPER_SYNC')e.waitUntil(processQueue());if(e.data?.type==='HYPER_NOTIFY')e.waitUntil(notify(e.data.title||'HYPER',e.data.body||'',e.data.tag||'hyper-transfer'))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs[0]?cs[0].focus():clients.openWindow(self.location.origin)))})
