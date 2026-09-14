/* Bundle after assets/journey-model.js. Migration functions run only in the editor. */
const V2_HEADERS = ['Id','Viagem','Status','Data de inicio','Data de fim','Tags','Acompanhantes','Artistas','Localizacoes','Itinerario Diario','Planejamento original','Historico','Origem','Versao','Criado em','Atualizado em','Solicitacoes','Contagem de dias'];
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function db_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function readRecords_(ss) {
  const sheet = ss.getSheetByName('Viagens');
  if (!sheet) throw new Error('A base unificada ainda não foi ativada.');
  const values = sheet.getDataRange().getValues();
  return values.slice(1).filter(r => r[0]).map(row => {
    const value = Object.fromEntries(values[0].map((h,i) => [h,row[i]]));
    const parse = (name, fallback) => value[name] ? JSON.parse(value[name]) : fallback;
    return {id:String(value.Id),name:value.Viagem,status:value.Status,startDate:sheetDate_(value['Data de inicio']),endDate:sheetDate_(value['Data de fim']),tags:TravelHubModel.list(value.Tags),travelers:TravelHubModel.list(value.Acompanhantes),artists:TravelHubModel.list(value.Artistas),locations:parse('Localizacoes',[]),itinerary:parse('Itinerario Diario',{}),plannedSnapshot:parse('Planejamento original',null),history:parse('Historico',[]),sourceRefs:parse('Origem',[]),version:Number(value.Versao),createdAt:value['Criado em'] || '',updatedAt:value['Atualizado em'] || '',requests:parse('Solicitacoes',[]),dayBasis:value['Contagem de dias'] || 'period'};
  });
}
function sheetDate_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM-dd') : TravelHubModel.date(value);
}
function toSheetRow_(j) {
  const typedDate = text => text ? new Date(text + 'T12:00:00-03:00') : '';
  return [j.id,j.name,j.status,typedDate(j.startDate),typedDate(j.endDate),j.tags.join('; '),j.travelers.join('; '),j.artists.join('; '),JSON.stringify(j.locations),JSON.stringify(j.itinerary),JSON.stringify(j.plannedSnapshot || null),JSON.stringify(j.history || []),JSON.stringify(j.sourceRefs || []),j.version,j.createdAt || '',j.updatedAt || '',JSON.stringify(j.requests || []),j.dayBasis || 'period'];
}
function publicRecord_(j) { const result=TravelHubModel.clone(j); delete result.requests; return result; }
function doGet(e) {
  try {
    if (e?.parameter?.action !== 'list_journeys') return json_({ok:true,service:'travelhub',schemaVersion:2});
    return json_({ok:true,schemaVersion:2,journeys:readRecords_(db_()).map(publicRecord_)});
  } catch(error) { return json_({ok:false,message:error.message}); }
}
function doPost(e) {
  const lock=LockService.getScriptLock();
  try {
    const body=JSON.parse(e?.postData?.contents || '{}');
    if (body.action !== 'save_journey' || body.schemaVersion !== 2) throw new Error('Atualize o TravelHub para usar a nova base de viagens.');
    lock.waitLock(20000);
    const ss=db_(), records=readRecords_(ss), input=body.payload?.journey;
    if (!input) throw new Error('Viagem ausente.');
    const index=records.findIndex(j => j.id === input.id);
    const saved=TravelHubModel.save(records[index] || null,input,body.payload.expectedVersion,body.requestId,new Date().toISOString());
    const row=toSheetRow_(saved);
    if (row.some(v => typeof v === 'string' && v.length > 45000)) throw new Error('O conteúdo excede o tamanho suportado. Reduza as anotações.');
    const sheet=ss.getSheetByName('Viagens'), sheetRows=sheet.getDataRange().getValues();
    const actualIndex=sheetRows.findIndex((r,i)=>i>0 && String(r[0])===saved.id);
    sheet.getRange(actualIndex < 0 ? sheetRows.length+1 : actualIndex+1,1,1,V2_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();
    const persisted=readRecords_(ss).find(j => j.id === saved.id);
    if (!persisted || persisted.version !== saved.version) throw new Error('Não foi possível confirmar a gravação.');
    return json_({ok:true,schemaVersion:2,requestId:body.requestId,journey:publicRecord_(persisted),version:persisted.version});
  } catch(error) { return json_({ok:false,message:error.message}); }
  finally { if(lock.hasLock()) lock.releaseLock(); }
}
function legacyRows_(ss,name) {
  const values=ss.getSheetByName(name).getDataRange().getValues();
  return values.slice(1).map((row,i) => ({row:i+2,raw:Object.fromEntries(values[0].map((h,k) => [h,row[k]]).filter(pair => pair[0]))})).filter(entry => Object.values(entry.raw).some(v => v !== ''));
}
function legacyField_(raw, aliases) {
  const field=Object.keys(raw).find(h => aliases.map(TravelHubModel.key).includes(TravelHubModel.key(h)));
  return field ? raw[field] : '';
}
function buildMigration_(ss) {
  const base=legacyRows_(ss,'base'), plans=legacyRows_(ss,'Planejamento'), groups=new Map();
  base.forEach(entry => {
    const r=entry.raw, get=aliases => legacyField_(r,aliases);
    const name=String(get(['Viagem'])), oldId=String(get(['Id']));
    const start=sheetDate_(get(['Data de inicio'])),end=sheetDate_(get(['Data de fim']));
    // Only the two reviewed multi-stop journeys are consolidated automatically.
    const groupKey=name === 'MSC Seaside' && oldId === '17' ? 'msc-17' : name === 'Férias' && start === '2026-03-02' && end === '2026-03-06' && ['25','26','27'].includes(oldId) ? 'ferias-2026-03' : `base-row-${entry.row}`;
    const id=`legacy-${groupKey}`;
    if(!groups.has(id)) groups.set(id,{id,name,status:'concluida',startDate:start,endDate:end,tags:[],artists:[],travelers:[],locations:[],itinerary:{days:[],slots:{},notes:''},plannedSnapshot:null,history:[],sourceRefs:[],version:1,requests:[],createdAt:'',updatedAt:'',dayBasis:groupKey==='msc-17' ? 'stops':'period'});
    const j=groups.get(id);
    if(start < j.startDate) j.startDate=start;
    if((end || start) > (j.endDate || j.startDate)) j.endDate=end || start;
    ['tags','artists','travelers'].forEach((field,i) => j[field]=TravelHubModel.list([...j[field],...TravelHubModel.list(get([['Tags'],['Artistas'],['Acompanhantes']][i]))]));
    j.locations.push({id:`stop-base-${entry.row}`,country:get(['País','Pais']) || 'Brasil',city:get(['Cidade']),region:get(['UF/Regiao','UF']),startDate:start,endDate:end,destinationDays:TravelHubModel.number(get(['Dias na cidade'])),lat:TravelHubModel.number(get(['Latitude'])),lng:TravelHubModel.number(get(['Longitude'])),tags:TravelHubModel.list(get(['Tags'])),artists:TravelHubModel.list(get(['Artistas'])),travelers:TravelHubModel.list(get(['Acompanhantes']))});
    j.sourceRefs.push({sheet:'base',row:entry.row,legacyId:oldId,raw:r});
  });
  plans.forEach(entry => {
    const r=entry.raw,get=aliases => legacyField_(r,aliases),id=String(get(['Id','PlanId']));
    if([...groups.values()].some(j => j.sourceRefs.some(ref => String(legacyField_(ref.raw,['PlanId','Plan Id'])) === id))) throw new Error('Há um planejamento vinculado. Revise a correspondência antes de migrar.');
    const parse=(value,fallback) => value ? JSON.parse(value) : fallback;
    const originalStatus=TravelHubModel.key(get(['Status']));
    const j={id,name:get(['Viagem','Destino']),status:originalStatus.includes('efet') || id==='plan-1782008651327' ? 'concluida' : originalStatus.includes('cancel') ? 'cancelada':'planejada',startDate:sheetDate_(get(['Data de inicio'])),endDate:sheetDate_(get(['Data de fim'])),tags:TravelHubModel.list(get(['Tags'])),travelers:TravelHubModel.list(get(['Acompanhantes'])),artists:TravelHubModel.list(get(['Artistas'])),locations:parse(get(['Localizacoes']),[{country:get(['Pais']) || 'Brasil',city:get(['Cidade']),region:get(['UF/Regiao']),lat:get(['Latitude']),lng:get(['Longitude'])}]).map((l,i)=>({...l,id:`${id}-stop-${i+1}`,destinationDays:TravelHubModel.number(l.destinationDays)})),itinerary:parse(get(['Itinerario Diario']),{days:[],slots:{},notes:''}),sourceRefs:[{sheet:'Planejamento',row:entry.row,legacyId:id,raw:r}],version:1,requests:[],history:[],createdAt:String(get(['Criado em']) || ''),updatedAt:'',dayBasis:'period'};
    j.plannedSnapshot=TravelHubModel.snapshot(j);
    j.history=[{at:'',from:originalStatus,to:j.status,reason:id==='plan-1782008651327' ? 'Realização confirmada pelo proprietário durante a migração.' : 'Situação preservada da base original.'}];
    groups.set(id,j);
  });
  const journeys=[...groups.values()].map(TravelHubModel.normalize);
  const sources=journeys.flatMap(j=>j.sourceRefs).length,stops=journeys.reduce((n,j)=>n+j.locations.length,0);
  if(base.length!==35 || plans.length!==2 || sources!==37 || journeys.length!==33 || stops!==37) throw new Error(`Base alterada: ${base.length} registros, ${plans.length} planos, ${journeys.length} viagens e ${stops} paradas. Revise antes de migrar.`);
  return journeys;
}
function writeMigration_(ss,journeys) {
  const existing=ss.getSheetByName('Viagens');
  if(existing) {
    const records=readRecords_(ss);
    if(JSON.stringify(records.map(j=>j.id).sort())!==JSON.stringify(journeys.map(j=>j.id).sort())) throw new Error('A aba Viagens existente não corresponde à migração.');
    return records;
  }
  const sheet=ss.insertSheet('Viagens');
  sheet.getRange(1,1,journeys.length+1,V2_HEADERS.length).setValues([V2_HEADERS,...journeys.map(toSheetRow_)]);
  sheet.setFrozenRows(1); sheet.getRange(1,1,1,V2_HEADERS.length).setFontWeight('bold').setBackground('#0A2F4C').setFontColor('#ffffff');
  sheet.getRange(2,4,journeys.length,2).setNumberFormat('dd/mm/yyyy');
  sheet.setColumnWidth(2,220); sheet.setColumnWidths(3,3,130); sheet.setColumnWidths(6,3,200);
  sheet.hideColumns(9,10); sheet.getDataRange().createFilter();
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(['planejada','concluida','cancelada'],true).setAllowInvalid(false).build();
  sheet.getRange(2,3,sheet.getMaxRows()-1,1).setDataValidation(rule);
  SpreadsheetApp.flush();
  const records=readRecords_(ss);
  if(records.length!==33 || records.reduce((n,j)=>n+j.locations.length,0)!==37) throw new Error('Falha na conferência da migração.');
  return records;
}
function validarMigracao() {
  const ss=db_(),journeys=buildMigration_(ss),copy=ss.copy('TravelHub — teste de migração');
  const first=writeMigration_(copy,journeys),second=writeMigration_(copy,journeys);
  if(JSON.stringify(first)!==JSON.stringify(second)) throw new Error('A segunda execução modificou o resultado.');
  const props=PropertiesService.getScriptProperties();
  props.setProperty('MIGRATION_TEST_URL',copy.getUrl());
  props.setProperty('MIGRATION_SOURCE',migrationHash_(journeys));
  console.log(JSON.stringify({ok:true,journeys:first.length,stops:first.reduce((n,j)=>n+j.locations.length,0),repeatUnchanged:true,testUrl:copy.getUrl()}));
}
function publicarMigracao() {
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss=db_(),props=PropertiesService.getScriptProperties();
    if(props.getProperty('MIGRATION_PUBLISHED')==='2') { console.log('Migração já publicada. Nenhuma alteração.'); return; }
    const journeys=buildMigration_(ss);
    if(props.getProperty('MIGRATION_SOURCE')!==migrationHash_(journeys)) throw new Error('Valide uma cópia atual da base antes de publicar.');
    const backup=ss.copy('TravelHub — backup antes da base única');
    props.setProperty('MIGRATION_BACKUP_URL',backup.getUrl());
    writeMigration_(ss,journeys);
    // Originals remain recoverable in the complete backup and spreadsheet history.
    ['base','Planejamento'].forEach(name => { const sheet=ss.getSheetByName(name); if(sheet) ss.deleteSheet(sheet); });
    props.setProperty('MIGRATION_PUBLISHED','2');
    console.log(JSON.stringify({ok:true,journeys:33,stops:37,backupUrl:backup.getUrl(),sheetUrl:ss.getUrl()}));
  } finally { lock.releaseLock(); }
}
function migrationHash_(journeys) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(journeys))); }
