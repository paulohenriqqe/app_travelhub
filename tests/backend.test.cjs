const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../assets/journey-model.js');
const headers=['Id','Viagem','Status','Data de inicio','Data de fim','Tags','Acompanhantes','Artistas','Localizacoes','Itinerario Diario','Planejamento original','Historico','Origem','Versao','Criado em','Atualizado em','Solicitacoes','Contagem de dias'];
function server(){
 const data=[headers],sheet={getDataRange:()=>({getValues:()=>data}),getRange:(r,c,h,w)=>({setValues:rows=>rows.forEach((row,i)=>data[r-1+i]=row)})};
 const context=vm.createContext({TravelHubModel:M,Date,console,Utilities:{formatDate:d=>d.toISOString().slice(0,10)},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush:()=>{}},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})}});
 vm.runInContext(fs.readFileSync('apps-script/backend.js','utf8'),context);
 return {post:b=>context.doPost({postData:{contents:JSON.stringify(b)}}),get:()=>context.doGet({parameter:{action:'list_journeys'}}),data};
}
const payload=()=>({schemaVersion:2,action:'save_journey',requestId:'request-1',payload:{expectedVersion:0,journey:{id:'test',name:'Teste',status:'planejada',startDate:'',endDate:'',locations:[],tags:[],artists:[],travelers:[],itinerary:{notes:'roteiro'}}}});
test('server confirms persisted identity, version and request, then reads same record',()=>{const s=server(),b=payload(),r=s.post(b);assert.equal(r.ok,true);assert.equal(r.journey.id,'test');assert.equal(r.version,1);assert.equal(r.requestId,b.requestId);assert.equal(s.get().journeys[0].itinerary.notes,'roteiro');});
test('server retry after saved response lost is idempotent',()=>{const s=server(),b=payload();s.post(b);const retry=s.post(b);assert.equal(retry.ok,true);assert.equal(retry.version,1);assert.equal(s.get().journeys.length,1);});
test('stale concurrent update and old API calls cannot mutate records',()=>{const s=server(),b=payload();s.post(b);b.requestId='request-2';assert.equal(s.post(b).ok,false);assert.equal(s.post({action:'create_effective_trip',payload:{}}).ok,false);assert.equal(s.get().journeys.length,1);assert.equal(s.get().journeys[0].version,1);});
test('server rejects incomplete completed journey without writing partial data',()=>{const s=server(),b=payload();b.payload.journey.status='concluida';assert.equal(s.post(b).ok,false);assert.equal(s.get().journeys.length,0);});

test('blank spreadsheet rows do not redirect an edit or overwrite another journey',()=>{const s=server(),b=payload();s.post(b);s.data.splice(1,0,headers.map(()=>''));b.requestId='request-edit';b.payload.expectedVersion=1;b.payload.journey.name='Editada';assert.equal(s.post(b).ok,true);assert.equal(s.data[1][0],'');assert.equal(s.data[2][1],'Editada');b.requestId='request-new';b.payload.expectedVersion=0;b.payload.journey.id='second';assert.equal(s.post(b).ok,true);assert.equal(s.get().journeys.length,2);assert.equal(s.data[3][0],'second');});
