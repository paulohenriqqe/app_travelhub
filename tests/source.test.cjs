const {test}=require('node:test'),assert=require('node:assert/strict');
const {journeysFromPublishedRows}=require('../assets/journey-source.js'),M=require('../assets/journey-model.js');
test('published canonical sheet remains readable with explicit read-only mode',()=>{
 const source=journeysFromPublishedRows([{Id:'trip',Viagem:'Férias',Status:'concluida','Data de inicio':'31/12/2025','Data de fim':'01/01/2026',Tags:'Praia; Férias',Acompanhantes:'João; Maria',Artistas:'',Localizacoes:JSON.stringify([{id:'stop',city:'Recife',country:'Brasil',region:'PE',destinationDays:2,lat:0,lng:0}]),Versao:'3','Contagem de dias':'period','Itinerario Diario':JSON.stringify({notes:'Passeio à tarde'})}]);
 const j=M.normalize(source.journeys[0]);assert.equal(source.readOnly,true);assert.equal(j.version,3);assert.equal(j.startDate,'2025-12-31');assert.equal(j.locations[0].lat,0);assert.deepEqual(j.travelers,['João','Maria']);assert.equal(j.itinerary.notes,'Passeio à tarde');
});
test('legacy or malformed published sheets cannot masquerade as canonical data',()=>{
 assert.throws(()=>journeysFromPublishedRows([{Id:'1',Viagem:'Antiga'}]));
 assert.throws(()=>journeysFromPublishedRows([{Id:'1',Status:'concluida',Localizacoes:'{broken',Versao:'1','Contagem de dias':'period'}]));
});
