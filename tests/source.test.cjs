const {test}=require('node:test'),assert=require('node:assert/strict');
const {journeysFromPublishedRows}=require('../assets/journey-source.js'),M=require('../assets/journey-model.js');
const {confirmedJourneyFromReceipt}=require('../assets/journey-source.js');
test('lost or invalid response is recovered only from matching durable receipt and complete state',()=>{
 const input={id:'trip',name:'Teste',status:'planejada',locations:[],tags:[],travelers:[],artists:[],itinerary:{notes:'Roteiro'}};
 const body={requestId:'request-1',payload:{journey:input,expectedVersion:0}};
 const saved=M.save(null,input,0,body.requestId,'2026-09-14T12:00:00Z');
 const data={ok:true,schemaVersion:2,journeys:[saved]};
 assert.equal(confirmedJourneyFromReceipt(data,body,M).id,'trip');
 assert.equal(confirmedJourneyFromReceipt({...data,journeys:[]},body,M),null);
 assert.equal(confirmedJourneyFromReceipt({...data,journeys:[{...saved,requests:[]}]},body,M),null);
 assert.equal(confirmedJourneyFromReceipt({...data,journeys:[{...saved,version:2}]},body,M),null);
 assert.equal(confirmedJourneyFromReceipt({...data,journeys:[{...saved,name:'Outra edição'}]},body,M),null);
 assert.equal(confirmedJourneyFromReceipt({...data,journeys:[{...saved,status:'cancelada'}]},body,M),null);
});
test('published canonical sheet remains readable with explicit read-only mode',()=>{
 const source=journeysFromPublishedRows([{Id:'trip',Viagem:'Férias',Status:'concluida','Data de inicio':'31/12/2025','Data de fim':'01/01/2026',Tags:'Praia; Férias',Acompanhantes:'João; Maria',Artistas:'',Localizacoes:JSON.stringify([{id:'stop',city:'Recife',country:'Brasil',region:'PE',destinationDays:2,lat:0,lng:0}]),Versao:'3','Contagem de dias':'period','Itinerario Diario':JSON.stringify({notes:'Passeio à tarde'})}]);
 const j=M.normalize(source.journeys[0]);assert.equal(source.readOnly,true);assert.equal(j.version,3);assert.equal(j.startDate,'2025-12-31');assert.equal(j.locations[0].lat,0);assert.deepEqual(j.travelers,['João','Maria']);assert.equal(j.itinerary.notes,'Passeio à tarde');
});
test('legacy or malformed published sheets cannot masquerade as canonical data',()=>{
 assert.throws(()=>journeysFromPublishedRows([{Id:'1',Viagem:'Antiga'}]));
 assert.throws(()=>journeysFromPublishedRows([{Id:'1',Status:'concluida',Localizacoes:'{broken',Versao:'1','Contagem de dias':'period'}]));
});
