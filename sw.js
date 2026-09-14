const DB='hyper-upload-queue', STORE='tasks', CHUNK_DEFAULT=1024*1024;
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})}})}
async function getTasks(){const db=await openDB();return await new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>{db.close();res(r.result||[])};r.onerror=()=>{db.close();rej(r.error)}})}
async function putTask(x){const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(x);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function delTask(id){const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function notify(title,body,tag='hyper-transfer',videoId=null){try{await self.registration.showNotification(title,{body,tag,renotify:false,data:{url:self.location.origin,videoId:videoId?String(videoId):null}})}catch(e){}}
async function postClients(msg){const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});cs.forEach(c=>c.postMessage(msg))}


async function cloudinaryChunk(q,chunk,start,total){
 const cloud=q.cloudinary_cloud_name,preset=q.cloudinary_upload_preset;
 if(!cloud||!preset)throw new Error('Cloudinary upload configuration missing');
 const uploadId=String(q.cloudinary_upload_id||('hyper-'+q.id));
 const fd=new FormData();
 fd.append('file',chunk,q.filename||'video.mp4');
 fd.append('upload_preset',preset);
 fd.append('resource_type','video');
 const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/video/upload`,{
   method:'POST',
   headers:{'X-Unique-Upload-Id':uploadId,'Content-Range':`bytes ${start}-${start+chunk.size-1}/${total}`},
   body:fd
 });
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw new Error(d.error?.message||d.message||`Cloudinary upload failed (${r.status})`);
 return d;
}
async function cloudinarySimple(q,blob,resourceType='image'){
 const cloud=q.cloudinary_cloud_name,preset=q.cloudinary_upload_preset;
 const fd=new FormData();fd.append('file',blob,q.thumbnailName||'thumbnail.jpg');fd.append('upload_preset',preset);
 const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resourceType}/upload`,{method:'POST',body:fd});
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw new Error(d.error?.message||d.message||`Cloudinary upload failed (${r.status})`);
 return d;
}
async function processCloudinaryUpload(q){
 if(!q||!q.fileBlob)return;
 const file=q.fileBlob,total=file.size,CHUNK=Number(q.chunk_size)||4*1024*1024;
 const totalChunks=Math.ceil(total/CHUNK);
 const uploadId=String(q.cloudinary_upload_id||('hyper-'+q.id));
 let next=Math.max(0,Number(q.next_chunk)||0);
 // Retry each chunk; a temporary 4G drop should not lose the whole upload.
 for(let i=next;i<totalChunks;i++){
   const start=i*CHUNK,blob=file.slice(start,Math.min(total,start+CHUNK));
   let result=null,lastErr=null;
   for(let a=0;a<5;a++){
     try{result=await cloudinaryChunk(q,blob,start,total);lastErr=null;break}
     catch(e){lastErr=e;await new Promise(r=>setTimeout(r,1000*Math.min(8,2**a)))}
   }
   if(lastErr)throw lastErr;
   if(result?.secure_url){q.cloudinary_secure_url=result.secure_url;q.cloudinary_url=result.url||''}
   if(result?.public_id)q.cloudinary_public_id=result.public_id;
   q.next_chunk=i+1;q.progress=Math.min(95,Math.floor((Math.min(total,(i+1)*CHUNK)/total)*95));q.committed_progress=q.progress;q.state='uploading';
   await putTask(q);
   await notify('HYPER Uploading',`${q.title||'Video'} • ${Math.floor((i+1)/Math.max(1,totalChunks)*100)}%`,'hyper-upload-'+q.id);
   await postClients({type:'HYPER_UPLOAD_PROGRESS',id:q.id,progress:q.progress,message:`Background upload • ${Math.floor((i+1)/Math.max(1,totalChunks)*100)}%`});
 }
 const finalUrl=q.cloudinary_secure_url||q.cloudinary_url;
 if(!finalUrl)throw new Error('Cloudinary upload finished but no video URL was returned');
 let thumbUrl='',thumbId='';
 if(q.thumbnailBlob){
   const tr=await cloudinarySimple(q,q.thumbnailBlob,'image');
   thumbUrl=tr.secure_url||tr.url||'';thumbId=tr.public_id||'';
 }
 const token=q.auth_token||'';
 const headers=token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'};
 const r=await fetch(self.location.origin+'/api/videos/cloudinary',{method:'POST',headers,body:JSON.stringify({
   title:q.title||'Untitled',description:q.description||'',type:q.type||'video',category:q.category||'Discover',
   duration_seconds:q.duration_seconds||0,original_language:q.original_language||'auto',
   language_tracks:q.language_tracks||'{}',subtitle_tracks:q.subtitle_tracks||'{}',
   upload_key:String(q.id),video_url:finalUrl,thumbnail_url:thumbUrl,
   cloudinary_public_id:q.cloudinary_public_id||'',cloudinary_thumbnail_public_id:thumbId
 })});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data.message||`Publish failed (${r.status})`);
 await delTask(q.id);await notify('HYPER Upload complete',q.title||'Video published','hyper-upload-'+q.id);
 await postClients({type:'HYPER_UPLOAD_DONE',id:q.id});
}

async function processUpload(q){
 if(!q||!q.fileBlob)return;
 if(q.provider==='cloudinary')return processCloudinaryUpload(q);
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
self.addEventListener('notificationclick',e=>{const data=e.notification?.data||{};e.notification.close();const target=data.videoId?`${self.location.origin}/#watch=${encodeURIComponent(data.videoId)}`:(data.url||self.location.origin);e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async cs=>{if(cs[0]){await cs[0].focus();if(data.videoId)cs[0].postMessage({type:'HYPER_OPEN_VIDEO',videoId:String(data.videoId)});return cs[0]}return clients.openWindow(target)}))})
