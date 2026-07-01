// ── State ──
const MAP_CONTAINER_INITIAL_HTML = document.getElementById('map-container').innerHTML;
let tilejson = null;
let allLayers = [];
let selectedLayerId = null;
let selectedField = null;
let selectedValueJson = null;
let map = null;
const layerColors = {};

// ── URL hash state ──
let currentSource = null; // {type:'url', href:'...'} | {type:'file', name:'...'} | null
let _pendingRestore = null;
let _hashWriteTimer = null;

function readHash() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

function writeHash() {
  const params = new URLSearchParams();
  if (currentSource) {
    if (currentSource.type === 'url') params.set('url', currentSource.href);
    else params.set('file', currentSource.name);
  }
  if (selectedLayerId) params.set('layer', selectedLayerId);
  if (selectedField !== null) {
    params.set('field', selectedField);
    params.set('value', selectedValueJson);
  }
  if (map) {
    const c = map.getCenter();
    params.set('z', map.getZoom().toFixed(2));
    params.set('lng', c.lng.toFixed(5));
    params.set('lat', c.lat.toFixed(5));
  }
  history.replaceState(null, '', '#' + params.toString());
}

function scheduleHashWrite() {
  clearTimeout(_hashWriteTimer);
  _hashWriteTimer = setTimeout(writeHash, 400);
}

async function applyHash() {
  const h = readHash();
  if (!h.url && !h.file) return;
  _pendingRestore = {
    layer: h.layer || null,
    field: h.field || null,
    value: h.value !== undefined ? h.value : null,
    z: h.z ? +h.z : null,
    lng: h.lng ? +h.lng : null,
    lat: h.lat ? +h.lat : null,
  };
  try {
    const href = h.url || `./tilejson/${h.file}`;
    currentSource = h.url ? { type: 'url', href: h.url } : { type: 'file', name: h.file };
    const res = await fetch(href);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadData(await res.json());
  } catch (err) {
    _pendingRestore = null;
    currentSource = null;
    showError(t('error.loadUrl', { msg: err.message }));
  }
}

// ── Color palette ──
const HUE_PALETTE = [210, 150, 30, 280, 0, 180, 330, 90, 250, 60, 310, 120, 200, 45, 270, 160, 15, 240, 75, 350];
function assignLayerColor(index) {
  const hue = HUE_PALETTE[index % HUE_PALETTE.length];
  return `hsl(${hue}, 65%, ${52 + (index % 3) * 6}%)`;
}

// ── Schema list (from tilejson/manifest.json) ──
(async () => {
  try {
    const res = await fetch('./tilejson/manifest.json');
    if (!res.ok) return;
    const providers = await res.json();
    if (!providers.length) return;

    const list = document.getElementById('schema-list');
    const container = document.getElementById('schema-items');

    providers.forEach(({ provider, items }) => {
      const group = document.createElement('div');
      group.className = 'schema-group';

      const label = document.createElement('span');
      label.className = 'schema-provider';
      label.textContent = provider;
      group.appendChild(label);

      const btns = document.createElement('div');
      btns.className = 'schema-btns';

      items.forEach(({ name, file, url }) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = name;
        btn.addEventListener('click', async () => {
          try {
            const href = url ?? `./tilejson/${file}`;
            const r = await fetch(href);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            currentSource = url ? { type: 'url', href: url } : { type: 'file', name: file };
            loadData(await r.json());
          } catch (err) {
            showError(t('error.loadItem', { name, msg: err.message }));
          }
        });
        btns.appendChild(btn);
      });

      group.appendChild(btns);
      container.appendChild(group);
    });

    list.style.display = 'block';
  } catch { /* silencieux si absent */ }
})();

// ── Drag & drop ──
const dropBox = document.getElementById('drop-box');
document.addEventListener('dragover', e => { e.preventDefault(); dropBox.classList.add('drag-over'); });
document.addEventListener('dragleave', () => dropBox.classList.remove('drag-over'));
document.addEventListener('drop', e => {
  e.preventDefault();
  dropBox.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files[0]) readFile(e.target.files[0]);
});
document.getElementById('url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadFromUrl();
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      currentSource = null;
      loadData(JSON.parse(e.target.result));
    }
    catch { showError(t('error.invalidJson')); }
  };
  reader.readAsText(file);
}

