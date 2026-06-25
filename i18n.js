const TRANSLATIONS = {
  en: {
    'drop.subtitle': 'Load a TileJSON file to explore its vector layers and attributes.',
    'drop.openFile': 'Open a file',
    'drop.load': 'Load',
    'drop.hint': 'Drag and drop a .json file here',
    'drop.schemas': 'Available schemas',
    'sidebar.search': 'Filter layers…',
    'header.reset': '↩ Change TileJSON',
    'detail.empty': 'Select a layer',
    'detail.attributes': 'Attributes',
    'detail.noFields': 'No attributes defined for this layer.',
    'detail.freeValues': 'Free values ({count})',
    'detail.noStats': 'no statistics',
    'detail.zoom': 'Zoom {min} → {max}',
    'type.unknown': 'unknown',
    'value.filterTitle': 'Filter on map',
    'zoom.alert': 'Layer visible between z{min} and z{max} (current zoom: z{current})',
    'zoom.in': 'Zoom in → z{target}',
    'zoom.out': 'Zoom out → z{target}',
    'bounds.alert': 'No data visible in this area',
    'map.noTiles': 'This TileJSON does not contain tile URLs.<br>Map is not available.',
    'popup.noAttrib': 'No attributes',
    'filter.remove': 'Remove filter',
    'error.loadItem': 'Unable to load «{name}»: {msg}',
    'error.invalidJson': 'Invalid JSON file.',
    'error.loadUrl': 'Unable to load: {msg}',
    'error.noLayers': 'No "vector_layers" field found in this TileJSON.',
    'layers.count': '{n} / {total} layer{s}',
    'fields.count': '{n} field{s}',
    'entities.count': '{n} entit{y}',
    'url.placeholder': 'https://… or path to a TileJSON',
    'geocoder.placeholder': 'Search a location…',
    'geocoder.notFound': 'No result found.',
    'header.zoom': 'Zoom',
    'header.layers': '{n} layer{s}',
  },
  fr: {
    'drop.subtitle': 'Chargez un fichier TileJSON pour explorer ses couches vectorielles et leurs attributs.',
    'drop.openFile': 'Ouvrir un fichier',
    'drop.load': 'Charger',
    'drop.hint': 'Glissez-déposez un fichier .json ici',
    'drop.schemas': 'Schémas disponibles',
    'sidebar.search': 'Filtrer les couches…',
    'header.reset': '↩ Changer de TileJSON',
    'detail.empty': 'Sélectionnez une couche',
    'detail.attributes': 'Attributs',
    'detail.noFields': 'Aucun attribut défini pour cette couche.',
    'detail.freeValues': 'Valeurs libres ({count})',
    'detail.noStats': 'aucune statistique',
    'detail.zoom': 'Zoom {min} → {max}',
    'type.unknown': 'inconnu',
    'value.filterTitle': 'Filtrer sur la carte',
    'zoom.alert': 'Couche visible entre z{min} et z{max} (zoom actuel : z{current})',
    'zoom.in': 'Zoom avant → z{target}',
    'zoom.out': 'Zoom arrière → z{target}',
    'bounds.alert': 'Aucune donnée visible dans cette zone',
    'map.noTiles': "Ce TileJSON ne contient pas d'URL de tuiles.<br>La carte n'est pas disponible.",
    'popup.noAttrib': 'Aucun attribut',
    'filter.remove': 'Supprimer le filtre',
    'error.loadItem': 'Impossible de charger « {name} » : {msg}',
    'error.invalidJson': 'Fichier JSON invalide.',
    'error.loadUrl': 'Impossible de charger : {msg}',
    'error.noLayers': 'Aucun champ "vector_layers" trouvé dans ce TileJSON.',
    'layers.count': '{n} / {total} couche{s}',
    'fields.count': '{n} champ{s}',
    'entities.count': '{n} entité{s}',
    'url.placeholder': 'https://… ou chemin vers un TileJSON',
    'geocoder.placeholder': 'Rechercher un lieu…',
    'geocoder.notFound': 'Aucun résultat trouvé.',
    'header.zoom': 'Zoom',
    'header.layers': '{n} couche{s}',
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key, vars = {}) {
  const str = (TRANSLATIONS[currentLang] ?? TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  applyI18n();
  if (typeof tilejson !== 'undefined' && tilejson) {
    const layersEl = document.getElementById('header-layers-text');
    if (layersEl) layersEl.textContent =
      t('header.layers', { n: allLayers.length, s: allLayers.length !== 1 ? 's' : '' });
    renderLayerList(allLayers);
    const layer = allLayers.find(l => l.id === selectedLayerId);
    if (layer) showDetail(layer);
    checkZoomAlert();
  }
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('.lang-select').forEach(el => { el.value = currentLang; });
}

document.addEventListener('DOMContentLoaded', applyI18n);
