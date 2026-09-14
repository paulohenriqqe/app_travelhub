/* One canonical collection; legacy map/chart renderers receive read-only stop projections. */
const Journeys = (() => {
  const M=TravelHubModel, labels={planejada:'Planejada',concluida:'Concluída',cancelada:'Cancelada'};
  let records=[], filter='', query='', year='', region='', tag='', editor=null, busy=false, error='', loaded=false, itineraryReturn=false, readOnly=false, loading=false, deferredProject=false, revision=0;
  const $=id=>document.getElementById(id), esc=value=>escapeHtml(value);
  const uuid=()=>crypto.randomUUID();
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const find=id=>records.find(j=>j.id===id || j.locations.some(l=>l.id===id));
  const button=(text,action,id='',kind='small-action')=>`<button type="button" class="${kind}" data-journey-action="${action}" data-id="${esc(id)}">${text}</button>`;
  const notice=j=>M.situation(j,today());
  function project(persist=true) {
    state.trips=records.filter(j=>j.status==='concluida').flatMap(j=>j.locations.map(l=>({
      ...l,id:l.id,recordId:l.id,journeyId:j.id,name:j.name,startDate:j.startDate,endDate:j.endDate,year:j.startDate.slice(0,4),
      tags:l.tags || j.tags,artists:l.artists || j.artists,travelers:l.travelers || j.travelers,planId:'',origin:'manual',sourceLabel:'Viagem concluída',
      destinationDays:M.destinationDays(j,l),hasConfirmedCoords:l.lat!==null && l.lng!==null,
      searchIndex:[j.name,l.city,l.region,l.country,...j.tags,...j.artists,...j.travelers].join(' ').toLowerCase()
    })));
    state.plans=records.map(j=>({...j, destination:j.name, ...(j.locations[0] || {}),id:j.id,name:j.name,startDate:j.startDate,endDate:j.endDate,locations:j.locations,status:{planejada:'planejado',concluida:'efetivado',cancelada:'cancelado'}[j.status],year:j.startDate.slice(0,4),hasConfirmedCoords:j.locations[0]?.lat!=null && j.locations[0]?.lng!=null}));
    populateListsFromTrips(state.trips); populateFilters();
    state.loaded.trips=true;state.loaded.plans=true;state.errors.trips='';state.errors.plans='';
    applyFilters(); render(); updateSyncPill();
    if(persist)writeCachedJourneys({journeys:records});
  }
  async function request(body) {
    if(readOnly)throw new Error('Gravação indisponível. A integração precisa ser publicada no Google. Seus dados continuam no formulário.');
    try {return await send(body);}
    catch(error) {
      // A lost HTTP response is confirmed only by this exact persisted request and content.
      try {const saved=confirmedJourneyFromReceipt(await loadPublishedJourneyData(),body,M);if(saved)return saved;}catch {}
      throw error;
    }
  }
  async function send(body) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    let response;
    try {response=await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`, {method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});}
    catch {throw new Error('Sem confirmação de gravação. Seus dados continuam no formulário; tente novamente.');}
    finally {clearTimeout(timer);}
    let data;
    try { data=await response.json(); } catch { throw new Error('Resposta inválida. A gravação não foi confirmada; tente novamente.'); }
    if(!response.ok || data.ok!==true) throw new Error(data.message || 'Não foi possível confirmar a gravação.');
    if(data.schemaVersion!==2 || data.requestId!==body.requestId || data.journey?.id!==body.payload.journey.id || !Number.isInteger(data.version) || data.journey.version!==data.version) throw new Error('A confirmação recebida está incompleta. Tente novamente.');
    return data.journey;
  }
  function acceptData(data) {
    if(data.ok!==true || data.schemaVersion!==2 || !Array.isArray(data.journeys))throw new Error('Não foi possível carregar as viagens.');
    const ids=new Set();
    const incoming=data.journeys.map(raw=>{
      const {requests,sourceRefs,...value}=raw,j=M.normalize(value);
      if(ids.has(j.id))throw new Error('A base contém identificadores duplicados.');
      ids.add(j.id);return j;
    });
    const next=mergeJourneyVersions(records,incoming),changed=!loaded || JSON.stringify(next)!==JSON.stringify(records);
    records=next;readOnly=data.readOnly===true;loaded=true;error='';
    document.body.classList.remove('journeys-loading');
    if(changed){if(editor || busy){deferredProject=true;}else project(!data.cached);}
    if(!data.cached){writeCachedJourneys({journeys:records});$('sync-text').textContent='Atualizado';$('sync-pill').className='sync-pill online';}
  }
  async function load() {
    if(loading)return;
    loading=true;const current=++revision;
    if(!loaded){const cached=readCachedJourneys();if(cached){try{acceptData(cached);}catch{}}}
    error='';$('sync-text').textContent=loaded?'Atualizando…':'Carregando…';
    if(!loaded)document.body.classList.add('journeys-loading');
    try {
      const data=await loadJourneyData({onUpdate:next=>{if(current===revision){try{acceptData(next);}catch{}}}});
      if(current===revision)acceptData(data);
    } catch(e) {
      error=loaded?'Sem conexão. Seus dados salvos continuam disponíveis.':'Não foi possível carregar as viagens. Tente novamente.';
      $('sync-text').textContent=loaded?'Dados salvos':'Sem conexão';$('sync-pill').className='sync-pill warning';render();
      if(!loaded)showToast(error,'error');
    }finally{loading=false;document.body.classList.remove('journeys-loading');}
  }
  function render() {
    if(!$('journeys-list')) return;
    $('journeys-status').innerHTML=[['','Todas'],...Object.entries(labels).map(([k,v])=>[k,{planejada:'Planejadas',concluida:'Concluídas',cancelada:'Canceladas'}[k]])].map(([k,label])=>`<button type="button" class="j-filter ${filter===k?'selected':''}" aria-pressed="${filter===k}" data-status="${k}">${label} <span>${records.filter(j=>!k || j.status===k).length}</span></button>`).join('');
    const values=(field)=>[...new Set(records.flatMap(j=>field==='region'?j.locations.map(l=>l.region):field==='tag'?j.tags:[j.startDate.slice(0,4)]).filter(Boolean))].sort();
    [['j-year','year',year],['j-region','region',region],['j-tag','tag',tag]].forEach(([id,field,value])=>{ $(id).innerHTML=`<option value="">${{year:'Todos os anos',region:'Todas as regiões',tag:'Todas as tags'}[field]}</option>`+values(field).map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join(''); });
    const visible=records.filter(j=>(!filter || j.status===filter)&&(!year || j.startDate.startsWith(year))&&(!region || j.locations.some(l=>l.region===region))&&(!tag || j.tags.includes(tag))&&M.key([j.name,...j.locations.map(l=>`${l.city} ${l.region} ${l.country}`),...j.tags,...j.artists,...j.travelers].join(' ')).includes(M.key(query))).sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
    $('j-count').textContent=`${visible.length} ${visible.length===1?'viagem':'viagens'}`;
    $('j-error').innerHTML=error?`${esc(error)} ${button('Tentar novamente','refresh')}`:'';
    $('journeys-list').innerHTML=visible.map(j=>`<article class="j-row"><button class="j-open" data-journey-action="detail" data-id="${esc(j.id)}"><strong>${esc(j.name)}</strong><span>${esc(j.locations.map(l=>l.city).join(' · ') || 'Destino a definir')} · ${esc(formatDateRange(j.startDate,j.endDate))}</span></button><div class="j-row-end"><span class="j-status ${j.status}">${labels[j.status]}</span>${notice(j)?`<span class="j-notice">${notice(j)}</span>`:''}<div class="j-row-actions">${j.status==='planejada'?button('Concluir','complete',j.id):''}${button('Editar','edit',j.id)}</div></div></article>`).join('') || `<div class="empty-state">${loaded?'Nenhuma viagem nesse filtro.':'Carregando viagens…'}</div>`;
  }
  function detail(id) {
    const j=find(id);if(!j)return;
    closeModal();
    $('modal-header').innerHTML=`<span class="j-status ${j.status}">${labels[j.status]}</span><h2 class="trip-modal-title">${esc(j.name)}</h2><p>${esc(formatDateRange(j.startDate,j.endDate))}${j.startDate?` · ${M.travelDays(j)} ${j.dayBasis==='stops'?'dias registrados':'dias'}`:''}</p><div class="j-actions">${j.status==='planejada'?button('Concluir viagem','complete',j.id,'primary-action'):''}${button('Editar viagem','edit',j.id)}${j.status==='concluida'?button('Reabrir viagem','reopen',j.id):''}${j.status==='planejada'?button('Reagendar','edit',j.id)+button('Cancelar viagem','cancel',j.id):''}${j.status==='cancelada'?button('Retomar planejamento','reopen',j.id):''}</div>`;
    const summary=(items,label)=>items.length?`<p><strong>${label}</strong> ${esc(items.join(', '))}</p>`:'';
    const dayLabel=n=>n==null?'Dias a definir':`${n} ${n===1?'dia':'dias'}`;
    $('modal-body').innerHTML=`${notice(j)?`<p class="j-notice">${notice(j)}</p>`:''}<div class="j-stops">${j.locations.map(l=>`<div><strong>${esc(l.city)}</strong><span>${esc([l.region,l.country].filter(Boolean).join(', '))}</span><span>${dayLabel(M.destinationDays(j,l))}${l.startDate?` · ${esc(formatDateRange(l.startDate,l.endDate))}`:''}</span></div>`).join('')}</div><div class="j-detail-meta">${summary(j.tags,'Tags')}${summary(j.travelers,'Acompanhantes')}${summary(j.artists,'Artistas')}</div>${itineraryMarkup(j)}${j.plannedSnapshot || j.history?.length?`<div class="j-history-link">${button('Histórico da viagem','history',j.id)}</div>`:''}`;
    $('trip-modal').classList.add('open');refreshIcons();
  }
  function itineraryMarkup(j) {
    const filled=Object.values(j.itinerary?.slots || {}).some(day=>Object.values(day).some(v=>String(v || '').trim()));
    return `${filled?`<h3 class="j-section-title">Roteiro</h3>${renderItineraryTable(parseItinerary(j.itinerary,j.startDate,j.endDate),false,j.startDate,j.endDate)}`:''}${j.itinerary?.notes?`<p class="j-detail-notes">${esc(j.itinerary.notes)}</p>`:''}`;
  }
  function history(id) {
    const j=find(id);if(!j)return;
    $('modal-header').innerHTML=`<h2 class="trip-modal-title">Histórico da viagem</h2><p>${esc(j.name)}</p>${button('Voltar à viagem','detail',j.id)}`;
    const events=(j.history || []).slice().reverse().map(event=>`<li><strong>${labels[event.to] || 'Cadastro atualizado'}</strong>${event.at?`<time>${esc(formatDateShort(event.at.slice(0,10)))}</time>`:''}${event.reason?`<p>${esc(event.reason)}</p>`:''}</li>`).join('');
    const original=j.plannedSnapshot;
    $('modal-body').innerHTML=`${events?`<ol class="j-history-list">${events}</ol>`:''}${original?`<details class="j-original"><summary>Dados antes da conclusão</summary><p>${esc(formatDateRange(original.startDate,original.endDate))}</p><p>${esc(original.locations.map(l=>l.city).join(' · '))}</p>${original.travelers?.length?`<p>${esc(original.travelers.join(', '))}</p>`:''}${itineraryMarkup(original)}</details>`:''}`;
  }
  function open(id, status) {
    if(busy)return;
    if(!loaded) {showToast('Aguarde o carregamento da base antes de editar.','error');return;}
    const existing=find(id), j=existing?M.clone(existing):{id:uuid(),name:'',status:status||'planejada',startDate:'',endDate:'',locations:[],tags:[],travelers:[],artists:[],itinerary:{days:[],slots:{},notes:''},version:0};
    if(status)j.status=status;
    closeModal();
    resetPlanEditor({closeSheet:false});
    editor={journey:j,original:existing?M.clone(existing):null,requestId:uuid(),payload:null};
    state.editingPlanId=j.id;
    $('plan-name').value=j.name;$('plan-start').value=j.startDate;$('plan-end').value=j.endDate;
    state.formPlanTags=[...j.tags];state.formPlanArtists=[...j.artists];state.formPlanCompanions=[...j.travelers];
    state.currentPlanDraftItinerary=M.clone(j.itinerary);
    state.formPlanCities=[];planCityBlockCounter=0;$('plan-city-blocks').innerHTML='';
    (j.locations.length?j.locations:[{}]).forEach(l=>addPlanCityBlock({...l,stopId:l.id || uuid(),stopStart:l.startDate||'',stopEnd:l.endDate||'',stopMetadata:{tags:l.tags,artists:l.artists,travelers:l.travelers}}));
    renderPlanTaxonomies();
    $('j-editor-title').textContent=status==='concluida' && existing?.status==='planejada'?'Concluir viagem':existing?'Editar viagem':'Nova viagem';
    $('j-editor-mode').innerHTML=existing?`<span class="j-status ${j.status}">${labels[j.status]}</span>`:`<label>Situação <select id="j-create-status"><option value="planejada" ${j.status==='planejada'?'selected':''}>Planejar viagem</option><option value="concluida" ${j.status==='concluida'?'selected':''}>Já realizada</option></select></label>`;
    $('save-plan-btn').textContent=status==='concluida' && existing?.status==='planejada'?'Concluir viagem':'Salvar viagem';
    $('plan-editor-title').textContent='';$('plan-status').closest('.field').hidden=true;
    $('plan-editor-panel').querySelectorAll('.form-shell-header').forEach(el=>el.hidden=true);
    $('plan-editor-panel').querySelectorAll('label').forEach(el=>{if(el.textContent.trim()==='Cidades planejadas')el.textContent='Destinos';});
    $('cancel-plan-edit-btn').style.display='none';
    $('j-editor-body').appendChild($('plan-editor-panel'));
    $('j-editor-notes').value=j.itinerary.notes || '';
    $('plan-editor-panel').insertBefore($('j-editor-notes').closest('label'),$('plan-editor-panel').querySelector('.form-actions-row'));
    $('journey-editor').showModal(); $('plan-name').focus();
  }
  function closeEditor() {
    if(busy)return;
    if(editor && editorDirty() && !confirm('Descartar as alterações desta viagem?'))return;
    $('journey-editor').close();restorePlanEditorPanel();editor=null;
    if(deferredProject){deferredProject=false;project();}
  }
  function draft() {
    const j=M.clone(editor.journey);
    j.name=$('plan-name').value;j.startDate=$('plan-start').value;j.endDate=$('plan-end').value;
    j.status=$('j-create-status')?.value || j.status;
    j.tags=[...state.formPlanTags];j.artists=[...state.formPlanArtists];j.travelers=[...state.formPlanCompanions];
    j.locations=state.formPlanCities.filter(l=>l.city || l.region || l.stopStart || l.stopEnd).map(l=>{
      const result={...l.stopMetadata,...buildLocationDraft(l),id:l.stopId,startDate:l.stopStart||'',endDate:l.stopEnd||''};
      ['stopId','stopStart','stopEnd','stopMetadata'].forEach(field=>delete result[field]);
      ['tags','artists','travelers'].forEach(field=>{if(JSON.stringify(j[field])!==JSON.stringify(editor.journey[field]))result[field]=[...j[field]];});
      return result;
    });
    j.itinerary=M.clone(state.currentPlanDraftItinerary || j.itinerary);j.itinerary.notes=$('j-editor-notes').value;
    return j;
  }
  function editorDirty() {
    if(!editor)return false;
    const view=j=>({...M.snapshot(j),locations:j.locations.map(l=>['id','country','region','city','destinationDays','lat','lng','startDate','endDate'].map(k=>l[k] ?? ''))});
    return JSON.stringify(view(draft()))!==JSON.stringify(view(editor.journey));
  }
  async function save() {
    if(!editor || busy)return;
    try {
      const j=M.normalize(draft()),serial=JSON.stringify(j);
      // Reuse exactly the same request after an uncertain response, but not after editing it.
      if(editor.payload && editor.payload!==serial)editor.requestId=uuid();
      editor.payload=serial;
      busy=true;$('save-plan-btn').disabled=true;$('j-editor-close').disabled=true;$('j-editor-body').inert=true;$('j-editor-mode').inert=true;$('j-editor-notes').disabled=true;$('plan-message').textContent='Salvando…';
      const persisted=await request({action:'save_journey',schemaVersion:2,requestId:editor.requestId,payload:{journey:j,expectedVersion:editor.journey.version || 0}});
      records=[...records.filter(r=>r.id!==persisted.id),M.normalize(persisted)];
      busy=false;$('journey-editor').close();restorePlanEditorPanel();editor=null;project();detail(persisted.id);showToast('Viagem salva.','success');
    } catch(e) {$('plan-message').textContent=e.message;showToast(e.message,'error');}
    finally {busy=false;$('save-plan-btn').disabled=false;$('j-editor-close').disabled=false;$('j-editor-body').inert=false;$('j-editor-mode').inert=false;$('j-editor-notes').disabled=false;}
  }
  async function change(id,status) {
    const j=find(id);if(!j || busy)return;
    const text=status==='cancelada'?'Cancelar esta viagem? O cadastro será preservado.':'Reabrir o planejamento desta viagem? O histórico será preservado.';
    if(!confirm(text))return;
    busy=true;
    try {
      const saved=await request({action:'save_journey',schemaVersion:2,requestId:uuid(),payload:{journey:{...j,status},expectedVersion:j.version}});
      records=records.map(r=>r.id===saved.id?saved:r);project();detail(saved.id);showToast('Situação atualizada.','success');
    }catch(e){showToast(e.message,'error');}finally{busy=false;}
  }
  function install() {
    $('page-title').innerHTML='Suas <em>viagens</em>';
    document.querySelectorAll('[data-view="planejar"]').forEach(el=>{el.innerHTML='<i data-lucide="luggage"></i> Viagens';el.dataset.view='journeys';});
    document.querySelector('.brand-name span').textContent='SUAS VIAGENS';
    const container=document.createElement('section');container.id='view-journeys';container.className='view';
    container.innerHTML=`<div class="j-toolbar"><div id="journeys-status" class="j-filters"></div>${button('Atualizar','refresh')}</div><div class="j-search"><input id="j-search" class="control" placeholder="Buscar viagem, cidade ou companhia" aria-label="Buscar viagens"><select id="j-year" class="control" aria-label="Ano"></select><select id="j-region" class="control" aria-label="Região"></select><select id="j-tag" class="control" aria-label="Tag"></select>${button('Limpar','clear')}</div><div id="j-error" role="alert"></div><p id="j-count"></p><div id="journeys-list"></div>`;
    document.querySelector('.content').appendChild(container);
    const dialog=document.createElement('dialog');dialog.id='journey-editor';dialog.className='j-editor';dialog.setAttribute('aria-labelledby','j-editor-title');
    dialog.innerHTML=`<header><h2 id="j-editor-title">Nova viagem</h2><button id="j-editor-close" type="button" aria-label="Fechar editor">×</button></header><div id="j-editor-mode"></div><div id="j-editor-body"></div><label class="j-notes">Anotações<textarea id="j-editor-notes" class="control" rows="3"></textarea></label>`;
    document.body.appendChild(dialog);$('j-editor-close').onclick=closeEditor;
    dialog.addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    $('j-search').addEventListener('input',e=>{query=e.target.value;render();});
    $('j-year').addEventListener('change',e=>{year=e.target.value;render();});$('j-region').addEventListener('change',e=>{region=e.target.value;render();});$('j-tag').addEventListener('change',e=>{tag=e.target.value;render();});
    document.addEventListener('click',e=>{
      const status=e.target.closest('[data-status]');if(status){filter=status.dataset.status;render();return;}
      const target=e.target.closest('[data-journey-action]');if(!target)return;
      const {journeyAction:action,id}=target.dataset;
      if(action==='detail')detail(id);if(action==='history')history(id);if(action==='all')switchView('journeys');if(action==='edit')open(id);if(action==='complete')open(id,'concluida');if(action==='cancel')change(id,'cancelada');if(action==='reopen')change(id,'planejada');if(action==='refresh')load();
      if(action==='clear'){query='';year='';region='';tag='';$('j-search').value='';render();}
    });
    window.addEventListener('beforeunload',e=>{if(editorDirty() || busy){e.preventDefault();e.returnValue='';}});
    render();refreshIcons();
  }
  return {install,load,render,open,detail,save,find,records:()=>records,beginItinerary:()=>{itineraryReturn=true;$('journey-editor').close();},returnItinerary:()=>{if(itineraryReturn){itineraryReturn=false;$('journey-editor').showModal();}},isEditing:()=>!!editor};
})();

// Route all visible entry points to the unified lifecycle before existing events bind.
loadData=()=>Journeys.load();
fetchTrips=()=>Journeys.load();fetchPlans=async()=>{};
salvarPlanejamento=()=>Journeys.save();
openFreshTripEditor=()=>Journeys.open();
handleTopbarPrimaryAction=()=>Journeys.open();
beginPlanEdit=id=>Journeys.open(id);beginTripEdit=id=>Journeys.open(id);
openPlanDetailModal=id=>Journeys.detail(id);openTripModal=id=>Journeys.detail(id);
startPlanConversion=id=>Journeys.open(id,'concluida');
postToAppsScript=async()=>{throw new Error('Atualize o aplicativo para usar a base unificada.');};
renderPlanningExperience=()=>Journeys.render();
const legacySwitchView=switchView;
switchView=view=>{if(view==='editor'){Journeys.open();return;}if(view==='planejar')view='journeys';legacySwitchView(view);if(view==='journeys')document.getElementById('page-title').textContent='Viagens';};
updateTopbarPrimaryAction=()=>{const b=document.getElementById('topbar-primary-action');if(b){b.style.display='inline-flex';b.innerHTML='<i data-lucide="plus"></i> Nova viagem';}};
getJourneyKey=trip=>trip.journeyId || trip.id;
getJourneyGroups=trips=>{const groups=new Map();trips.forEach(t=>{const id=t.journeyId || t.id;if(!groups.has(id)){const j=Journeys.find(id);groups.set(id,{...t,id,key:id,journeyId:id,name:j?.name || t.name,trips:[],cities:[]});}const g=groups.get(id);g.trips.push(t);if(!g.cities.includes(t.city))g.cities.push(t.city);g.count=g.trips.length;});return [...groups.values()].sort((a,b)=>b.startDate.localeCompare(a.startDate));};
const oldBuildMapCollections=buildMapCollections;
buildMapCollections=()=>{
  const collections=oldBuildMapCollections();
  [collections.countries,collections.regions,collections.cities].forEach(map=>map.forEach(item=>{item.trips=getJourneyGroups(item.trips);}));
  return collections;
};
getTripTotalDays=trip=>{const j=Journeys.find(trip.journeyId || trip.id);return j?TravelHubModel.travelDays(j):TravelHubModel.days(trip.startDate,trip.endDate).length;};
getTripDestinationDays=trip=>trip.destinationDays ?? 0;
renderTripContextChips=()=>'';
renderDashboardResults=()=>{
  const active=getActiveFilterSummary(),groups=getJourneyGroups(state.filtered),visible=active?groups:groups.slice(0,8);
  els['result-count'].innerHTML=`<span>${active?escapeHtml(formatCountLabel(groups.length,'viagem encontrada','viagens encontradas')):'Últimas viagens'}</span>${active?`<button class="filter-return" onclick="clearFilters()">Limpar filtro · ${escapeHtml(active)}</button>`:`<button class="text-action" data-journey-action="all">Ver todas (${groups.length}) <span aria-hidden="true">→</span></button>`}`;
  els['dashboard-results'].innerHTML=visible.length?`<div class="home-journeys">${visible.map(j=>`<button class="home-trip" data-journey-action="detail" data-id="${escapeHtml(j.id)}"><span class="home-trip-date">${escapeHtml(formatDateShort(j.startDate))}</span><span class="home-trip-main"><strong>${escapeHtml(j.name)}</strong><span>${escapeHtml(formatTripLocation(j))}</span></span><span class="home-trip-days">${getTripTotalDays(j)} ${getTripTotalDays(j)===1?'dia':'dias'}</span><span class="home-trip-arrow" aria-hidden="true">›</span></button>`).join('')}</div>`:`<div class="empty-state compact-empty">Nenhuma viagem nesse filtro.</div>`;
};
const oldBuildLocationDraft=buildLocationDraft;
buildLocationDraft=l=>({...oldBuildLocationDraft(l),lat:TravelHubModel.number(l?.lat),lng:TravelHubModel.number(l?.lng),stopId:l?.stopId || l?.id,stopStart:l?.stopStart || l?.startDate || '',stopEnd:l?.stopEnd || l?.endDate || '',stopMetadata:l?.stopMetadata});
const oldAddPlanCityBlock=addPlanCityBlock;
addPlanCityBlock=l=>oldAddPlanCityBlock({...l,stopId:l?.stopId || crypto.randomUUID()});
const oldRenderPlanCityBlock=renderPlanCityBlock;
renderPlanCityBlock=id=>{
  oldRenderPlanCityBlock(id);
  const l=state.formPlanCities.find(l=>l.id===id),block=document.getElementById(`plan-city-block-${id}`);if(!l || !block)return;
  block.insertAdjacentHTML('beforeend',`<div class="j-stop-dates"><label>Chegada <input class="control" type="date" data-stop-start value="${escapeHtml(l.stopStart||'')}"></label><label>Saída <input class="control" type="date" data-stop-end value="${escapeHtml(l.stopEnd||'')}"></label></div>`);
  block.querySelector('[data-stop-start]').onchange=e=>l.stopStart=e.target.value;block.querySelector('[data-stop-end]').onchange=e=>l.stopEnd=e.target.value;
};
const oldItineraryModal=openPlanItineraryDraftModal;
openPlanItineraryDraftModal=(...args)=>{if(Journeys.isEditing())Journeys.beginItinerary();oldItineraryModal(...args);};
const oldCloseModal=closeModal;
closeModal=()=>{oldCloseModal();Journeys.returnItinerary();};
const oldFormatTripLocation=formatTripLocation;
formatTripLocation=t=>t.trips?.length>1?t.trips.map(l=>`${l.city}, ${l.region || l.country}`).join(' · '):oldFormatTripLocation(t);
getDestinationDaysForRows=(group,rows,mode)=>{
  const j=Journeys.find(group.journeyId || group.id);
  if(mode==='countries' && j && new Set(j.locations.map(l=>l.country)).size===1)return TravelHubModel.travelDays(j);
  return rows.reduce((sum,row)=>sum+(row.destinationDays ?? 0),0);
};
buildListCounts=title=>{
  const counts={};
  getJourneyGroups(state.filtered).forEach(g=>{
    const values=g.trips.flatMap(t=>title.includes('Ano')?[t.year]:title.includes('País')?[t.country]:isRegionCollectionTitle(title)?[t.region || t.uf]:isLocationCollectionTitle(title)?[getTripLocationLabel(t)]:title.includes('Motivo') || title.includes('Tag')?t.tags:title.includes('Companhia') || title.includes('Acompanhante')?t.travelers:title.includes('Artista')?t.artists:[]);
    new Set(values.filter(Boolean)).forEach(v=>counts[v]=(counts[v]||0)+1);
  });return counts;
};
normalizeDraftItineraryForDates=(source,start,end)=>{
  const dates=[...new Set([...getDaysBetween(start,end),...(source?.days || [])])].sort();
  return {days:dates,slots:Object.fromEntries(dates.map(day=>[day,{manha:'',tarde:'',noite:'',...source?.slots?.[day]}])),notes:source?.notes || ''};
};