async function loadFromUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentSource = { type: 'url', href: url };
    loadData(await res.json());
  } catch (err) {
    showError(t('error.loadUrl', { msg: err.message }));
  }
}

function loadData(data) {
  if (!data.vector_layers && !data.layers) {
    showError(t('error.noLayers'));
    return;
  }
  tilejson = data;
  allLayers = data.vector_layers || data.layers || [];
  allLayers.forEach((layer, i) => { layerColors[layer.id] = assignLayerColor(i); });
  renderApp();
  writeHash();
}

function renderApp() {
  document.getElementById('drop-screen').style.display = 'none';
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('main').classList.add('visible');

  document.getElementById('header-name').textContent = tilejson.name || 'tilejson-inspector';
  const descEl = document.getElementById('header-desc');
  descEl.textContent = tilejson.description || '';
  descEl.style.display = tilejson.description ? '' : 'none';
  document.getElementById('header-zoom').textContent = `${tilejson.minzoom ?? '?'}–${tilejson.maxzoom ?? '?'}`;
  document.getElementById('header-layers-text').textContent =
    t('header.layers', { n: allLayers.length, s: allLayers.length !== 1 ? 's' : '' });

  renderLayerList(allLayers);
  initMap();
  bindGeocoder();
}

// ── Layer list ──
function renderLayerList(layers) {
  const list = document.getElementById('layer-list');
  document.getElementById('layer-count').textContent =
    t('layers.count', { n: layers.length, total: allLayers.length, s: allLayers.length !== 1 ? 's' : '' });
  list.innerHTML = '';
  layers.forEach(layer => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === selectedLayerId ? ' active' : '');
    item.dataset.id = layer.id;
    item.innerHTML = `<div class="name">${esc(layer.id)}</div>`;
    item.addEventListener('click', () => selectLayer(layer.id));
    list.appendChild(item);
  });
}

function filterLayers(q) {
  const lower = q.toLowerCase();
  renderLayerList(allLayers.filter(l => l.id.toLowerCase().includes(lower)));
}

// ── Layer selection ──
function selectLayer(layerId) {
  if (selectedLayerId === layerId) return;

  if (selectedField !== null) {
    selectedField = null;
    selectedValueJson = null;
    document.getElementById('map-filter-chip').style.display = 'none';
  }

  selectedLayerId = layerId;

  document.querySelectorAll('.layer-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === layerId)
  );

  const layer = allLayers.find(l => l.id === layerId);
  if (layer) showDetail(layer);

  if (map) {
    highlightSelectedLayer(layerId);
    checkZoomAlert();
  }
  writeHash();
}


function checkZoomAlert() {
  const zoomEl = document.getElementById('map-zoom-alert');
  const boundsEl = document.getElementById('map-bounds-alert');
  if (!map || !selectedLayerId) {
    zoomEl.style.display = 'none';
    if (boundsEl) boundsEl.style.display = 'none';
    return;
  }

  const layer = allLayers.find(l => l.id === selectedLayerId);
  if (!layer) {
    zoomEl.style.display = 'none';
    if (boundsEl) boundsEl.style.display = 'none';
    return;
  }

  const currentZoom = map.getZoom();
  const minz = layer.minzoom ?? 0;
  const maxz = layer.maxzoom ?? 22;

  if (currentZoom < minz || currentZoom > maxz) {
    const targetZoom = currentZoom < minz ? minz : maxz;
    document.getElementById('map-zoom-alert-text').textContent =
      t('zoom.alert', { min: minz, max: maxz, current: currentZoom.toFixed(1) });
    const btn = document.getElementById('map-zoom-alert-btn');
    btn.textContent = t(currentZoom < minz ? 'zoom.in' : 'zoom.out', { target: targetZoom });
    btn.onclick = () => map.easeTo({ zoom: targetZoom });
    zoomEl.style.display = 'flex';
    if (boundsEl) boundsEl.style.display = 'none';
    return;
  }

  zoomEl.style.display = 'none';

  if (boundsEl) {
    const layerIds = [`${selectedLayerId}--fill`, `${selectedLayerId}--line`, `${selectedLayerId}--circle`]
      .filter(id => map.getLayer(id));
    const hasFeatures = layerIds.length > 0 && map.queryRenderedFeatures({ layers: layerIds }).length > 0;
    if (!hasFeatures) {
      document.getElementById('map-bounds-alert-text').textContent = t('bounds.alert');
      boundsEl.style.display = 'flex';
    } else {
      boundsEl.style.display = 'none';
    }
  }
}

