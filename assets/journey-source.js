/* Read the same canonical sheet while its write service is unavailable. */
function journeysFromPublishedRows(rows) {
  if(!rows.length || !['Id','Status','Localizacoes','Versao','Contagem de dias'].every(k=>Object.hasOwn(rows[0],k))) throw new Error('A base unificada não está disponível.');
  const parse=(r,k,fallback)=>r[k]?JSON.parse(r[k]):fallback;
  return {ok:true,schemaVersion:2,readOnly:true,journeys:rows.filter(r=>r.Id).map(r=>({
    id:r.Id,name:r.Viagem,status:r.Status,startDate:r['Data de inicio'],endDate:r['Data de fim'],tags:r.Tags,travelers:r.Acompanhantes,artists:r.Artistas,
    locations:parse(r,'Localizacoes',[]),itinerary:parse(r,'Itinerario Diario',{}),plannedSnapshot:parse(r,'Planejamento original',null),history:parse(r,'Historico',[]),sourceRefs:parse(r,'Origem',[]),requests:parse(r,'Solicitacoes',[]),version:Number(r.Versao),createdAt:r['Criado em'],updatedAt:r['Atualizado em'],dayBasis:r['Contagem de dias']
  }))};
}
async function loadJourneyData() {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(`${GOOGLE_SCRIPT_URL}?action=list_journeys&t=${Date.now()}`,{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(response.ok && data.ok===true && data.schemaVersion===2 && Array.isArray(data.journeys))return {...data,readOnly:false};
  } catch {}
  finally {clearTimeout(timer);}
  return loadPublishedJourneyData();
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
if(typeof module!=='undefined')module.exports={journeysFromPublishedRows,confirmedJourneyFromReceipt};
