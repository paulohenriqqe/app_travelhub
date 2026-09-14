/* Enable the new client only after the corresponding data service is ready. */
(async () => {
  const ready=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
  let unified=false;
  try {unified=localStorage.getItem('travelhub-schema')==='2';} catch {}
  try {
    const data=await loadJourneyData();
    if(data.ok===true && data.schemaVersion===2 && Array.isArray(data.journeys)) {
      unified=true;window.travelhubInitialData=data;
      try {localStorage.setItem('travelhub-schema','2');} catch {}
    }
  } catch(error) {console.warn('TravelHub: serviço temporariamente indisponível.');}
  await ready;
  if(unified) {
    const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);});
    try {await load('assets/journey-model.js?v=4');await load('assets/journeys.js?v=4');}
    catch {document.getElementById('sync-text').textContent='Atualize a página para carregar o aplicativo.';return;}
  }
  initializeTravelHub();
  if(unified)Journeys.install();
})();
