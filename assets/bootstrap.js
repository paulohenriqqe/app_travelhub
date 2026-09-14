/* Enable the new client only after the corresponding data service is ready. */
(async () => {
  const ready=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let unified=false;
  try {unified=localStorage.getItem('travelhub-schema')==='2';} catch {}
  try {
    const response=await fetch(`${GOOGLE_SCRIPT_URL}?action=list_journeys&t=${Date.now()}`,{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(response.ok && data.ok===true && data.schemaVersion===2 && Array.isArray(data.journeys)) {
      unified=true;window.travelhubInitialData=data;
      try {localStorage.setItem('travelhub-schema','2');} catch {}
    }
  } catch(error) {console.warn('TravelHub: serviço temporariamente indisponível.');}
  finally {clearTimeout(timer);}
  await ready;
  if(unified) {
    const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);});
    try {await load('assets/journey-model.js');await load('assets/journeys.js');}
    catch {document.getElementById('sync-text').textContent='Atualize a página para carregar o aplicativo.';return;}
  }
  initializeTravelHub();
  if(unified)Journeys.install();
})();
