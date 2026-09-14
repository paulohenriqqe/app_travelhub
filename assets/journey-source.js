/* Read the same canonical sheet while its write service is unavailable. */
function journeysFromPublishedRows(rows) {
  if(!rows.length || !['Id','Status','Localizacoes','Versao','Contagem de dias'].every(k=>Object.hasOwn(rows[0],k))) throw new Error('A base unificada não está disponível.');
  const parse=(r,k,fallback)=>r[k]?JSON.parse(r[k]):fallback;
  return {ok:true,schemaVersion:2,readOnly:true,journeys:rows.filter(r=>r.Id).map(r=>({
    id:r.Id,name:r.Viagem,status:r.Status,startDate:r['Data de inicio'],endDate:r['Data de fim'],tags:r.Tags,travelers:r.Acompanhantes,artists:r.Artistas,
    locations:parse(r,'Localizacoes',[]),itinerary:parse(r,'Itinerario Diario',{}),plannedSnapshot:parse(r,'Planejamento original',null),history:parse(r,'Historico',[]),sourceRefs:parse(r,'Origem',[]),requests:parse(r,'Solicitacoes',[]),version:Number(r.Versao),createdAt:r['Criado em'],updatedAt:r['Atualizado em'],dayBasis:r['Contagem de dias']
  }))};
}
async function loadApiJourneyData() {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try {
    const response=await fetch(`${GOOGLE_SCRIPT_URL}?action=list_journeys&t=${Date.now()}`,{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(response.ok && data.ok===true && data.schemaVersion===2 && Array.isArray(data.journeys))return {...data,readOnly:false};
    throw new Error('Não foi possível atualizar as viagens.');
  }
  finally {clearTimeout(timer);}
}
async function loadJourneyData({onUpdate}={}) {
  // Read both representations of the canonical sheet in parallel. A slow API
  // must not hold back the published sheet; reconcile newer versions later.
  const api=loadApiJourneyData();
  const sheet=loadPublishedJourneyData().then(data=>({...data,readOnly:false,source:'sheet'}));
  const first=await Promise.any([api,sheet]);
  if(first.source==='sheet')api.then(data=>onUpdate?.(data)).catch(()=>{});
  return first;
}
async function loadPublishedJourneyData() {
  const fallbackController=new AbortController(),fallbackTimer=setTimeout(()=>fallbackController.abort(),15000);
  try {
    const response=await fetch(`${CSV_URL}&t=${Date.now()}`,{cache:'no-store',signal:fallbackController.signal});
    if(!response.ok)throw new Error('Não foi possível carregar as viagens.');
    const parsed=Papa.parse(await response.text(),{header:true,skipEmptyLines:true});
    if(parsed.errors.length)throw new Error('Resposta inválida da planilha.');
    return journeysFromPublishedRows(parsed.data);
  } finally {clearTimeout(fallbackTimer);}
}
function confirmedJourneyFromReceipt(data,body,model) {
  const found=data.journeys?.find(j=>j.id===body.payload.journey.id);
  if(data.ok!==true || data.schemaVersion!==2 || !found || !found.requests?.includes(body.requestId) || found.version!==Number(body.payload.expectedVersion)+1)return null;
  const actual=model.normalize(found),expected=model.normalize(body.payload.journey);
  const stable=v=>Array.isArray(v)?v.map(stable):v && typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  if(actual.status!==expected.status || JSON.stringify(stable(model.snapshot(actual)))!==JSON.stringify(stable(model.snapshot(expected))))return null;
  return actual;
}
const JOURNEY_CACHE_KEY='travelhub:journeys:v2';
function readCachedJourneys(storage,endpoint=GOOGLE_SCRIPT_URL,now=Date.now()) {
  try {
    storage ??= localStorage;
    const data=JSON.parse(storage.getItem(JOURNEY_CACHE_KEY));
    if(data.endpoint!==endpoint || now-data.savedAt>7*86400000 || data.schemaVersion!==2 || !Array.isArray(data.journeys) || !data.journeys.every(j=>j.id && Number.isInteger(j.version) && j.version>0))return null;
    return {...data,ok:true,cached:true};
  }catch{return null;}
}
function writeCachedJourneys(data,storage,endpoint=GOOGLE_SCRIPT_URL,now=Date.now()) {
  try {
    storage ??= localStorage;
    const journeys=data.journeys.map(({requests,sourceRefs,...j})=>j);
    storage.setItem(JOURNEY_CACHE_KEY,JSON.stringify({schemaVersion:2,endpoint,savedAt:now,journeys}));
  }catch{} // Private browsing or quota limits must never block the app.
}
function mergeJourneyVersions(current,incoming) {
  const merged=new Map(current.map(j=>[j.id,j]));
  incoming.forEach(j=>{if(!merged.has(j.id) || j.version>=merged.get(j.id).version)merged.set(j.id,j);});
  return [...merged.values()];
}
if(typeof module!=='undefined')module.exports={journeysFromPublishedRows,confirmedJourneyFromReceipt,loadJourneyData,readCachedJourneys,writeCachedJourneys,mergeJourneyVersions};
