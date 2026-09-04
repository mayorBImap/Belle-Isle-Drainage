(() => {
  'use strict';

  const SERVICES = {
    core: 'https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data2/MapServer',
    iworq: 'https://ocgis4.ocfl.net/arcgis/rest/services/iWorQ/MapServer',
    context: 'https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data/MapServer'
  };
  const INITIAL_CENTER = [28.461, -81.351];
  const INITIAL_ZOOM = 13;
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 20;

  const layerConfigs = [
    { key:'core-2', service:'core', id:2, group:'Core drainage assets', name:'Drainwells', color:'#7b4aa5', shape:'point', visible:true, network:true },
    { key:'core-3', service:'core', id:3, group:'Core drainage assets', name:'Major control structures', color:'#c75b12', shape:'point', visible:true, network:true },
    { key:'core-4', service:'core', id:4, group:'Core drainage assets', name:'Pollution control devices', color:'#666f75', shape:'point', visible:false, network:true },
    { key:'core-5', service:'core', id:5, group:'Core drainage assets', name:'Stormwater structures / inlets', color:'#a8352c', shape:'point', visible:true, network:true },
    { key:'core-6', service:'core', id:6, group:'Core drainage assets', name:'Ditches / swales', color:'#16866e', shape:'line', visible:true, network:true },
    { key:'core-7', service:'core', id:7, group:'Core drainage assets', name:'Stormwater pipes', color:'#1f69a0', shape:'line', visible:true, network:true },
    { key:'core-8', service:'core', id:8, group:'Core drainage assets', name:'Stormwater ponds', color:'#2b83bd', shape:'polygon', visible:true, network:true },

    { key:'iworq-4', service:'iworq', id:4, group:'Additional infrastructure', name:'Primary canals', color:'#075985', shape:'line', visible:true, network:true },
    { key:'iworq-5', service:'iworq', id:5, group:'Additional infrastructure', name:'Primary canal segments', color:'#0e7490', shape:'line', visible:false, network:true },
    { key:'iworq-7', service:'iworq', id:7, group:'Additional infrastructure', name:'Stormwater pump stations', color:'#78350f', shape:'point', visible:true, network:true },
    { key:'iworq-9', service:'iworq', id:9, group:'Additional infrastructure', name:'Control structures', color:'#b45309', shape:'point', visible:false, network:true },
    { key:'iworq-10', service:'iworq', id:10, group:'Additional infrastructure', name:'Stormwater ponds — iWorQ', color:'#0284c7', shape:'polygon', visible:false, network:true },
    { key:'iworq-11', service:'iworq', id:11, group:'Additional infrastructure', name:'Secondary canals', color:'#0891b2', shape:'line', visible:true, network:true },
    { key:'iworq-12', service:'iworq', id:12, group:'Additional infrastructure', name:'County-maintained culverts', color:'#dc4a27', shape:'line', visible:true, network:true },
    { key:'iworq-13', service:'iworq', id:13, group:'Additional infrastructure', name:'Pond structures', color:'#6d28d9', shape:'point', visible:false, network:true },
    { key:'iworq-14', service:'iworq', id:14, group:'Additional infrastructure', name:'Major drainage structures', color:'#7c2d12', shape:'point', visible:true, network:true },

    { key:'context-28', service:'context', id:28, group:'Planning context', name:'Hydrology / water bodies', color:'#5da9d6', shape:'polygon', visible:false, network:false },
    { key:'context-33', service:'context', id:33, group:'Planning context', name:'Major drainage basins', color:'#59636b', shape:'polygon', visible:false, network:false, dashed:true }
  ];

  const state = {
    map: null,
    cityBoundaryFeature: null,
    cityBounds: null,
    layers: new Map(),
    data: new Map(),
    rawCounts: new Map(),
    featureIndex: [],
    networkNodes: [],
    traceLayer: null,
    traceMarker: null,
    traceMode: false,
    loading: false,
    flags: [],
    activeFlagFilter: 'all'
  };

  const el = id => document.getElementById(id);
  const loadingBanner = el('loadingBanner');
  const totalCount = el('totalCount');
  const countsEl = el('counts');
  const layerControls = el('layerControls');
  const legendItems = el('legendItems');

  function safeText(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function setLoading(message, visible = true) {
    loadingBanner.textContent = message;
    loadingBanner.style.display = visible ? 'block' : 'none';
  }

  function serviceUrl(config) {
    return SERVICES[config.service];
  }

  function objectId(feature) {
    const p = feature.properties || {};
    return p.OBJECTID ?? p.ObjectID ?? p.objectid ?? p.FID ?? '?';
  }

  function featurePopup(config, feature) {
    const props = feature.properties || {};
    const rows = Object.entries(props)
      .filter(([,v]) => v !== null && v !== '' && typeof v !== 'object')
      .slice(0, 28)
      .map(([k,v]) => `<tr><td>${safeText(k)}</td><td>${safeText(formatFieldValue(k,v))}</td></tr>`)
      .join('');
    return `<div class="popup-title">${safeText(config.name)}</div><div class="status-text">Source: Orange County ${safeText(config.service === 'iworq' ? 'iWorQ' : config.service === 'context' ? 'Open Data' : 'AGOL Open Data2')} • Layer ${config.id}</div><table class="popup-table">${rows || '<tr><td colspan="2">No attributes published.</td></tr>'}</table>`;
  }

  function formatFieldValue(key, value) {
    if (typeof value === 'number' && /date/i.test(key) && value > 100000000000) {
      try { return new Date(value).toLocaleDateString(); } catch (_) { return value; }
    }
    return value;
  }

  function styleFor(config) {
    return {
      color: config.color,
      weight: config.shape === 'line' ? 4 : config.dashed ? 2 : 2,
      opacity: config.shape === 'polygon' ? .75 : .94,
      fillColor: config.color,
      fillOpacity: config.shape === 'polygon' ? (config.dashed ? .015 : .10) : .72,
      dashArray: config.dashed ? '8 6' : null
    };
  }

  function pointToLayer(config, _feature, latlng) {
    return L.circleMarker(latlng, {
      radius: config.id === 5 && config.service === 'core' ? 5 : 6,
      color: '#ffffff', weight: 1.3, fillColor: config.color, fillOpacity: .96
    });
  }

  function buildControls() {
    let lastGroup = '';
    layerConfigs.forEach(config => {
      if (config.group !== lastGroup) {
        const title = document.createElement('div');
        title.className = 'group-title';
        title.textContent = config.group;
        layerControls.appendChild(title);
        lastGroup = config.group;
      }
      const label = document.createElement('label');
      label.className = 'layer-toggle';
      label.innerHTML = `<input type="checkbox" data-layer="${config.key}" ${config.visible ? 'checked' : ''}><span class="swatch" style="background:${config.color}"></span><span>${safeText(config.name)}</span><span class="layer-count" id="layer-count-${config.key}">0</span>`;
      layerControls.appendChild(label);

      const legend = document.createElement('div');
      legend.className = 'legend-row';
      legend.innerHTML = `${config.shape === 'point' ? `<span class="legend-dot" style="background:${config.color}"></span>` : `<span class="legend-line" style="background:${config.color}"></span>`}<span>${safeText(config.name)}</span>`;
      legendItems.appendChild(legend);
    });

    layerControls.addEventListener('change', event => {
      const input = event.target.closest('input[data-layer]');
      if (!input) return;
      const group = state.layers.get(input.dataset.layer);
      if (!group) return;
      if (input.checked) group.addTo(state.map); else state.map.removeLayer(group);
      updateCounts();
    });
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(INITIAL_CENTER, INITIAL_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    L.control.scale({ imperial: true, metric: false }).addTo(state.map);
    state.traceLayer = L.layerGroup().addTo(state.map);
    state.map.on('click', event => {
      if (state.traceMode) runPlanningTrace(event.latlng);
    });
  }

  async function arcgisGeoJSON(configOrService, layerId, params = {}) {
    const baseService = typeof configOrService === 'string' ? SERVICES[configOrService] : serviceUrl(configOrService);
    const url = new URL(`${baseService}/${layerId}/query`);
    const base = {
      f:'geojson', where:'1=1', outFields:'*', returnGeometry:'true', outSR:'4326', resultRecordCount:String(PAGE_SIZE)
    };
    Object.entries({ ...base, ...params }).forEach(([k,v]) => url.searchParams.set(k, String(v)));
    const response = await fetch(url.toString(), { mode:'cors' });
    if (!response.ok) throw new Error(`GIS request failed (${response.status})`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'ArcGIS query error');
    return data;
  }

  async function loadBoundary() {
    const data = await arcgisGeoJSON('core', 10, { resultRecordCount: 100 });
    const belle = (data.features || []).find(feature => Object.values(feature.properties || {}).some(v => typeof v === 'string' && v.trim().toLowerCase() === 'belle isle'));
    if (!belle) throw new Error('Belle Isle boundary was not found in the County jurisdiction layer.');
    const boundaryLayer = L.geoJSON(belle, { style:{ color:'#123e5a', weight:4, dashArray:'9 7', fillColor:'#123e5a', fillOpacity:.025 } }).addTo(state.map);
    boundaryLayer.bindTooltip('City of Belle Isle boundary', { sticky:true });
    state.cityBoundaryFeature = belle;
    state.cityBounds = boundaryLayer.getBounds();
    state.map.fitBounds(state.cityBounds.pad(.03));
    window.setTimeout(() => state.map.invalidateSize(), 100);
  }

  function envelopeFromBounds(bounds) {
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  }

  async function fetchAllInCityEnvelope(config) {
    const features = [];
    const geometry = envelopeFromBounds(state.cityBounds.pad(.04));
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await arcgisGeoJSON(config, config.id, {
        geometry, geometryType:'esriGeometryEnvelope', inSR:'4326', spatialRel:'esriSpatialRelIntersects',
        resultOffset:String(page * PAGE_SIZE), resultRecordCount:String(PAGE_SIZE)
      });
      const chunk = data.features || [];
      features.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }
    return { type:'FeatureCollection', features: clipFeaturesToCity(features, config) };
  }

  function clipFeaturesToCity(features, config) {
    if (!state.cityBoundaryFeature || !window.turf) return features;
    const boundary = state.cityBoundaryFeature;
    return features.filter(feature => {
      try {
        if (!feature.geometry) return false;
        if (feature.geometry.type === 'Point') return turf.booleanPointInPolygon(feature, boundary);
        return turf.booleanIntersects(feature, boundary);
      } catch (_) {
        return true;
      }
    });
  }

  async function loadLayer(config) {
    const geojson = await fetchAllInCityEnvelope(config);
    const group = L.geoJSON(geojson, {
      style: () => styleFor(config),
      pointToLayer: (feature, latlng) => pointToLayer(config, feature, latlng),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(featurePopup(config, feature), { maxWidth:430, maxHeight:340 });
        layer.on('click', e => {
          L.DomEvent.stopPropagation(e);
          if (state.traceMode && config.network) {
            const latlng = representativeLatLng(feature);
            runPlanningTrace(latlng, `${config.name} #${objectId(feature)}`);
          }
        });
      }
    });
    state.layers.set(config.key, group);
    state.data.set(config.key, geojson);
    state.rawCounts.set(config.key, geojson.features.length);
    if (config.visible) group.addTo(state.map);
    const countLabel = el(`layer-count-${config.key}`);
    if (countLabel) countLabel.textContent = geojson.features.length.toLocaleString();
    geojson.features.forEach(feature => state.featureIndex.push({ config, feature, layerGroup:group }));
  }

  function updateCounts() {
    countsEl.innerHTML = '';
    let total = 0;
    layerConfigs.filter(c => c.group !== 'Planning context').forEach(config => {
      const input = layerControls.querySelector(`input[data-layer="${config.key}"]`);
      const shown = Boolean(input && input.checked);
      const count = state.rawCounts.get(config.key) || 0;
      if (shown) total += count;
      const row = document.createElement('div');
      row.className = 'count-row';
      row.innerHTML = `<span>${safeText(config.name)}</span><strong>${shown ? count.toLocaleString() : 'off'}</strong>`;
      countsEl.appendChild(row);
    });
    totalCount.textContent = total.toLocaleString();
  }

  async function loadAll() {
    if (state.loading) return;
    state.loading = true;
    setLoading('Loading Belle Isle boundary…', true);
    try {
      state.layers.forEach(group => state.map.removeLayer(group));
      state.layers.clear(); state.data.clear(); state.rawCounts.clear(); state.featureIndex = []; state.flags = [];
      clearTrace();
      if (!state.cityBounds) await loadBoundary();
      let completed = 0;
      for (const config of layerConfigs) {
        setLoading(`Loading ${config.name}… (${completed + 1}/${layerConfigs.length})`, true);
        try { await loadLayer(config); }
        catch (err) {
          console.error(config.name, err);
          const countLabel = el(`layer-count-${config.key}`);
          if (countLabel) countLabel.textContent = 'error';
        }
        completed += 1;
        updateCounts();
      }
      buildPlanningIndex();
      generatePlanningFlags();
      renderPlanningFlags();
      setLoading('Stormwater planning data loaded.', true);
      window.setTimeout(() => setLoading('', false), 1500);
    } catch (err) {
      console.error(err);
      setLoading(`Could not load Orange County GIS: ${err.message}`, true);
    } finally { state.loading = false; }
  }

  function representativeLatLng(feature) {
    try {
      if (feature.geometry.type === 'Point') return L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
      const c = turf.centroid(feature).geometry.coordinates;
      return L.latLng(c[1], c[0]);
    } catch (_) { return state.map.getCenter(); }
  }

  function endpointsForFeature(feature) {
    const g = feature.geometry;
    if (!g) return [];
    if (g.type === 'Point') return [g.coordinates];
    if (g.type === 'LineString') return [g.coordinates[0], g.coordinates[g.coordinates.length - 1]];
    if (g.type === 'MultiLineString') return g.coordinates.flatMap(line => [line[0], line[line.length - 1]]);
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      try { return [turf.centroid(feature).geometry.coordinates]; } catch (_) { return []; }
    }
    return [];
  }

  function buildPlanningIndex() {
    state.networkNodes = state.featureIndex.filter(item => item.config.network).map((item, idx) => ({
      id: idx, config:item.config, feature:item.feature, endpoints:endpointsForFeature(item.feature), center:representativeLatLng(item.feature)
    }));
  }

  function distanceFeet(a, b) {
    return turf.distance(turf.point(a), turf.point(b), { units:'miles' }) * 5280;
  }

  function nearestNode(latlng, maxFeet = 300) {
    const point = [latlng.lng, latlng.lat];
    let best = null, bestDist = Infinity;
    for (const node of state.networkNodes) {
      for (const ep of node.endpoints) {
        const d = distanceFeet(point, ep);
        if (d < bestDist) { best = node; bestDist = d; }
      }
    }
    return bestDist <= maxFeet ? { node:best, distance:bestDist } : null;
  }

  function areConnected(a, b, toleranceFt) {
    for (const pa of a.endpoints) for (const pb of b.endpoints) if (distanceFeet(pa, pb) <= toleranceFt) return true;
    // Ponds and canals can intersect a line away from its endpoint.
    try {
      if (a.config.shape === 'polygon' || b.config.shape === 'polygon') {
        const d = turf.distance(turf.centroid(a.feature), turf.centroid(b.feature), { units:'miles' }) * 5280;
        if (d < toleranceFt * 2.5 && turf.booleanIntersects(a.feature, b.feature)) return true;
      }
    } catch (_) {}
    return false;
  }

  function runPlanningTrace(latlng, label = 'Selected map location') {
    if (!window.turf || !state.networkNodes.length) {
      el('traceSummary').textContent = 'Network analysis is unavailable until GIS data finishes loading.';
      return;
    }
    clearTrace(false);
    const tolerance = Number(el('traceTolerance').value);
    const maxDepth = Number(el('traceDepth').value);
    const nearest = nearestNode(latlng, 500);
    state.traceMarker = L.circleMarker(latlng, { radius:8, color:'#111827', weight:2, fillColor:'#f4b942', fillOpacity:1 }).addTo(state.traceLayer);
    if (!nearest) {
      el('traceSummary').innerHTML = `<strong>No mapped drainage asset found within 500 ft.</strong><br>This may indicate a public-GIS inventory gap; it does not establish that drainage infrastructure is absent.`;
      return;
    }

    const visited = new Set([nearest.node.id]);
    let frontier = [nearest.node];
    let depth = 0;
    while (frontier.length && depth < maxDepth && visited.size < 250) {
      const next = [];
      for (const current of frontier) {
        for (const candidate of state.networkNodes) {
          if (visited.has(candidate.id)) continue;
          if (areConnected(current, candidate, tolerance)) {
            visited.add(candidate.id); next.push(candidate);
            if (visited.size >= 250) break;
          }
        }
        if (visited.size >= 250) break;
      }
      frontier = next; depth += 1;
    }

    const traced = state.networkNodes.filter(n => visited.has(n.id));
    traced.forEach(node => {
      L.geoJSON(node.feature, {
        style:{ color:'#f4b942', weight:7, opacity:.95, fillColor:'#f4b942', fillOpacity:.35 },
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius:8, color:'#6f4b00', weight:2, fillColor:'#f4b942', fillOpacity:.95 })
      }).addTo(state.traceLayer).bindTooltip(node.config.name, { sticky:true });
    });

    const counts = new Map();
    traced.forEach(n => counts.set(n.config.name, (counts.get(n.config.name) || 0) + 1));
    const termini = traced.filter(n => /pond|canal|drainwell|pump|control/i.test(n.config.name));
    const parts = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,6).map(([name,count]) => `${count} ${name}`).join(', ');
    el('traceSummary').innerHTML = `<strong>${safeText(label)}</strong><br>Nearest mapped asset: ${safeText(nearest.node.config.name)} (${nearest.distance.toFixed(0)} ft). Trace highlighted <strong>${traced.length}</strong> nearby connected assets across ${depth} hop${depth === 1 ? '' : 's'} using a ${tolerance}-ft proximity tolerance.${termini.length ? `<br>Potential receiving/control features in trace: <strong>${termini.length}</strong>.` : '<br>No pond/canal/drainwell/control feature was reached by the proximity trace.'}<br><span class="muted">Composition: ${safeText(parts || 'n/a')}</span>`;
    state.map.fitBounds(state.traceLayer.getBounds().pad(.08), { maxZoom:18 });
  }

  function clearTrace(resetSummary = true) {
    if (state.traceLayer) state.traceLayer.clearLayers();
    state.traceMarker = null;
    if (resetSummary) el('traceSummary').textContent = 'No planning trace selected.';
  }

  function toggleTraceMode(force) {
    state.traceMode = typeof force === 'boolean' ? force : !state.traceMode;
    el('startTrace').textContent = state.traceMode ? 'Exit trace mode' : 'Start trace';
    el('planStatusPill').textContent = state.traceMode ? 'Trace active' : 'Ready';
    el('planStatusPill').className = `status-pill ${state.traceMode ? 'status-active' : 'status-ready'}`;
    el('mapModeLabel').textContent = state.traceMode ? 'Planning trace mode' : 'Explore mode';
    el('cursorHelp').textContent = state.traceMode ? 'Click a feature or map location to trace nearby connections.' : 'Click features for GIS attributes.';
    state.map.getContainer().style.cursor = state.traceMode ? 'crosshair' : '';
  }

  function generatePlanningFlags() {
    const flags = [];
    state.featureIndex.forEach(item => {
      const p = item.feature.properties || {};
      const center = representativeLatLng(item.feature);
      const condKey = Object.keys(p).find(k => /cond(rate|ition)/i.test(k));
      const cond = condKey ? String(p[condKey] ?? '') : '';
      if (/poor|bad|fail|collapsed|critical/i.test(cond)) {
        flags.push({ type:'condition', title:`${item.config.name}: ${cond}`, note:`Published ${condKey} attribute. Verify field condition before prioritization.`, center, item });
      }
      const noteText = Object.entries(p).filter(([k]) => /condnote|note|remark/i.test(k)).map(([,v]) => String(v ?? '')).join(' ');
      if (/collapsed|blocked|damag|repair|fail/i.test(noteText)) {
        flags.push({ type:'condition', title:`${item.config.name}: condition note`, note:noteText.slice(0,140), center, item });
      }
      const outfallKey = Object.keys(p).find(k => /outfall/i.test(k));
      const outfall = outfallKey ? String(p[outfallKey] ?? '') : '';
      if (outfall && !/^none$|^n\/a$/i.test(outfall)) {
        flags.push({ type:'outfall', title:`${item.config.name} → ${outfall}`, note:'Published outfall attribute; use as planning context, not verified flow direction.', center, item });
      }
      const dateKey = Object.keys(p).find(k => /inspdate|inspection.*date/i.test(k));
      if (dateKey && p[dateKey]) {
        const date = new Date(Number(p[dateKey]));
        if (!Number.isNaN(date.getTime())) {
          const years = (Date.now() - date.getTime()) / 31557600000;
          if (years >= 5) flags.push({ type:'inspection', title:`${item.config.name}: older inspection`, note:`Published inspection date ${date.toLocaleDateString()} (${years.toFixed(1)} years ago).`, center, item });
        }
      }
    });
    // De-duplicate by title + rounded location and cap UI volume.
    const seen = new Set();
    state.flags = flags.filter(f => {
      const key = `${f.type}|${f.title}|${f.center.lat.toFixed(4)}|${f.center.lng.toFixed(4)}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, 300);
  }

  function renderPlanningFlags() {
    const box = el('planningFlags');
    box.innerHTML = '';
    const filtered = state.flags.filter(f => state.activeFlagFilter === 'all' || f.type === state.activeFlagFilter);
    if (!filtered.length) {
      box.innerHTML = '<p class="muted">No matching published-attribute flags were generated from the loaded Belle Isle records.</p>';
      return;
    }
    filtered.slice(0, 80).forEach(flag => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'flag-card';
      card.innerHTML = `<strong>${safeText(flag.title)}</strong><span>${safeText(flag.note)}</span>`;
      card.addEventListener('click', () => {
        state.map.setView(flag.center, 18);
        L.popup().setLatLng(flag.center).setContent(`<div class="trace-popup"><strong>${safeText(flag.title)}</strong><br>${safeText(flag.note)}</div>`).openOn(state.map);
      });
      box.appendChild(card);
    });
    if (filtered.length > 80) {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = `Showing first 80 of ${filtered.length} flags.`; box.appendChild(p);
    }
  }

  async function searchStreet(query) {
    const status = el('searchStatus');
    const q = query.trim();
    if (!q) { status.textContent = 'Enter a Belle Isle street or address.'; return; }
    status.textContent = 'Searching…';
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format','jsonv2'); url.searchParams.set('limit','5'); url.searchParams.set('countrycodes','us'); url.searchParams.set('q',`${q}, Belle Isle, Florida`);
      const response = await fetch(url.toString(), { headers:{ 'Accept':'application/json' } });
      if (!response.ok) throw new Error('Search service unavailable');
      const results = await response.json();
      const hit = results[0];
      if (!hit) { status.textContent = 'No matching Belle Isle street or address found.'; return; }
      const lat = Number(hit.lat), lon = Number(hit.lon);
      state.map.setView([lat, lon], 18);
      L.popup().setLatLng([lat, lon]).setContent(`<strong>${safeText(hit.display_name)}</strong>`).openOn(state.map);
      status.textContent = 'Street located. Zoomed to result.';
    } catch (_) { status.textContent = 'Street search is temporarily unavailable. Pan and zoom manually.'; }
  }

  buildControls();
  initMap();
  loadAll();

  el('resetView').addEventListener('click', () => state.cityBounds ? state.map.fitBounds(state.cityBounds.pad(.03)) : state.map.setView(INITIAL_CENTER, INITIAL_ZOOM));
  el('refreshData').addEventListener('click', () => loadAll());
  el('streetForm').addEventListener('submit', event => { event.preventDefault(); searchStreet(el('streetInput').value); });
  el('startTrace').addEventListener('click', () => toggleTraceMode());
  el('clearTrace').addEventListener('click', () => { clearTrace(); toggleTraceMode(false); });
  el('traceTolerance').addEventListener('input', e => el('traceToleranceValue').textContent = `${e.target.value} ft`);
  el('traceDepth').addEventListener('input', e => el('traceDepthValue').textContent = `${e.target.value} hops`);
  document.querySelectorAll('.flag-filter').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.flag-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.activeFlagFilter = btn.dataset.flag; renderPlanningFlags();
  }));
})();
