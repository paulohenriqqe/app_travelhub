const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const M=require('../assets/journey-model.js');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const sheets=new Map(Object.entries(fixture).map(([name,rows])=>{const headers=Object.keys(rows[0]);return [name,[headers,...rows.map(row=>headers.map(h=>row[h]))]];}));
const source={getSheetByName:name=>({getDataRange:()=>({getValues:()=>sheets.get(name)})})};
const context=vm.createContext({TravelHubModel:M,console,Date,Map,Set,JSON,Object,Number,String,Array});
vm.runInContext(fs.readFileSync('apps-script/backend.js','utf8'),context);
const journeys=context.buildMigration_(source);
assert.equal(journeys.length,33);assert.equal(journeys.flatMap(j=>j.locations).length,37);assert.equal(journeys.flatMap(j=>j.sourceRefs).length,37);
assert.equal(new Set(journeys.flatMap(j=>j.locations.map(l=>l.id))).size,37);
assert.equal(journeys.find(j=>j.name==='MSC Seaside').locations.length,3);assert.equal(M.travelDays(journeys.find(j=>j.name==='MSC Seaside')),3);
assert.equal(journeys.find(j=>j.name==='Férias').locations.length,3);
assert.equal(journeys.find(j=>j.name==='Natal 2026').status,'concluida');assert.equal(journeys.find(j=>j.name==='Porto Seguro 2026').status,'concluida');
assert.equal(JSON.stringify(context.buildMigration_(source)),JSON.stringify(journeys));
for(const j of journeys){const row=context.toSheetRow_(j);assert.ok(row.every(v=>typeof v!=='string'||v.length<45000));}
fs.writeFileSync(process.argv[3],JSON.stringify({ok:true,schemaVersion:2,journeys},null,2));
console.log(JSON.stringify({journeys:journeys.length,stops:37,sources:37,repeatUnchanged:true,cruiseDays:3,completed:journeys.filter(j=>j.status==='concluida').length}));
