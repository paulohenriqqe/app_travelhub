/* Shared travel lifecycle rules. Also bundled into the Apps Script deployment. */
var TravelHubModel = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function date(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    let text = String(value).trim();
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (br) text = `${br[3].length === 2 ? '20' : ''}${br[3]}-${br[2]}-${br[1]}`;
    text = text.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Data inválida.');
    const parsed = new Date(text + 'T12:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('Data inválida.');
    return text;
  }
  function days(start, end) {
    if (!start) return [];
    start = date(start); end = date(end || start);
    if (end < start) throw new Error('A data final deve ser igual ou posterior à inicial.');
    const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    if (count > 3660) throw new Error('Revise o período da viagem.');
    return Array.from({length: count}, (_, i) => new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10));
  }
  function number(value) {
    if (value === '' || value == null) return null;
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function list(value) {
    return [...new Set((Array.isArray(value) ? value : String(value || '').split(';')).map(v => String(v).trim()).filter(Boolean))];
  }
  function situation(journey, today) {
    if (journey.status !== 'planejada') return '';
    if (journey.endDate && journey.endDate < today) return 'Aguardando conclusão';
    if (journey.startDate && journey.startDate <= today && (!journey.endDate || journey.endDate >= today)) return 'Em viagem';
    return '';
  }
  function normalize(input) {
    const j = clone(input);
    j.id = String(j.id || '').trim();
    j.name = String(j.name || '').trim();
    if (!j.id || !j.name) throw new Error('Informe o nome da viagem.');
    if (!['planejada', 'concluida', 'cancelada'].includes(j.status)) throw new Error('Situação inválida.');
    j.startDate = date(j.startDate); j.endDate = date(j.endDate);
    if (j.endDate && !j.startDate) throw new Error('Informe a data inicial.');
    if (j.startDate) days(j.startDate, j.endDate);
    j.tags = list(j.tags); j.artists = list(j.artists); j.travelers = list(j.travelers);
    const ids = new Set();
    j.locations = (j.locations || []).map(raw => {
      const l = clone(raw);
      l.id = String(l.id || '').trim();
      if (!l.id || ids.has(l.id)) throw new Error('As paradas precisam ter identificadores distintos.');
      ids.add(l.id);
      l.city = String(l.city || '').trim(); l.country = String(l.country || 'Brasil').trim();
      l.region = String(l.region || l.uf || '').trim();
      if (!l.city || !l.country || (key(l.country) === 'brasil' && !l.region)) throw new Error('Complete país, cidade e UF de todas as paradas.');
      l.uf = key(l.country) === 'brasil' ? l.region : '';
      l.startDate = date(l.startDate); l.endDate = date(l.endDate);
      if (l.endDate && !l.startDate) throw new Error('Informe a data inicial da parada.');
      if (l.startDate) days(l.startDate, l.endDate);
      if (j.startDate && l.startDate && l.startDate < j.startDate || j.endDate && (l.endDate || l.startDate) > j.endDate) throw new Error('As datas das paradas devem estar dentro do período da viagem.');
      l.destinationDays = number(l.destinationDays);
      if (l.destinationDays !== null && (!Number.isInteger(l.destinationDays) || l.destinationDays < 1)) throw new Error('Dias na cidade deve ser um número inteiro positivo.');
      const limit = l.startDate ? days(l.startDate, l.endDate).length : (j.startDate ? days(j.startDate, j.endDate).length : null);
      if (limit && l.destinationDays > limit) throw new Error('Dias na cidade excede o período informado.');
      l.lat = number(l.lat); l.lng = number(l.lng);
      if (l.lat === null || l.lng === null) { l.lat = null; l.lng = null; }
      if (l.lat !== null && (Math.abs(l.lat) > 90 || Math.abs(l.lng) > 180)) throw new Error('Coordenadas inválidas.');
      return l;
    });
    if (j.status === 'concluida' && (!j.startDate || !j.locations.length)) throw new Error('Para concluir, informe a data inicial e pelo menos uma cidade.');
    j.itinerary = j.itinerary || {days: [], slots: {}, notes: ''};
    return j;
  }
  function snapshot(j) {
    return clone({name:j.name, startDate:j.startDate, endDate:j.endDate, locations:j.locations, tags:j.tags, artists:j.artists, travelers:j.travelers, itinerary:j.itinerary});
  }
  function save(current, input, expectedVersion, requestId, now) {
    if (!requestId) throw new Error('Solicitação sem identificador. Atualize o aplicativo.');
    if (current && (current.requests || []).includes(requestId)) return clone(current);
    if (Number(expectedVersion) !== Number(current?.version || 0)) throw new Error('Esta viagem foi alterada em outra sessão. Recarregue os dados antes de salvar.');
    const next = normalize(input);
    if (current && current.id !== next.id) throw new Error('Identificador da viagem não pode mudar.');
    next.plannedSnapshot = current?.plannedSnapshot || null;
    if (current?.status === 'planejada' && next.status === 'concluida' && !next.plannedSnapshot) next.plannedSnapshot = snapshot(current);
    next.sourceRefs = current?.sourceRefs || [];
    next.history = current?.history || [];
    if (current && current.status !== next.status) next.history = [...next.history, {from:current.status, to:next.status, at:now, snapshot:snapshot(current)}];
    next.createdAt = current?.createdAt || now;
    next.updatedAt = now; next.version = (current?.version || 0) + 1;
    next.requests = [...(current?.requests || []), requestId];
    next.dayBasis = current?.dayBasis || 'period';
    return next;
  }
  function travelDays(j) {
    if (j.dayBasis === 'stops') return new Set(j.locations.flatMap(l => days(l.startDate, l.endDate))).size;
    return days(j.startDate, j.endDate).length;
  }
  function destinationDays(j, l) {
    if (l.destinationDays != null) return l.destinationDays;
    if (l.startDate) return days(l.startDate, l.endDate).length;
    return j.locations.length === 1 ? travelDays(j) : null;
  }
  return {clone, key, date, days, number, list, situation, normalize, snapshot, save, travelDays, destinationDays};
})();
if (typeof module !== 'undefined') module.exports = TravelHubModel;
