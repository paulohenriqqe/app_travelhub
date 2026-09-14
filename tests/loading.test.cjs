const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {readCachedJourneys,writeCachedJourneys,mergeJourneyVersions}=require('../assets/journey-source.js');
test('cache is scoped, expires, omits raw source rows and preserves saved versions',()=>{
 const storage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
 writeCachedJourneys({journeys:[{id:'a',version:2,name:'Nova',sourceRefs:[{raw:'private source'}],requests:['receipt']}]},storage,'api-a',100);
 assert.equal(readCachedJourneys(storage,'api-a',200).journeys[0].name,'Nova');
 assert.equal(readCachedJourneys(storage,'api-b',200),null);
 assert.equal(readCachedJourneys(storage,'api-a',8*86400000),null);
 assert.equal(storage.value.includes('private source'),false);assert.equal(storage.value.includes('receipt'),false);
 assert.doesNotThrow(()=>writeCachedJourneys({journeys:[]},{setItem(){throw Error('quota')}},'api'));
});
test('a slow background response cannot revert a confirmed save or remove a new trip',()=>{
 const merged=mergeJourneyVersions([{id:'a',version:3,name:'Salva'},{id:'new',version:1}], [{id:'a',version:2,name:'Antiga'},{id:'b',version:1}]);
 assert.equal(merged.find(j=>j.id==='a').name,'Salva');assert.equal(merged.length,3);
});
test('published sheet renders before a pending API and newer API data arrives in the background',async()=>{
 let release;const slow=new Promise(resolve=>release=resolve),updates=[];
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,GOOGLE_SCRIPT_URL:'api',CSV_URL:'sheet',Papa:{parse:()=>({errors:[],data:[{Id:'a',Viagem:'Teste',Status:'planejada',Localizacoes:'[]',Versao:'1','Contagem de dias':'period'}]})},fetch:url=>url.startsWith('api')?slow:Promise.resolve({ok:true,text:async()=>''})});
 vm.runInContext(fs.readFileSync('assets/journey-source.js','utf8'),context);
 const first=await context.loadJourneyData({onUpdate:data=>updates.push(data)});
 assert.equal(first.source,'sheet');assert.equal(first.journeys[0].version,1);assert.equal(updates.length,0);
 release({ok:true,json:async()=>({ok:true,schemaVersion:2,journeys:[{id:'a',version:2}]})});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(updates[0].journeys[0].version,2);
});