// ── Detail panel ──
const TYPE_COLORS = {
  text: '#3ecf8e',
  'character varying': '#3ecf8e',
  integer: '#f59e0b',
  'double precision': '#f59e0b',
  boolean: '#a78bfa',
};

function typeColor(type) {
  const lower = (type || '').toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLORS)) {
    if (lower.startsWith(k)) return v;
  }
  return '#7a82a0';
}

function showDetail(layer) {
  document.getElementById('detail-empty').style.display = 'none';
  const content = document.getElementById('detail-content');
  content.style.display = 'block';

  const fields = layer.fields || {};
  const fieldKeys = Object.keys(fields);
  const fieldCount = layer.fieldsCount ?? fieldKeys.length;

  content.innerHTML = `
    <div class="detail-title">${esc(layer.id)}</div>
    <div class="detail-meta">
      <span class="badge geom" style="font-size:12px;padding:4px 10px">${esc(layer.geometry || 'GEOMETRY')}</span>
      <span class="badge zoom" style="font-size:12px;padding:4px 10px">${t('detail.zoom', { min: layer.minzoom ?? '?', max: layer.maxzoom ?? '?' })}</span>
      <span class="badge fields" style="font-size:12px;padding:4px 10px">${t('fields.count', { n: fieldCount, s: fieldCount !== 1 ? 's' : '' })}</span>
    </div>
    <div class="section-title">${t('detail.attributes')}</div>
    <div class="fields-grid" id="fields-grid"></div>`;

  const grid = content.querySelector('#fields-grid');

  if (fieldKeys.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px">${t('detail.noFields')}</p>`;
    return;
  }

  fieldKeys.forEach(key => {
    const f = fields[key];
    const values = f.values || [];
    const countStr = f.count != null
      ? t('entities.count', {
          n: f.count.toLocaleString(currentLang === 'fr' ? 'fr' : 'en'),
          y: f.count > 1 ? 'ies' : 'y',
          s: f.count > 1 ? 's' : '',
        })
      : '';

    const card = document.createElement('div');
    card.className = 'field-card';

    const header = document.createElement('div');
    header.className = 'field-header';
    header.innerHTML = `
      <span class="field-name">${esc(key)}</span>
      <span class="field-type" style="color:${typeColor(f.type)}">${esc(f.type || t('type.unknown'))}</span>
      ${countStr ? `<span class="field-count">${esc(countStr)}</span>` : ''}`;
    card.appendChild(header);

    if (values.length > 0) {
      const valContainer = document.createElement('div');
      valContainer.className = 'field-values';
      values.forEach(v => {
        const rawJson = JSON.stringify(v);
        const tag = document.createElement('span');
        tag.className = 'value-tag';
        tag.textContent = String(v);
        tag.title = t('value.filterTitle');
        tag.dataset.field = key;
        tag.dataset.raw = rawJson;
        if (key === selectedField && rawJson === selectedValueJson) tag.classList.add('selected');
        tag.addEventListener('click', () => selectValue(key, v, rawJson));
        valContainer.appendChild(tag);
      });
      card.appendChild(valContainer);
    } else {
      const noVal = document.createElement('div');
      noVal.className = 'no-values';
      noVal.textContent = t('detail.freeValues', { count: countStr || t('detail.noStats') });
      card.appendChild(noVal);
    }

    grid.appendChild(card);
  });
}

// ── Value filter ──
function selectValue(field, rawValue, rawJson) {
  const isSame = field === selectedField && rawJson === selectedValueJson;
  document.querySelectorAll('.value-tag').forEach(el => el.classList.remove('selected'));

  if (isSame) {
    selectedField = null;
    selectedValueJson = null;
    clearValueFilter();
    return;
  }

  selectedField = field;
  selectedValueJson = rawJson;

  document.querySelectorAll(`.value-tag[data-field="${CSS.escape(field)}"]`)
    .forEach(el => { if (el.dataset.raw === rawJson) el.classList.add('selected'); });

  const displayVal = typeof rawValue === 'string' ? `"${rawValue}"` : String(rawValue);
  document.getElementById('map-filter-text').textContent = `${field} = ${displayVal}`;
  document.getElementById('map-filter-chip').style.display = 'flex';

  if (map && selectedLayerId) applyMapValueFilter(selectedLayerId, field, rawValue);
  writeHash();
}

function clearValueFilter() {
  selectedField = null;
  selectedValueJson = null;
  document.querySelectorAll('.value-tag').forEach(el => el.classList.remove('selected'));
  document.getElementById('map-filter-chip').style.display = 'none';
  if (map && selectedLayerId) highlightSelectedLayer(selectedLayerId);
  writeHash();
}

// ── Map initialization ──
function initMap() {
  const hasTiles = tilejson.tiles && tilejson.tiles.length > 0;

  if (!hasTiles) {
    document.getElementById('map').style.display = 'none';
    document.getElementById('map-container').innerHTML += `
      <div class="map-no-tiles">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
        </svg>
        <p>${t('map.noTiles')}</p>
      </div>`;
    return;
  }

  const center = tilejson.center;
  const bounds = tilejson.bounds;
  const opts = { container: 'map', style: buildMapStyle(), attributionControl: true };

  if (_pendingRestore && _pendingRestore.z !== null) {
    opts.center = [_pendingRestore.lng, _pendingRestore.lat];
    opts.zoom = _pendingRestore.z;
  } else if (center && center.length >= 2) {
    opts.center = [center[0], center[1]];
    opts.zoom = center[2] ?? tilejson.minzoom ?? 5;
  } else if (bounds) {
    opts.bounds = bounds;
    opts.fitBoundsOptions = { padding: 50 };
  } else {
    opts.center = [2.35, 46.5];
    opts.zoom = tilejson.minzoom ?? 5;
  }

  map = new maplibregl.Map(opts);
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
  map.on('moveend', scheduleHashWrite);

  function updateZoomIndicator() {
    document.getElementById('map-zoom-value').textContent = map.getZoom().toFixed(1);
    document.getElementById('map-zoom-indicator').style.display = 'block';
  }

  map.on('zoom', () => { updateZoomIndicator(); checkZoomAlert(); });
  map.on('idle', checkZoomAlert);

  map.on('load', () => {
    updateZoomIndicator();
    getAllMapLayerIds().forEach(id => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
    if (_pendingRestore?.layer) {
      selectLayer(_pendingRestore.layer);
      if (_pendingRestore.field && _pendingRestore.value !== null) {
        try {
          const rawValue = JSON.parse(_pendingRestore.value);
          selectValue(_pendingRestore.field, rawValue, _pendingRestore.value);
        } catch {}
      }
      _pendingRestore = null;
    } else if (selectedLayerId) {
      highlightSelectedLayer(selectedLayerId);
    }
    writeHash();
  });

  map.on('click', e => {
    const features = map.queryRenderedFeatures(e.point, { layers: getAllMapLayerIds() });
    if (!features.length) return;

    const feat = features[0];
    const sourceLayer = feat.layer['source-layer'];
    const props = feat.properties || {};

    if (sourceLayer !== selectedLayerId) selectLayer(sourceLayer);

    const entries = Object.entries(props);
    let html = `<div class="popup-layer-name">${esc(sourceLayer)}</div>`;
    if (entries.length === 0) {
      html += `<span class="popup-empty">${t('popup.noAttrib')}</span>`;
    } else {
      html += '<table class="popup-table">';
      entries.forEach(([k, v]) => {
        html += `<tr${k === selectedField ? ' class="filtered"' : ''}><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`;
      });
      html += '</table>';
    }

    new maplibregl.Popup({ maxWidth: '260px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });
}

// ── Map style ──
function buildMapStyle() {
  const layers = [{ id: 'background', type: 'background', paint: { 'background-color': '#0f1117' } }];
  allLayers.forEach(layer => layers.push(...getMapLayers(layer)));
  return {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      tiles: {
        type: 'vector',
        tiles: tilejson.tiles,
        minzoom: tilejson.minzoom ?? 0,
        maxzoom: tilejson.maxzoom ?? 22,
        ...(tilejson.attribution ? { attribution: tilejson.attribution } : {}),
      },
    },
    layers,
  };
}

function getMapLayers(layer) {
  const color = layerColors[layer.id];
  const { isPolygon, isLine, isPoint } = geomFlags(layer);
  const result = [];
  const src = { source: 'tiles', 'source-layer': layer.id };

  function add(id, type, filter, paint) {
    result.push({ id, type, ...src, filter, paint });
  }

  if (isPolygon) {
    add(`${layer.id}--fill`, 'fill', ['==', ['geometry-type'], 'Polygon'], { 'fill-color': color, 'fill-opacity': 0.3 });
    add(`${layer.id}--outline`, 'line', ['==', ['geometry-type'], 'Polygon'], { 'line-color': color, 'line-opacity': 0.7, 'line-width': 1 });
  }
  if (isLine) {
    add(`${layer.id}--line`, 'line', ['==', ['geometry-type'], 'LineString'], { 'line-color': color, 'line-opacity': 0.75, 'line-width': 1.5 });
  }
  if (isPoint) {
    add(`${layer.id}--circle`, 'circle', ['==', ['geometry-type'], 'Point'], {
      'circle-color': color, 'circle-opacity': 0.85,
      'circle-radius': 4, 'circle-stroke-width': 1, 'circle-stroke-color': '#0f1117',
    });
  }

  return result;
}

function geomFlags(layer) {
  const g = (layer.geometry || '').toUpperCase();
  const unknown = !g || g === 'GEOMETRY';
  return {
    isPolygon: unknown || g.includes('POLYGON'),
    isLine: unknown || g.includes('LINE'),
    isPoint: unknown || g.includes('POINT'),
  };
}

function getAllMapLayerIds() {
  const ids = [];
  allLayers.forEach(layer => {
    const { isPolygon, isLine, isPoint } = geomFlags(layer);
    if (isPolygon) { ids.push(`${layer.id}--fill`); ids.push(`${layer.id}--outline`); }
    if (isLine) ids.push(`${layer.id}--line`);
    if (isPoint) ids.push(`${layer.id}--circle`);
  });
  return ids;
}

// ── Map highlight logic ──
function highlightSelectedLayer(layerId) {
  if (!map) return;
  allLayers.forEach(layer => {
    const isSelected = layer.id === layerId;
    const color = layerColors[layer.id];
    const { isPolygon, isLine, isPoint } = geomFlags(layer);

    if (isPolygon) {
      sp(layer.id + '--fill', 'fill-color', color);
      sp(layer.id + '--fill', 'fill-opacity', isSelected ? 0.42 : 0.04);
      sp(layer.id + '--outline', 'line-color', color);
      sp(layer.id + '--outline', 'line-opacity', isSelected ? 0.9 : 0.06);
      sp(layer.id + '--outline', 'line-width', isSelected ? 1.5 : 1);
    }
    if (isLine) {
      sp(layer.id + '--line', 'line-color', color);
      sp(layer.id + '--line', 'line-opacity', isSelected ? 0.9 : 0.06);
      sp(layer.id + '--line', 'line-width', isSelected ? 2.5 : 1.5);
    }
    if (isPoint) {
      sp(layer.id + '--circle', 'circle-color', color);
      sp(layer.id + '--circle', 'circle-opacity', isSelected ? 0.9 : 0.06);
      sp(layer.id + '--circle', 'circle-radius', isSelected ? 5 : 4);
    }
  });
}

function applyMapValueFilter(layerId, field, rawValue) {
  if (!map) return;
  const layer = allLayers.find(l => l.id === layerId);
  if (!layer) return;
  const { isPolygon, isLine, isPoint } = geomFlags(layer);
  const color = layerColors[layerId];
  const matchExpr = ['==', ['get', field], rawValue];

  if (isPolygon) {
    sp(layerId + '--fill', 'fill-color', ['case', matchExpr, '#4f7ef8', color]);
    sp(layerId + '--fill', 'fill-opacity', ['case', matchExpr, 0.55, 0.03]);
    sp(layerId + '--outline', 'line-color', ['case', matchExpr, '#4f7ef8', color]);
    sp(layerId + '--outline', 'line-opacity', ['case', matchExpr, 1, 0.05]);
    sp(layerId + '--outline', 'line-width', ['case', matchExpr, 2, 1]);
  }
  if (isLine) {
    sp(layerId + '--line', 'line-color', ['case', matchExpr, '#4f7ef8', color]);
    sp(layerId + '--line', 'line-opacity', ['case', matchExpr, 1, 0.05]);
    sp(layerId + '--line', 'line-width', ['case', matchExpr, 3, 1.5]);
  }
  if (isPoint) {
    sp(layerId + '--circle', 'circle-color', ['case', matchExpr, '#4f7ef8', color]);
    sp(layerId + '--circle', 'circle-opacity', ['case', matchExpr, 1, 0.05]);
    sp(layerId + '--circle', 'circle-radius', ['case', matchExpr, 7, 4]);
  }
}

function sp(id, prop, value) {
  if (map && map.getLayer(id)) map.setPaintProperty(id, prop, value);
}

// ── Reset ──
function reset() {
  tilejson = null; allLayers = []; selectedLayerId = null;
  selectedField = null; selectedValueJson = null;
  currentSource = null;
  Object.keys(layerColors).forEach(k => delete layerColors[k]);
  history.replaceState(null, '', location.pathname + location.search);

  if (map) { map.remove(); map = null; }

  document.getElementById('drop-screen').style.display = 'flex';
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('main').classList.remove('visible');
  document.getElementById('detail-empty').style.display = 'flex';
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('file-input').value = '';
  document.getElementById('url-input').value = '';
  document.getElementById('search').value = '';
  document.getElementById('layer-list').innerHTML = '';
  applyI18n();

  document.getElementById('map-container').innerHTML = MAP_CONTAINER_INITIAL_HTML;
  bindGeocoder();
}

// ── Utils ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  const toast = document.getElementById('error-toast');
  toast.textContent = msg; toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ── Help modal ──
function openHelp() {
  document.getElementById('help-modal').style.display = 'flex';
}
function closeHelp() {
  document.getElementById('help-modal').style.display = 'none';
}
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').style.display = 'flex';
}
function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); closeHelp(); }
});

applyHash();

// ── Geocoder ──
let geocoderAbort = null;

function bindGeocoder() {
  if (geocoderAbort) geocoderAbort.abort();
  geocoderAbort = new AbortController();
  const { signal } = geocoderAbort;

  const input = document.getElementById('geocoder-input');
  const list = document.getElementById('geocoder-results');
  if (!input || !list) return;

  let debounce;
  let suggestions = [];
  let activeIndex = -1;

  function navigate(s) {
    if (!map) return;
    const bb = s.boundingbox;
    if (bb) {
      map.fitBounds([[+bb[2], +bb[0]], [+bb[3], +bb[1]]], { padding: 50, duration: 0 });
    } else {
      map.jumpTo({ center: [+s.lon, +s.lat] });
    }
    input.value = s.display_name.split(',')[0].trim();
    close();
  }

  function close() {
    list.classList.remove('open');
    list.innerHTML = '';
    suggestions = [];
    activeIndex = -1;
  }

  function setActive(i) {
    list.querySelectorAll('li').forEach((el, j) => el.classList.toggle('active', j === i));
    activeIndex = i;
  }

  function render() {
    list.innerHTML = '';
    if (!suggestions.length) { list.classList.remove('open'); return; }
    suggestions.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.display_name;
      li.addEventListener('mousedown', e => { e.preventDefault(); navigate(s); });
      list.appendChild(li);
    });
    list.classList.add('open');
    activeIndex = -1;
  }

  input.addEventListener('input', e => {
    clearTimeout(debounce);
    const q = e.target.value.trim();
    if (q.length < 2) { close(); return; }
    debounce = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, { signal, headers: { 'User-Agent': 'tilejson-inspector/1.0' } });
        suggestions = await res.json();
        render();
      } catch { /* aborted or network error */ }
    }, 300);
  }, { signal });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
    else if (e.key === 'Enter') { if (activeIndex >= 0) navigate(suggestions[activeIndex]); else if (suggestions.length) navigate(suggestions[0]); }
    else if (e.key === 'Escape') close();
  }, { signal });

  input.addEventListener('blur', () => setTimeout(close, 150), { signal });
}
