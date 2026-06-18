const COMMUNITY_PRIORITIES_CONFIG = window.COMMUNITY_PRIORITIES_CONFIG || {};
    const rawPriorityPhotoBaseUrl = String(COMMUNITY_PRIORITIES_CONFIG.priorityPhotoBaseUrl || "").trim();
    const PRIORITY_PHOTO_BASE_URL = rawPriorityPhotoBaseUrl
      ? rawPriorityPhotoBaseUrl.replace(/\/?$/, "/")
      : "";
    const USE_LOCAL_PRIORITY_PHOTOS = ["localhost", "127.0.0.1", ""].includes(window.location.hostname)
      && !PRIORITY_PHOTO_BASE_URL;

    window.CommunityPrioritiesAuth?.init({
      authApiBaseUrl: COMMUNITY_PRIORITIES_CONFIG.authApiBaseUrl,
      allowedAuthModules: COMMUNITY_PRIORITIES_CONFIG.allowedAuthModules || ["clusters_map", "all"]
    });

    function resolveAssetUrl(path) {
      if (!path) return "";
      if (/^(https?:|file:|blob:|data:)/i.test(path)) return path;
      let assetPath = String(path);
      // ILDB asset popups use photo_index paths under photo_previews/, but infrastructure
      // map builds only package the matching JPEGs in infrastructure_photo_previews/.
      if (COMMUNITY_PRIORITIES_CONFIG.displayMode === "infrastructure"
        && /(?:^|\/)photo_previews\//i.test(assetPath)) {
        assetPath = assetPath.replace(/(^|\/)photo_previews\//i, "$1infrastructure_photo_previews/");
      }
      const previewMatch = assetPath.match(/(?:infrastructure_)?photo_previews\/([^/?#]+)/i);
      if (previewMatch) {
        if (USE_LOCAL_PRIORITY_PHOTOS) return encodeURI(assetPath).replace(/#/g, "%23");
        if (PRIORITY_PHOTO_BASE_URL) return PRIORITY_PHOTO_BASE_URL + previewMatch[1];
      }
      return encodeURI(assetPath).replace(/#/g, "%23");
    }

    if (typeof window.photoPopupHtml === "function") {
      const originalPhotoPopupHtml = window.photoPopupHtml;
      window.photoPopupHtml = function photoPopupHtml(photo, title, metaRows) {
        if (!photo) return originalPhotoPopupHtml(photo, title, metaRows);
        return originalPhotoPopupHtml(
          { ...photo, image: resolveAssetUrl(photo.image) },
          title,
          metaRows
        );
      };
    }

    const PRIORITIES_GLOBAL = COMMUNITY_PRIORITIES_CONFIG.prioritiesGlobal || "PHOTO_BACKED_PRIORITIES";
    const FILTERS_GLOBAL = COMMUNITY_PRIORITIES_CONFIG.filtersGlobal || "PHOTO_BACKED_FILTERS";
    const IS_INFRASTRUCTURE_DISPLAY = COMMUNITY_PRIORITIES_CONFIG.displayMode === "infrastructure";
    const ALL_PRIORITY_POINTS = window[PRIORITIES_GLOBAL] || window.PHOTO_BACKED_PRIORITIES || [];
    const AREA_PHOTOS_GLOBAL = COMMUNITY_PRIORITIES_CONFIG.areaPhotosGlobal || "";
    const AREA_PHOTO_RADIUS_METERS = Number(COMMUNITY_PRIORITIES_CONFIG.areaPhotoRadiusMeters) || 100;
    const ALL_AREA_PHOTOS = AREA_PHOTOS_GLOBAL ? (window[AREA_PHOTOS_GLOBAL] || []) : [];
    const priorityPointById = new Map(ALL_PRIORITY_POINTS.map((point) => [point.id, point]));
    const FILTER_META = window[FILTERS_GLOBAL] || window.PHOTO_BACKED_FILTERS || { clusters: [], villagesByCluster: {} };
    const STYLES = window.CURSOR_V2_STYLES || {};
    const LAYERS = window.CURSOR_V2_LAYERS || {};
    const MANIFEST = window.CURSOR_V2_LAYER_MANIFEST || [];

    function databaseManifestEntries() {
      const ids = COMMUNITY_PRIORITIES_CONFIG.includedLayerIds;
      if (!Array.isArray(ids) || !ids.length) return MANIFEST;
      const allowed = new Set(ids);
      return MANIFEST.filter((entry) => allowed.has(entry.id));
    }

    function initMapNav() {
      const nav = document.getElementById("mapNav");
      const items = COMMUNITY_PRIORITIES_CONFIG.navItems;
      const activeId = COMMUNITY_PRIORITIES_CONFIG.mapId;
      if (!nav || !Array.isArray(items) || !items.length) return;
      nav.innerHTML = items.map((item) => {
        const isActive = item.id === activeId;
        const activeClass = isActive ? " map-nav-link-active" : "";
        const ariaCurrent = isActive ? ' aria-current="page"' : "";
        return `<a href="${item.href}" class="map-nav-link${activeClass}"${ariaCurrent}>${item.label}</a>`;
      }).join("");
    }

    const priorityBadge = document.getElementById("priorityBadge");
    if (priorityBadge) {
      const databaseLayerCount = databaseManifestEntries().length;
      const priorityLabel = COMMUNITY_PRIORITIES_CONFIG.priorityCountLabel || "photo-backed priorities";
      const layerLabel = COMMUNITY_PRIORITIES_CONFIG.databaseLayerLabel || "Integrated Locations Database layers";
      priorityBadge.textContent = `${ALL_PRIORITY_POINTS.length} ${priorityLabel} + ${databaseLayerCount} ${layerLabel}`;
    }
    const BAGHLAN_CLUSTERS = new Set([
      "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6",
      "Cluster 7", "Cluster 8", "Cluster 9", "Cluster 10", "Cluster 11", "Nawabad Cluster"
    ]);

    const CLUSTER_STORIES = {
      "Cluster 3": "Flood-prone canals and river edges are threatening homes, public assets, roads, and daily services in Chah Abi Ha and Gudan Payen. The mapped database facilities and photo-backed priorities together show where protection walls, culverts, road rehabilitation, and safer learning spaces are needed.",
      "All": "Across Baghlan and Nawabad, community FGDs identified recurring needs around flood protection, WASH, education facilities, road access, health services, and shelter. Use the cluster and village filters to explore photo-backed evidence linked to each priority theme."
    };

    const MAP_ZOOM_STEP = 0.25;
    const map = L.map("map", {
      preferCanvas: true,
      zoomControl: false,
      zoomSnap: MAP_ZOOM_STEP,
      zoomDelta: MAP_ZOOM_STEP,
      wheelPxPerZoomLevel: 160
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    function createBaseMap(name, url, options) {
      const layer = L.tileLayer(url, options);
      layer._baseMapName = name;
      return layer;
    }

    const BASE_MAP_OPTIONS = [
      {
        name: "OpenStreetMap",
        layer: createBaseMap(
          "OpenStreetMap",
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }
        )
      },
      {
        name: "Satellite imagery",
        layer: createBaseMap(
          "Satellite imagery",
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, attribution: "Tiles &copy; Esri", crossOrigin: true }
        )
      },
      {
        name: "Satellite + labels",
        layer: (() => {
          const group = L.layerGroup([
            createBaseMap(
              "Satellite + labels (imagery)",
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              { maxZoom: 19, attribution: "Tiles &copy; Esri", crossOrigin: true }
            ),
            createBaseMap(
              "Satellite + labels (reference)",
              "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
              { maxZoom: 19, attribution: "Labels &copy; Esri", pane: "overlayPane", crossOrigin: true }
            )
          ]);
          group._baseMapName = "Satellite + labels";
          return group;
        })()
      },
      {
        name: "Topographic",
        layer: createBaseMap(
          "Topographic",
          "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          { maxZoom: 17, attribution: "&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap" }
        )
      },
      {
        name: "Light map",
        layer: createBaseMap(
          "Light map",
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" }
        )
      },
      {
        name: "Humanitarian OSM",
        layer: createBaseMap(
          "Humanitarian OSM",
          "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors, Tiles style by HOT" }
        )
      },
      {
        name: "Esri streets",
        layer: createBaseMap(
          "Esri streets",
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, attribution: "Tiles &copy; Esri", crossOrigin: true }
        )
      }
    ];

    const BASE_MAP_LAYERS = Object.fromEntries(BASE_MAP_OPTIONS.map((entry) => [entry.name, entry.layer]));
    const DEFAULT_BASE_MAP = "OpenStreetMap";
    const DEFAULT_START_CLUSTER = "Cluster 1";
    const streets = BASE_MAP_LAYERS[DEFAULT_BASE_MAP];
    streets.addTo(map);

    const priorityGroup = L.layerGroup().addTo(map);
    const priorityLabelGroup = IS_INFRASTRUCTURE_DISPLAY ? L.layerGroup().addTo(map) : null;
    const databaseStores = new Map();
    const markerById = new Map();
    const priorityLabelById = new Map();
    const clusterFilter = document.getElementById("clusterFilter");
    const villageFilter = document.getElementById("villageFilter");
    const basemapFilter = document.getElementById("basemapFilter");
    const filterSummary = document.getElementById("filterSummary");
    const toggleAllLayersSidebar = document.getElementById("toggleAllLayersSidebar");
    const storyText = document.getElementById("storyText");
    const cards = document.getElementById("cards");
    const cardsEmpty = document.getElementById("cardsEmpty");
    const sideHeaderToggle = document.getElementById("sideHeaderToggle");
    const sideIntroPanel = document.getElementById("sideIntroPanel");
    const SIDE_INTRO_STORAGE_KEY = "communityPrioritiesSideIntroCollapsed";
    const priorityLayerLabel = IS_INFRASTRUCTURE_DISPLAY
      ? "Infrastructure priorities"
      : "Photo-backed priorities";
    const priorityLabelLayerName = "Priority intervention labels";
    const layerControlEntries = { [priorityLayerLabel]: priorityGroup };
    if (priorityLabelGroup) {
      layerControlEntries[priorityLabelLayerName] = priorityLabelGroup;
    }

    function setSideIntroCollapsed(collapsed) {
      if (!sideIntroPanel || !sideHeaderToggle) return;
      sideIntroPanel.hidden = collapsed;
      sideHeaderToggle.setAttribute("aria-expanded", String(!collapsed));
      const label = sideHeaderToggle.querySelector(".side-header-toggle-label");
      if (label) label.textContent = collapsed ? "Show panel" : "Hide panel";
      document.querySelector(".side")?.classList.toggle("side-intro-collapsed", collapsed);
      document.body.classList.toggle("side-panel-collapsed", collapsed);
      requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        scheduleMapLayoutRefresh();
      });
      try {
        window.localStorage.setItem(SIDE_INTRO_STORAGE_KEY, collapsed ? "1" : "0");
      } catch {
        // Ignore storage failures in private browsing.
      }
    }

    function initSideHeaderToggle() {
      if (!sideHeaderToggle || !sideIntroPanel) return;
      let collapsed = false;
      try {
        collapsed = window.localStorage.getItem(SIDE_INTRO_STORAGE_KEY) === "1";
      } catch {
        collapsed = false;
      }
      setSideIntroCollapsed(collapsed);
      sideHeaderToggle.addEventListener("click", () => {
        setSideIntroCollapsed(!sideIntroPanel.hidden);
      });
    }

    let corridorLayer = null;
    let layersControl = null;
    let toggleAllLayersCheckbox = null;
    let toggleAllLayersListenersReady = false;
    const priorityGalleryStore = new Map();
    let lightboxPhotos = null;
    let lightboxIndex = 0;
    let lightboxCaption = "";
    let layoutRefreshQueued = false;

    const ZOOM_SHOW_PRIORITIES = 12;
    const ZOOM_SHOW_FACILITIES = 0;
    const ZOOM_SHOW_COMMUNITY_LABELS = 13;
    const PRIORITY_LABEL_BASE_FONT_REM = 0.702;
    const PRIORITY_LABEL_DEFAULT_WORDS_PER_LINE = 6;
    const PRIORITY_LABEL_ZOOM_FULL = 17;
    const PRIORITY_LABEL_MIN_ZOOM_SCALE = 0.5;
    const PRIORITY_LABEL_MIN_OVERLAP_SCALE = 0.45;
    const PRIORITY_LABEL_OVERLAP_PADDING_PX = 6;
    const PRIORITY_LABEL_RESOLVE_ITERATIONS = 14;
    const PRIORITY_LABEL_DEFAULT_LINE_HEIGHT = 1.2;
    const priorityLabelUserAdjustments = {
      sizeScale: 1,
      wordsPerLine: PRIORITY_LABEL_DEFAULT_WORDS_PER_LINE,
      lineHeight: PRIORITY_LABEL_DEFAULT_LINE_HEIGHT
    };
    const DECLUTTER_GROUP_METERS = 14;
    const DECLUTTER_SPACING_PX = 48;
    const DUPLICATE_GPS_SPREAD_METERS = 20;

    function normalizeCluster(name) {
      if (name === "Naw Abad Cluster") return "Nawabad Cluster";
      return name;
    }

    const CLUSTER_NAME_PATTERN = /^(Cluster \d+|Naw Abad Cluster|Nawabad Cluster)$/i;

    function looksLikeClusterName(value) {
      return CLUSTER_NAME_PATTERN.test(String(value || "").trim());
    }

    function featureCluster(props) {
      for (const value of [props?.Cluster, props?.Cluster_1, props?.Name]) {
        if (!value) continue;
        const normalized = normalizeCluster(String(value).trim());
        if (looksLikeClusterName(normalized) || BAGHLAN_CLUSTERS.has(normalized)) {
          return normalized;
        }
      }
      return null;
    }

    function featureVillage(props) {
      if (props?.Village) return props.Village;
      const name1 = props?.Name_1;
      if (name1 && !looksLikeClusterName(name1)) return name1;
      return null;
    }

    function normalizeVillage(name) {
      return String(name || "")
        .toLowerCase()
        .replace(/\s+villlage\s*$/i, "")
        .replace(/\s+village\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function villageMatches(left, right) {
      if (!left || !right || right === "All") return right === "All";
      const a = normalizeVillage(left);
      const b = normalizeVillage(right);
      return a.includes(b) || b.includes(a);
    }

    function imageSrc(path) {
      return resolveAssetUrl(path);
    }

    function popupPhotoSrc(photoElement) {
      return photoElement.getAttribute("data-display-src")
        || photoElement.getAttribute("src")
        || photoElement.currentSrc
        || photoElement.src;
    }

    function markerLatLng(point) {
      return [point.lat + (point.offsetLat || 0), point.lon + (point.offsetLon || 0)];
    }

    function metersToLonOffset(meters, lat) {
      return meters / (111320 * Math.cos((lat * Math.PI) / 180));
    }

    function gpsCoordKey(lat, lon) {
      return `${Number(lat).toFixed(7)},${Number(lon).toFixed(7)}`;
    }

    function assignDuplicateGpsSpread(points) {
      const visibleIds = new Set(points.map((point) => point.id));
      ALL_PRIORITY_POINTS.forEach((point) => {
        if (!visibleIds.has(point.id)) {
          point.offsetLat = 0;
          point.offsetLon = 0;
        }
      });

      const byCoord = new Map();
      points.forEach((point) => {
        const key = gpsCoordKey(point.lat, point.lon);
        if (!byCoord.has(key)) byCoord.set(key, []);
        byCoord.get(key).push(point);
      });

      byCoord.forEach((group) => {
        if (group.length <= 1) {
          group[0].offsetLat = 0;
          group[0].offsetLon = 0;
          return;
        }

        const centerIndex = (group.length - 1) / 2;
        group.forEach((point, index) => {
          const eastMeters = (index - centerIndex) * DUPLICATE_GPS_SPREAD_METERS;
          point.offsetLat = 0;
          point.offsetLon = metersToLonOffset(eastMeters, point.lat);
        });
      });
    }

    function haversineMeters(lat1, lon1, lat2, lon2) {
      const radius = 6371000;
      const phi1 = lat1 * Math.PI / 180;
      const phi2 = lat2 * Math.PI / 180;
      const dPhi = (lat2 - lat1) * Math.PI / 180;
      const dLambda = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dPhi / 2) ** 2
        + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
      return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function areaPhotosNear(lat, lon, radiusMeters = AREA_PHOTO_RADIUS_METERS) {
      if (!ALL_AREA_PHOTOS.length || lat == null || lon == null) return [];
      const nearbyPhotos = ALL_AREA_PHOTOS
        .map((photo) => ({
          ...photo,
          distanceMeters: haversineMeters(lat, lon, photo.lat, photo.lon)
        }))
        .filter((photo) => photo.distanceMeters <= radiusMeters)
        .sort((left, right) => left.distanceMeters - right.distanceMeters);

      if (!IS_INFRASTRUCTURE_DISPLAY) return nearbyPhotos;

      const seenImages = new Set();
      return nearbyPhotos.filter((photo) => {
        const imageKey = photo.image || "";
        if (seenImages.has(imageKey)) return false;
        seenImages.add(imageKey);
        return true;
      });
    }

    function infrastructureMetaHtml(point) {
      return `
        <span><strong>Priority intervention:</strong> ${escapeHtml(point.intervention || point.title)}</span>
        <span><strong>Location:</strong> ${escapeHtml(point.location || point.village)}</span>
        <span><strong>Priority level:</strong> ${escapeHtml(point.level)}</span>
        <span><strong>Latitude:</strong> ${Number(point.lat).toFixed(8)}</span>
        <span><strong>Longitude:</strong> ${Number(point.lon).toFixed(8)}</span>
      `;
    }

    function infrastructurePriorityPhotos(point) {
      if (Array.isArray(point.photos) && point.photos.length) {
        return point.photos;
      }
      return areaPhotosNear(point.lat, point.lon);
    }

    function infrastructurePopupHtml(point) {
      const nearbyPhotos = infrastructurePriorityPhotos(point);
      const areaLinkHtml = nearbyPhotos.length
        ? `<button type="button" class="popup-area-photos-link" data-point-id="${point.id}">View photos in the area (${nearbyPhotos.length})</button>`
        : `<p class="popup-area-photos-empty">No GPS-tagged photos within ${AREA_PHOTO_RADIUS_METERS} m of this priority.</p>`;

      return `
        <div class="popup-infrastructure" data-point-id="${point.id}">
          <h3 class="popup-title">${point.displayId}. ${escapeHtml(point.intervention || point.title)}</h3>
          <div class="popup-meta popup-gallery-meta">${infrastructureMetaHtml(point)}</div>
          <p class="popup-area-photos-note">
            Nearby photos are <strong>not verified</strong> as related to this priority. They were taken within
            ${AREA_PHOTO_RADIUS_METERS} m of the priority GPS point.
          </p>
          ${areaLinkHtml}
        </div>
      `;
    }

    function openAreaPhotosForPoint(point) {
      const nearbyPhotos = IS_INFRASTRUCTURE_DISPLAY
        ? infrastructurePriorityPhotos(point)
        : areaPhotosNear(point.lat, point.lon);
      if (!nearbyPhotos.length) return;
      lightboxCaption = `Photos near priority ${point.displayId}. These images may not relate to this priority; they were taken within ${AREA_PHOTO_RADIUS_METERS} m of the GPS point.`;
      openPhotoLightbox(
        nearbyPhotos.map((photo) => ({
          image: photo.image,
          title: photo.file,
          file: photo.file,
          lat: photo.lat,
          lon: photo.lon,
          distanceMeters: photo.distanceMeters
        })),
        0
      );
    }

    function anchorLatLng(lat, lon) {
      return L.latLng(lat, lon);
    }

    function applyScreenOffset(marker, anchor, dx, dy) {
      if (!marker || !anchor) return;
      const point = map.latLngToContainerPoint(anchor);
      marker.setLatLng(map.containerPointToLatLng([point.x + dx, point.y + dy]));
      marker._declutterPixelOffset = { dx, dy };
      const el = marker.getElement?.();
      if (el) {
        el.classList.add("declutter-offset");
      }
    }

    function resetDeclutterMarker(marker) {
      if (!marker?._declutterAnchor) return;
      marker.setLatLng(marker._declutterAnchor);
      marker._declutterPixelOffset = null;
      const el = marker.getElement?.();
      if (el) {
        el.classList.remove("declutter-offset");
      }
    }

    function forEachDeclutterMarker(callback) {
      priorityGroup.eachLayer((layer) => {
        if (layer === corridorLayer || !layer._declutterAnchor) return;
        callback(layer);
      });
      databaseStores.forEach((store) => {
        if (store.entry.geometry !== "point") return;
        store.group.eachLayer((layer) => {
          if (!layer._declutterAnchor) return;
          callback(layer);
        });
      });
    }

    function pixelLayout(count) {
      if (count <= 1) return [{ dx: 0, dy: 0 }];
      if (count === 2) {
        const half = DECLUTTER_SPACING_PX * 0.5;
        return [{ dx: -half, dy: 0 }, { dx: half, dy: 0 }];
      }
      const radius = DECLUTTER_SPACING_PX * 0.85;
      return Array.from({ length: count }, (_, index) => {
        const angle = ((Math.PI * 2 * index) / count) - (Math.PI / 2);
        return {
          dx: Math.cos(angle) * radius,
          dy: Math.sin(angle) * radius
        };
      });
    }

    function groupMarkersByProximity(items) {
      const parent = items.map((_, index) => index);
      function find(index) {
        return parent[index] === index ? index : (parent[index] = find(parent[index]));
      }
      function union(a, b) {
        parent[find(a)] = find(b);
      }

      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i].anchor;
          const b = items[j].anchor;
          if (haversineMeters(a.lat, a.lng, b.lat, b.lng) <= DECLUTTER_GROUP_METERS) {
            union(i, j);
          }
        }
      }

      const groups = new Map();
      items.forEach((item, index) => {
        const root = find(index);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(item);
      });
      return [...groups.values()];
    }

    function collectVisiblePointMarkers() {
      const zoom = map.getZoom();
      const items = [];

      if (zoom >= ZOOM_SHOW_PRIORITIES && map.hasLayer(priorityGroup)) {
        priorityGroup.eachLayer((layer) => {
          if (layer === corridorLayer || !layer.getLatLng || !layer._declutterAnchor) return;
          items.push({ marker: layer, anchor: layer._declutterAnchor, weight: 0 });
        });
      }

      if (zoom >= ZOOM_SHOW_FACILITIES) {
        databaseStores.forEach((store) => {
          if (store.entry.geometry !== "point" || !map.hasLayer(store.group)) return;
          store.group.eachLayer((layer) => {
            if (!layer.getLatLng || !layer._declutterAnchor) return;
            items.push({ marker: layer, anchor: layer._declutterAnchor, weight: 1 });
          });
        });
      }

      return items;
    }

    function updateZoomVisibility() {
      const zoom = map.getZoom();
      const showPriorities = zoom >= ZOOM_SHOW_PRIORITIES;
      const showFacilities = zoom >= ZOOM_SHOW_FACILITIES;
      const showCommunityLabels = zoom >= ZOOM_SHOW_COMMUNITY_LABELS;
      const container = map.getContainer();

      container.classList.toggle("zoom-overview", zoom < ZOOM_SHOW_PRIORITIES);
      container.classList.toggle(
        "zoom-medium",
        zoom >= ZOOM_SHOW_PRIORITIES && zoom < ZOOM_SHOW_FACILITIES
      );

      if (map.hasLayer(priorityGroup)) {
        priorityGroup.eachLayer((layer) => {
          if (layer === corridorLayer) return;
          if (layer.setOpacity) layer.setOpacity(showPriorities ? 1 : 0);
          if (layer.options) layer.options.interactive = showPriorities;
        });
      }

      if (priorityLabelGroup && map.hasLayer(priorityLabelGroup)) {
        priorityLabelGroup.eachLayer((layer) => {
          const tooltip = layer.getTooltip?.();
          const el = tooltip?.getElement?.();
          if (el) el.style.visibility = showPriorities ? "visible" : "hidden";
        });
      }

      databaseStores.forEach((store) => {
        if (store.entry.id === "boundary_community") {
          store.group.eachLayer((layer) => {
            const tooltip = layer.getTooltip?.();
            const el = tooltip?.getElement?.();
            if (el) el.style.visibility = showCommunityLabels ? "visible" : "hidden";
          });
          return;
        }
        if (store.entry.geometry !== "point" || !map.hasLayer(store.group)) return;
        store.group.eachLayer((layer) => {
          if (layer.setOpacity) {
            layer.setOpacity(showFacilities ? 1 : 0);
          } else if (layer.setStyle) {
            layer.setStyle({
              opacity: showFacilities ? 0.9 : 0,
              fillOpacity: showFacilities ? 0.95 : 0
            });
          }
          if (layer.options) layer.options.interactive = showFacilities;
        });
      });
    }

    function applyDeclutter() {
      updateZoomVisibility();
      forEachDeclutterMarker(resetDeclutterMarker);

      const groups = groupMarkersByProximity(collectVisiblePointMarkers());
      groups.forEach((group) => {
        group.sort((left, right) => left.weight - right.weight);
        const offsets = pixelLayout(group.length);
        group.forEach((item, index) => {
          applyScreenOffset(item.marker, item.anchor, offsets[index].dx, offsets[index].dy);
        });
      });
      syncPriorityLabelPositions();
      layoutPriorityLabels();
      requestAnimationFrame(() => layoutPriorityLabels());
    }

    function priorityLabelZoomScale(zoom) {
      if (zoom >= PRIORITY_LABEL_ZOOM_FULL) return 1;
      if (zoom <= ZOOM_SHOW_PRIORITIES) return PRIORITY_LABEL_MIN_ZOOM_SCALE;
      const progress = (zoom - ZOOM_SHOW_PRIORITIES) / (PRIORITY_LABEL_ZOOM_FULL - ZOOM_SHOW_PRIORITIES);
      return PRIORITY_LABEL_MIN_ZOOM_SCALE + progress * (1 - PRIORITY_LABEL_MIN_ZOOM_SCALE);
    }

    function labelRectsOverlap(left, right, padding = PRIORITY_LABEL_OVERLAP_PADDING_PX) {
      return !(left.right + padding < right.left
        || left.left - padding > right.right
        || left.bottom + padding < right.top
        || left.top - padding > right.bottom);
    }

    function resetPriorityLabelScreenOffset(labelMarker) {
      const anchor = labelMarker?._labelDeclutterAnchor;
      if (!anchor || !labelMarker.setLatLng) return;
      labelMarker.setLatLng(anchor);
      labelMarker._labelPixelOffset = { dx: 0, dy: 0 };
      labelMarker.getTooltip()?.update();
    }

    function applyPriorityLabelScreenOffset(labelMarker, anchor, dx, dy) {
      if (!labelMarker || !anchor) return;
      const point = map.latLngToContainerPoint(anchor);
      const next = {
        dx: (labelMarker._labelPixelOffset?.dx || 0) + dx,
        dy: (labelMarker._labelPixelOffset?.dy || 0) + dy
      };
      labelMarker._labelPixelOffset = next;
      labelMarker.setLatLng(map.containerPointToLatLng([
        point.x + next.dx,
        point.y + next.dy
      ]));
      labelMarker.getTooltip()?.update();
    }

    function groupPriorityLabelsByOverlap(entries) {
      const parent = entries.map((_, index) => index);
      function find(index) {
        return parent[index] === index ? index : (parent[index] = find(parent[index]));
      }
      function union(a, b) {
        parent[find(a)] = find(b);
      }

      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          if (labelRectsOverlap(entries[i].rect, entries[j].rect)) {
            union(i, j);
          }
        }
      }

      const groups = new Map();
      entries.forEach((entry, index) => {
        const root = find(index);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(entry);
      });
      return [...groups.values()];
    }

    function collectPriorityLabelEntries() {
      const entries = [];
      if (!priorityLabelGroup || !map.hasLayer(priorityLabelGroup)) return entries;

      priorityLabelGroup.eachLayer((layer) => {
        const tooltip = layer.getTooltip?.();
        const element = tooltip?.getElement?.();
        if (!element || element.style.visibility === "hidden") return;
        const anchor = layer._labelDeclutterAnchor || layer.getLatLng?.();
        if (!anchor) return;
        entries.push({ layer, element, anchor, fontScale: 1, rect: null });
      });
      return entries;
    }

    function priorityLabelTextElement(tooltipElement) {
      return tooltipElement?.querySelector(".priority-intervention-label-text") || tooltipElement;
    }

    function priorityLabelWrapWidthPx(fontSizeRem) {
      const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const fontPx = PRIORITY_LABEL_BASE_FONT_REM * fontSizeRem * rootFontPx;
      const averageCharsPerWord = 6.2;
      const averageCharWidth = fontPx * 0.52;
      return Math.max(
        48,
        Math.round(priorityLabelUserAdjustments.wordsPerLine * averageCharsPerWord * averageCharWidth)
      );
    }

    function priorityLabelTooltipHtml(text) {
      return `<span class="priority-intervention-label-text">${escapeHtml(text)}</span>`;
    }

    function applyPriorityLabelScale(element, fontScale) {
      const effectiveFontScale = fontScale * priorityLabelUserAdjustments.sizeScale;
      const wrapWidthPx = priorityLabelWrapWidthPx(effectiveFontScale);
      const textElement = priorityLabelTextElement(element);

      element.style.setProperty("--priority-label-scale", String(effectiveFontScale));
      element.style.width = `${wrapWidthPx}px`;
      element.style.maxWidth = `${wrapWidthPx}px`;
      element.style.boxSizing = "border-box";
      element.style.textAlign = "center";

      textElement.style.fontSize = `${PRIORITY_LABEL_BASE_FONT_REM * effectiveFontScale}rem`;
      textElement.style.lineHeight = String(priorityLabelUserAdjustments.lineHeight);
      textElement.style.width = "100%";
      textElement.style.maxWidth = "100%";
      textElement.style.display = "block";
      textElement.style.boxSizing = "border-box";
      textElement.style.textAlign = "center";
    }

    function updatePriorityLabelTooltips() {
      if (!priorityLabelGroup) return;
      priorityLabelGroup.eachLayer((layer) => {
        layer.getTooltip()?.update();
      });
    }

    function refreshPriorityLabelLayout() {
      layoutPriorityLabels();
      requestAnimationFrame(() => {
        layoutPriorityLabels();
        updatePriorityLabelTooltips();
      });
    }

    function measurePriorityLabelEntries(entries) {
      entries.forEach((entry) => {
        entry.rect = entry.element.getBoundingClientRect();
      });
      return entries.filter((entry) => entry.rect.width > 0 && entry.rect.height > 0);
    }

    function layoutPriorityLabels() {
      if (!priorityLabelGroup || !map.hasLayer(priorityLabelGroup)) return;

      const zoom = map.getZoom();
      if (zoom < ZOOM_SHOW_PRIORITIES) return;

      const zoomScale = priorityLabelZoomScale(zoom);
      const minFontScale = PRIORITY_LABEL_MIN_OVERLAP_SCALE * zoomScale;
      const entries = collectPriorityLabelEntries();
      if (!entries.length) return;

      entries.forEach((entry) => {
        entry.fontScale = zoomScale;
        resetPriorityLabelScreenOffset(entry.layer);
        applyPriorityLabelScale(entry.element, entry.fontScale);
      });

      for (let iteration = 0; iteration < PRIORITY_LABEL_RESOLVE_ITERATIONS; iteration += 1) {
        const measured = measurePriorityLabelEntries(entries);
        if (!measured.length) return;

        const groups = groupPriorityLabelsByOverlap(measured);
        const overlappingGroups = groups.filter((group) => group.length > 1);
        if (!overlappingGroups.length) break;

        overlappingGroups.forEach((group) => {
          group.forEach((entry) => {
            entry.fontScale = Math.max(minFontScale, entry.fontScale * 0.94);
            applyPriorityLabelScale(entry.element, entry.fontScale);
          });
          measurePriorityLabelEntries(group);

          group.forEach((entry, index) => {
            for (let peer = index + 1; peer < group.length; peer += 1) {
              const other = group[peer];
              if (!labelRectsOverlap(entry.rect, other.rect)) continue;

              const overlapY = Math.min(entry.rect.bottom, other.rect.bottom)
                - Math.max(entry.rect.top, other.rect.top);
              const overlapX = Math.min(entry.rect.right, other.rect.right)
                - Math.max(entry.rect.left, other.rect.left);
              const pushY = overlapY > 0
                ? (overlapY / 2) + PRIORITY_LABEL_OVERLAP_PADDING_PX
                : 0;
              const pushX = overlapX > 0
                ? (overlapX / 2) + PRIORITY_LABEL_OVERLAP_PADDING_PX
                : 0;

              if (pushY >= pushX && pushY > 0) {
                applyPriorityLabelScreenOffset(other.layer, other.anchor, 0, pushY);
                applyPriorityLabelScreenOffset(entry.layer, entry.anchor, 0, -pushY);
              } else if (pushX > 0) {
                applyPriorityLabelScreenOffset(other.layer, other.anchor, pushX, 0);
                applyPriorityLabelScreenOffset(entry.layer, entry.anchor, -pushX, 0);
              }

              entry.rect = entry.element.getBoundingClientRect();
              other.rect = other.element.getBoundingClientRect();
            }
          });
        });
      }

      updatePriorityLabelTooltips();
    }

    function syncPriorityLabelPositions() {
      if (!priorityLabelGroup || !map.hasLayer(priorityLabelGroup)) return;
      priorityLabelById.forEach((labelMarker, pointId) => {
        const marker = markerById.get(pointId);
        if (!marker?.getLatLng || !labelMarker?.setLatLng) return;
        const anchor = marker.getLatLng();
        labelMarker.setLatLng(anchor);
        labelMarker._labelDeclutterAnchor = anchor;
        labelMarker._labelPixelOffset = { dx: 0, dy: 0 };
      });
    }

    function scheduleMapLayoutRefresh() {
      if (layoutRefreshQueued) return;
      layoutRefreshQueued = true;
      requestAnimationFrame(() => {
        layoutRefreshQueued = false;
        applyDeclutter();
      });
    }

    function styleForLayer(layerId) {
      return STYLES[layerId] || {};
    }

    function polygonStyle(layerId) {
      const style = styleForLayer(layerId);
      if (layerId === "boundary_cluster") {
        return {
          color: style.strokeColor || "#002673",
          weight: style.strokeWidth || 2,
          fillColor: style.fillColor || "#e9ffbe",
          fillOpacity: style.fillOpacity ?? 0.2,
          className: "non-interactive-boundary",
          interactive: false
        };
      }
      if (layerId === "boundary_community") {
        return {
          color: style.strokeColor || "#cccccc",
          weight: style.strokeWidth || 1,
          fillColor: style.fillColor || "#259070",
          fillOpacity: style.fillOpacity ?? 0,
          className: "non-interactive-boundary",
          interactive: false
        };
      }
      return {
        color: style.strokeColor || "#666666",
        weight: style.strokeWidth || 2,
        fillColor: style.fillColor || "#cccccc",
        fillOpacity: 0.08
      };
    }

    function lineStyle(layerId) {
      const style = styleForLayer(layerId);
      return {
        color: style.strokeColor || "#ffffff",
        weight: style.strokeWidth || 2,
        opacity: 0.9
      };
    }

    function pointStyle(layerId) {
      const style = styleForLayer(layerId);
      return {
        radius: style.pointRadius || 5,
        color: style.strokeColor || "#ffffff",
        weight: style.strokeWidth || 1.5,
        fillColor: style.fillColor || style.markerFill || "#333333",
        fillOpacity: 0.95
      };
    }

    function pointLayer(feature, latlng, layerId) {
      const style = styleForLayer(layerId);
      let layer;
      if (style.icon) {
        const iconSize = style.iconSize || [22, 22];
        layer = L.marker(latlng, {
          icon: L.icon({
            iconUrl: style.icon,
            iconSize,
            iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
            popupAnchor: [0, -iconSize[1] / 2],
            className: "facility-marker"
          })
        });
      } else {
        layer = L.circleMarker(latlng, pointStyle(layerId));
      }
      layer._declutterAnchor = latlng;
      layer._declutterKind = "facility";
      return layer;
    }

    function popupFromProps(layerId, props) {
      const rows = Object.entries(props || {})
        .filter(([key, value]) => value != null && !/^Shape_/i.test(key) && !/^(OBJECTID|Join_Count|TARGET_FID|Name_\d+|Cluster_\d+)$/i.test(key))
        .slice(0, 8)
        .map(([key, value]) => `<span><strong>${key}:</strong> ${value}</span>`)
        .join("");
      return `<strong>${MANIFEST.find((item) => item.id === layerId)?.label || layerId}</strong><div class="popup-meta">${rows || "<span>Integrated Locations Database feature</span>"}</div>`;
    }

    function pointPopupHtml(layerId, props, lat, lon) {
      const label = MANIFEST.find((item) => item.id === layerId)?.label || layerId;
      const name = props?.Name;
      const title = name ? `${label}: ${name}` : label;
      const extraMeta = Object.entries(props || {})
        .filter(([key, value]) => value != null && !/^Shape_/i.test(key) && !/^(OBJECTID|Join_Count|TARGET_FID|Name_\d+|Cluster_\d+)$/i.test(key) && key !== "Name")
        .slice(0, 5)
        .map(([key, value]) => `<span><strong>${key}:</strong> ${value}</span>`)
        .join("");
      const photo = typeof findPhotoAt === "function" ? findPhotoAt(lat, lon) : null;
      if (photo && typeof photoPopupHtml === "function") {
        return window.photoPopupHtml(photo, title, extraMeta);
      }
      return popupFromProps(layerId, props);
    }

    function bindBoundaryLabel(featureLayer, layerId, properties) {
      const label = properties?.Name;
      featureLayer.options.interactive = false;
      featureLayer.on("add", () => {
        const element = featureLayer.getElement?.();
        if (element) element.style.pointerEvents = "none";
      });
      if (!label) return;
      featureLayer.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: `boundary-label ${layerId === "boundary_cluster" ? "cluster-label" : "community-label"}`,
        opacity: 1
      });
    }

    function featureMatchesFilters(props, entry) {
      const cluster = clusterFilter.value;
      const village = villageFilter.value;

      if (entry.group === "Boundaries") {
        if (entry.id === "boundary_cluster") {
          if (cluster === "All") return BAGHLAN_CLUSTERS.has(normalizeCluster(props.Name));
          return normalizeCluster(props.Name) === cluster;
        }
        if (entry.id === "boundary_community") {
          if (cluster === "All") return true;
          return featureCluster(props) === cluster;
        }
        return true;
      }

      if (cluster !== "All") {
        const featureClusterValue = featureCluster(props);
        if (!featureClusterValue || featureClusterValue !== cluster) return false;
      }
      if (village !== "All") {
        const featureVillageValue = featureVillage(props);
        if (featureVillageValue && !villageMatches(featureVillageValue, village)) return false;
      }
      return true;
    }

    function rebuildDatabaseLayer(entry) {
      const store = databaseStores.get(entry.id);
      const geojson = LAYERS[entry.id];
      store.group.clearLayers();
      if (!geojson) return;

      const features = geojson.features.filter((feature) => featureMatchesFilters(feature.properties || {}, entry));
      L.geoJSON(
        { type: "FeatureCollection", features },
        {
          pointToLayer(feature, latlng) {
            return pointLayer(feature, latlng, entry.id);
          },
          style() {
            if (entry.geometry === "line") return lineStyle(entry.id);
            if (entry.geometry === "polygon") return polygonStyle(entry.id);
            return pointStyle(entry.id);
          },
          onEachFeature(feature, featureLayer) {
            if (entry.geometry === "point") {
              featureLayer.bindPopup(() => {
                const latlng = featureLayer.getLatLng();
                return pointPopupHtml(entry.id, feature.properties, latlng.lat, latlng.lng);
              }, { maxWidth: 320 });
            } else if (entry.id !== "boundary_community" && entry.id !== "boundary_cluster") {
              featureLayer.bindPopup(popupFromProps(entry.id, feature.properties));
            }
            if (entry.id === "boundary_cluster" || entry.id === "boundary_community") {
              bindBoundaryLabel(featureLayer, entry.id, feature.properties);
            }
          }
        }
      ).eachLayer((layer) => store.group.addLayer(layer));
      store.visibleCount = features.length;
    }

    function overlayLayerList() {
      return Object.values(layerControlEntries);
    }

    function syncToggleAllLayersInputs(checked, indeterminate) {
      [toggleAllLayersCheckbox, toggleAllLayersSidebar].forEach((input) => {
        if (!input) return;
        input.checked = checked;
        input.indeterminate = indeterminate;
      });
    }

    function updateToggleAllLayersCheckbox() {
      const layers = overlayLayerList();
      const visibleCount = layers.filter((layer) => map.hasLayer(layer)).length;
      syncToggleAllLayersInputs(
        visibleCount === layers.length,
        visibleCount > 0 && visibleCount < layers.length
      );
    }

    function setAllOverlaysVisible(visible) {
      overlayLayerList().forEach((layer) => {
        if (visible) {
          if (!map.hasLayer(layer)) map.addLayer(layer);
        } else if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
      updateToggleAllLayersCheckbox();
      scheduleMapLayoutRefresh();
    }

    function ensureToggleAllLayersCheckbox() {
      if (!layersControl) return;

      const container = layersControl.getContainer();
      if (!container) return;

      const section = container.querySelector(".leaflet-control-layers-list");
      const overlays = container.querySelector(".leaflet-control-layers-overlays");
      if (!section || !overlays) return;

      let label = section.querySelector("label.layer-toggle-all-label");
      if (!label) {
        label = L.DomUtil.create("label", "layer-toggle-all-label", section);
        toggleAllLayersCheckbox = L.DomUtil.create("input", "layer-toggle-all-input", label);
        toggleAllLayersCheckbox.type = "checkbox";
        toggleAllLayersCheckbox.checked = true;
        toggleAllLayersCheckbox.addEventListener("change", () => {
          setAllOverlaysVisible(toggleAllLayersCheckbox.checked);
        });

        const text = L.DomUtil.create("span", "", label);
        text.textContent = "All layers";

        section.insertBefore(label, overlays);
      }

      updateToggleAllLayersCheckbox();
    }

    function setupToggleAllLayersCheckbox(retryCount = 0) {
      if (!layersControl) return;

      const container = layersControl.getContainer();
      if (!container) {
        if (retryCount < 20) {
          setTimeout(() => setupToggleAllLayersCheckbox(retryCount + 1), 50);
        }
        return;
      }

      if (!container.querySelector(".leaflet-control-layers-overlays")) {
        if (retryCount < 20) {
          setTimeout(() => setupToggleAllLayersCheckbox(retryCount + 1), 50);
        }
        return;
      }

      if (!layersControl._toggleAllPatched) {
        const originalUpdate = layersControl._update.bind(layersControl);
        layersControl._update = function patchedLayerControlUpdate() {
          originalUpdate();
          ensureToggleAllLayersCheckbox();
        };
        layersControl._toggleAllPatched = true;
      }

      ensureToggleAllLayersCheckbox();

      if (!toggleAllLayersListenersReady) {
        toggleAllLayersListenersReady = true;
        map.on("layeradd layerremove", (event) => {
          if (overlayLayerList().includes(event.layer)) {
            updateToggleAllLayersCheckbox();
            scheduleMapLayoutRefresh();
          }
        });
      }
    }

    function initDatabaseLayers() {
      databaseManifestEntries().forEach((entry) => {
        if (!LAYERS[entry.id]) return;
        const group = L.layerGroup().addTo(map);
        databaseStores.set(entry.id, { entry, group, visibleCount: 0 });
        layerControlEntries[entry.label] = group;
        rebuildDatabaseLayer(entry);
      });

      const controlEntries = (() => {
        const ordered = {};
        [
          "Cluster boundaries",
          "Community boundaries",
          priorityLayerLabel,
          priorityLabelLayerName
        ].forEach((label) => {
          if (layerControlEntries[label]) ordered[label] = layerControlEntries[label];
        });
        Object.keys(layerControlEntries).forEach((label) => {
          if (!ordered[label]) ordered[label] = layerControlEntries[label];
        });
        return ordered;
      })();

      layersControl = L.control.layers(
        BASE_MAP_LAYERS,
        controlEntries,
        { collapsed: true }
      ).addTo(map);

      setTimeout(() => setupToggleAllLayersCheckbox(), 0);
    }

    function pointPhotos(point) {
      if (point.photos && point.photos.length) return point.photos;
      return [{
        title: point.title,
        image: point.image,
        file: point.file,
        theme: point.theme,
        level: point.level,
        note: point.note,
        lat: point.lat,
        lon: point.lon
      }];
    }

    function countPriorityPhotos(points) {
      return points.reduce((total, point) => total + (point.photoCount || pointPhotos(point).length || 1), 0);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function galleryMetaHtml(point, photo) {
      if (IS_INFRASTRUCTURE_DISPLAY) {
        return infrastructureMetaHtml(point);
      }

      const sourceHtml = point.sourceDocument
        ? `<span><strong>Source:</strong> ${escapeHtml(point.sourceDocument)}</span>`
        : "";
      return `
        <span><strong>Cluster:</strong> ${escapeHtml(point.cluster)}</span>
        <span><strong>Village:</strong> ${escapeHtml(point.village)}</span>
        <span><strong>Theme:</strong> ${escapeHtml(photo.theme)}</span>
        <span><strong>Priority level:</strong> ${escapeHtml(photo.level)}</span>
        ${sourceHtml}
        <span><strong>GPS:</strong> ${photo.lat.toFixed(8)}, ${photo.lon.toFixed(8)}</span>
        <span><strong>Photo:</strong> ${escapeHtml(photo.file)}</span>
      `;
    }

    function syncGalleryPopup(galleryEl) {
      const pointId = Number(galleryEl.dataset.pointId);
      const photos = priorityGalleryStore.get(pointId);
      if (!photos?.length) return;

      const index = Number(galleryEl.dataset.photoIndex || 0);
      const photo = photos[index];
      const displayId = galleryEl.dataset.displayId;
      const image = galleryEl.querySelector(".popup-photo");
      const counter = galleryEl.querySelector(".gallery-counter");

      if (image) {
        image.src = imageSrc(photo.image);
        image.alt = photo.title || "Priority photo";
      }
      galleryEl.querySelector(".popup-title").textContent = IS_INFRASTRUCTURE_DISPLAY
        ? `${displayId}. ${galleryEl.dataset.intervention || photo.file || "Infrastructure priority"}`
        : `${displayId}. ${photo.title || photo.file}`;
      const noteEl = galleryEl.querySelector(".popup-gallery-note");
      if (noteEl) {
        noteEl.textContent = IS_INFRASTRUCTURE_DISPLAY ? "" : (photo.note || "");
        noteEl.hidden = IS_INFRASTRUCTURE_DISPLAY;
      }
      galleryEl.querySelector(".popup-gallery-meta").innerHTML = galleryMetaHtml(
        IS_INFRASTRUCTURE_DISPLAY
          ? {
            intervention: galleryEl.dataset.intervention,
            location: galleryEl.dataset.location,
            level: galleryEl.dataset.level,
            lat: Number(galleryEl.dataset.lat),
            lon: Number(galleryEl.dataset.lon),
            title: galleryEl.dataset.intervention,
            village: galleryEl.dataset.location
          }
          : {
            cluster: galleryEl.dataset.cluster,
            village: galleryEl.dataset.village,
            sourceDocument: galleryEl.dataset.sourceDocument
          },
        photo
      );
      if (counter) counter.textContent = `${index + 1} / ${photos.length}`;
    }

    function stepGalleryPopup(galleryEl, step) {
      const photos = priorityGalleryStore.get(Number(galleryEl.dataset.pointId));
      if (!photos?.length) return;
      const nextIndex = (Number(galleryEl.dataset.photoIndex || 0) + step + photos.length) % photos.length;
      galleryEl.dataset.photoIndex = String(nextIndex);
      syncGalleryPopup(galleryEl);
    }

    function popupHtml(point) {
      if (IS_INFRASTRUCTURE_DISPLAY) {
        return infrastructurePopupHtml(point);
      }

      const photos = pointPhotos(point);
      priorityGalleryStore.set(point.id, photos);
      const first = photos[0];
      const multi = photos.length > 1;
      const popupTitle = IS_INFRASTRUCTURE_DISPLAY
        ? `${point.displayId}. ${point.intervention || point.title}`
        : `${point.displayId}. ${escapeHtml(first.title || first.file || point.title)}`;
      const noteHtml = IS_INFRASTRUCTURE_DISPLAY
        ? ""
        : `<p class="popup-text popup-gallery-note">${escapeHtml(first.note || "")}</p>`;
      const photoBlock = first?.image
        ? `
          <div class="popup-gallery-frame">
            ${multi ? '<button type="button" class="gallery-btn gallery-prev" aria-label="Previous photo">&lsaquo;</button>' : ""}
            <img class="popup-photo" src="${imageSrc(first.image)}" alt="${escapeHtml(first.file || first.title || "Field photo")}" data-display-src="${imageSrc(first.image)}">
            ${multi ? '<button type="button" class="gallery-btn gallery-next" aria-label="Next photo">&rsaquo;</button>' : ""}
          </div>
          ${multi ? `<div class="gallery-counter">1 / ${photos.length}</div>` : ""}
        `
        : "";

      return `
        <div
          class="popup-gallery"
          data-point-id="${point.id}"
          data-display-id="${point.displayId}"
          data-photo-index="0"
          data-cluster="${escapeHtml(point.cluster)}"
          data-village="${escapeHtml(point.village)}"
          data-intervention="${escapeHtml(point.intervention || point.title)}"
          data-location="${escapeHtml(point.location || point.village)}"
          data-level="${escapeHtml(point.level)}"
          data-lat="${point.lat}"
          data-lon="${point.lon}"
          data-source-document="${escapeHtml(point.sourceDocument || "")}"
        >
          ${photoBlock}
          <h3 class="popup-title">${popupTitle}</h3>
          ${noteHtml}
          <div class="popup-meta popup-gallery-meta">${galleryMetaHtml(point, first || {})}</div>
        </div>
      `;
    }

    function markerIcon(point) {
      const countBadge = !IS_INFRASTRUCTURE_DISPLAY && point.photoCount > 1
        ? `<span class="priority-marker-count">${point.photoCount}</span>`
        : "";
      return L.divIcon({
        className: "",
        html: `<div class="priority-marker ${point.markerClass}">${point.displayId}${countBadge}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17]
      });
    }

    function populateBasemapFilter() {
      basemapFilter.innerHTML = BASE_MAP_OPTIONS
        .map((entry) => `<option value="${entry.name}">${entry.name}</option>`)
        .join("");
      basemapFilter.value = DEFAULT_BASE_MAP;
    }

    function setBaseMap(name) {
      const target = BASE_MAP_LAYERS[name];
      if (!target || map.hasLayer(target)) return;
      BASE_MAP_OPTIONS.forEach((entry) => {
        if (map.hasLayer(entry.layer)) {
          map.removeLayer(entry.layer);
        }
      });
      target.addTo(map);
      basemapFilter.value = name;
    }

    function syncBasemapFilterFromMap(layer) {
      const name = layer?._baseMapName;
      if (name && basemapFilter.value !== name) {
        basemapFilter.value = name;
      }
    }

    function populateClusterFilter() {
      clusterFilter.innerHTML = [
        `<option value="All">All clusters</option>`,
        ...FILTER_META.clusters.map((cluster) => `<option value="${cluster}">${cluster}</option>`)
      ].join("");
      clusterFilter.value = "All";
    }

    function populateVillageFilter() {
      const selectedCluster = clusterFilter.value;
      const villages = selectedCluster === "All"
        ? FILTER_META.villagesByCluster.All || []
        : FILTER_META.villagesByCluster[selectedCluster] || [];
      villageFilter.innerHTML = [
        `<option value="All">${IS_INFRASTRUCTURE_DISPLAY ? "All locations" : "All villages"}</option>`,
        ...villages.map((village) => `<option value="${village}">${village}</option>`)
      ].join("");
    }

    function filteredPriorityPoints() {
      const cluster = clusterFilter.value;
      const village = villageFilter.value;
      const clusterCounters = new Map();
      return ALL_PRIORITY_POINTS
        .filter((point) => {
          const clusterMatch = cluster === "All" || point.cluster === cluster;
          const villageMatch = village === "All" || villageMatches(point.village, village);
          return clusterMatch && villageMatch;
        })
        .map((point) => {
          const next = (clusterCounters.get(point.cluster) || 0) + 1;
          clusterCounters.set(point.cluster, next);
          return { ...point, displayId: next };
        });
    }

    function updateStoryText() {
      if (!storyText) return;
      if (IS_INFRASTRUCTURE_DISPLAY) {
        storyText.textContent = "";
        storyText.closest(".section")?.setAttribute("hidden", "");
        return;
      }
      storyText.closest(".section")?.removeAttribute("hidden");
      const cluster = clusterFilter.value;
      const points = filteredPriorityPoints();
      if (CLUSTER_STORIES[cluster]) {
        storyText.textContent = CLUSTER_STORIES[cluster];
        return;
      }
      if (!points.length) {
        storyText.textContent = "No photo-backed priorities match the current filter. Adjust the cluster or village selection to view community evidence.";
        return;
      }
      const themes = [...new Set(points.map((point) => point.theme))].slice(0, 4).join("; ");
      storyText.textContent = `${cluster} community FGDs flagged ${points.length} photo-backed priority locations (${countPriorityPhotos(points)} field photos) across ${new Set(points.map((point) => point.village)).size} villages. Dominant themes include ${themes}. Click any numbered marker or sidebar card to browse linked field photos and priority notes.`;
    }

    function selectPoint(point) {
      document.querySelectorAll(".card").forEach((card) => {
        card.classList.toggle("active", Number(card.dataset.id) === point.id);
      });
      const marker = markerById.get(point.id);
      const target = marker?.getLatLng?.() || markerLatLng(point);
      map.setView(target, Math.max(map.getZoom(), 17), { animate: true });
      marker?.openPopup();
    }

    function renderPriorityCards(points) {
      cards.innerHTML = "";
      cardsEmpty.hidden = points.length > 0;
      points.forEach((point) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "card";
        card.dataset.id = String(point.id);
        card.innerHTML = `
          ${!IS_INFRASTRUCTURE_DISPLAY && point.image ? `<img src="${imageSrc(point.image)}" alt="">` : `<span class="card-photo-placeholder" aria-hidden="true"></span>`}
          <span>
            <strong>${point.displayId}. ${IS_INFRASTRUCTURE_DISPLAY ? escapeHtml(point.intervention || point.title) : point.title}</strong>
            <span>${point.cluster}${IS_INFRASTRUCTURE_DISPLAY ? "" : ` · ${point.village}`}</span>
            <span>${IS_INFRASTRUCTURE_DISPLAY ? escapeHtml(point.location || point.village) : `${point.theme} · ${point.level}`}</span>
            ${IS_INFRASTRUCTURE_DISPLAY ? `<span>${escapeHtml(point.level)}</span>` : ""}
            ${!IS_INFRASTRUCTURE_DISPLAY && point.photoCount > 1 ? `<span class="card-photo-count">${point.photoCount} photos</span>` : ""}
          </span>
        `;
        card.addEventListener("click", () => selectPoint(point));
        cards.appendChild(card);
      });
    }

    const PRIORITY_LABEL_ICON = L.divIcon({
      className: "priority-label-anchor",
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    function priorityInterventionText(point) {
      return String(point.intervention || point.title || "").trim();
    }

    function priorityLabelTooltipOptions() {
      return {
        permanent: true,
        direction: "bottom",
        offset: [0, 22],
        className: "priority-intervention-label",
        opacity: 1
      };
    }

    function renderPriorityLabels(points) {
      if (!priorityLabelGroup) return;
      priorityLabelGroup.clearLayers();
      points.forEach((point) => {
        const text = priorityInterventionText(point);
        if (!text) return;

        let labelMarker = priorityLabelById.get(point.id);
        const latlng = markerLatLng(point);
        if (!labelMarker) {
          labelMarker = L.marker(latlng, {
            icon: PRIORITY_LABEL_ICON,
            interactive: false,
            keyboard: false,
            zIndexOffset: 800 + point.id
          });
          labelMarker.bindTooltip(priorityLabelTooltipHtml(text), priorityLabelTooltipOptions());
          priorityLabelById.set(point.id, labelMarker);
        } else {
          labelMarker.setLatLng(latlng);
          const tooltip = labelMarker.getTooltip();
          if (tooltip) {
            tooltip.setContent(priorityLabelTooltipHtml(text));
            Object.assign(tooltip.options, priorityLabelTooltipOptions());
            tooltip.update();
          }
        }
        const tooltipElement = labelMarker.getTooltip()?.getElement?.();
        if (tooltipElement) {
          applyPriorityLabelScale(tooltipElement, priorityLabelZoomScale(map.getZoom()));
        }
        labelMarker.addTo(priorityLabelGroup);
      });
    }

    function renderPriorityMarkers(points) {
      assignDuplicateGpsSpread(points);
      priorityGroup.clearLayers();
      points.forEach((point) => {
        let marker = markerById.get(point.id);
        if (!marker) {
          marker = L.marker(markerLatLng(point), {
            icon: markerIcon(point),
            title: point.title,
            zIndexOffset: 1000 + point.id
          }).bindPopup(() => popupHtml(point), { maxWidth: 320 });
          markerById.set(point.id, marker);
        } else {
          marker.setLatLng(markerLatLng(point));
          marker.setIcon(markerIcon(point));
          marker.setPopupContent(popupHtml(point));
        }
        const [spreadLat, spreadLon] = markerLatLng(point);
        marker._declutterAnchor = anchorLatLng(spreadLat, spreadLon);
        marker._declutterKind = "priority";
        marker.addTo(priorityGroup);
      });

      if (clusterFilter.value === "Cluster 3" && villageFilter.value === "All") {
        if (!corridorLayer) {
          corridorLayer = L.polyline(
            [
              [36.208832, 68.759156],
              [36.208123, 68.76747697],
              [36.211308, 68.76527197]
            ],
            { color: "#f2c36b", weight: 4, opacity: 0.85, dashArray: "9 8" }
          );
          corridorLayer.bindTooltip("Priority corridor: school, culvert/access, flood protection", { sticky: true });
        }
        priorityGroup.addLayer(corridorLayer);
      }
    }

    function countVisibleFacilities() {
      let total = 0;
      databaseStores.forEach((store) => {
        if (store.entry.group !== "Boundaries") total += store.visibleCount || 0;
      });
      return total;
    }

    function boundsFromFeatures(features) {
      if (!features.length) return null;
      const bounds = L.geoJSON({ type: "FeatureCollection", features }).getBounds();
      return bounds.isValid() ? bounds : null;
    }

    function baghlanClusterBoundaries(clusterName) {
      const geojson = LAYERS.boundary_cluster;
      if (!geojson) return [];
      return geojson.features.filter((feature) => {
        const name = normalizeCluster(feature.properties?.Name);
        if (clusterName && clusterName !== "All") return name === clusterName;
        return BAGHLAN_CLUSTERS.has(name);
      });
    }

    function communityBoundaries(cluster, village) {
      const geojson = LAYERS.boundary_community;
      if (!geojson) return [];
      return geojson.features.filter((feature) => {
        const props = feature.properties || {};
        if (!props.Name || !villageMatches(props.Name, village)) return false;
        if (cluster === "All") return true;
        const featureClusterValue = featureCluster(props);
        return !featureClusterValue || featureClusterValue === cluster;
      });
    }

    function fitToVisiblePoints(points) {
      const boundsPoints = [...points.map((point) => markerLatLng(point))];
      databaseStores.forEach((store) => {
        if (store.entry.group === "Boundaries") return;
        store.group.eachLayer((layer) => {
          if (typeof layer.getLatLng === "function") {
            boundsPoints.push(layer.getLatLng());
          }
        });
      });
      if (!boundsPoints.length) return null;
      return L.latLngBounds(boundsPoints);
    }

    function fitCenterWithBoundsConstraint(center, constraintBounds, { animate = true, padding = 0.08 } = {}) {
      if (!constraintBounds?.isValid()) return;
      const padded = constraintBounds.pad(padding);
      const corners = [
        padded.getNorthWest(),
        padded.getNorthEast(),
        padded.getSouthWest(),
        padded.getSouthEast()
      ];

      function allCornersVisible(testZoom) {
        map.setView(center, testZoom, { animate: false });
        const viewBounds = map.getBounds();
        return corners.every((corner) => viewBounds.contains(corner));
      }

      let bestZoom = map.getMinZoom();
      for (let zoom = map.getMaxZoom(); zoom >= map.getMinZoom(); zoom -= MAP_ZOOM_STEP) {
        if (allCornersVisible(zoom)) {
          bestZoom = zoom;
          break;
        }
      }

      map.setView(center, bestZoom, { animate });
    }

    function villageContextFeatures(cluster, village) {
      const villageFeatures = communityBoundaries(cluster, village);
      if (!villageFeatures.length) return villageFeatures;

      let contextCluster = cluster;
      if (cluster === "All") {
        contextCluster = featureCluster(villageFeatures[0].properties || {}) || "All";
      }

      const features = [...villageFeatures];
      if (contextCluster && contextCluster !== "All") {
        features.push(...baghlanClusterBoundaries(contextCluster));
        const geojson = LAYERS.boundary_community;
        if (geojson) {
          geojson.features.forEach((feature) => {
            const props = feature.properties || {};
            if (!props.Name) return;
            if (featureCluster(props) === contextCluster) features.push(feature);
          });
        }
      } else {
        features.push(...baghlanClusterBoundaries("All"));
      }
      return features;
    }

    function fitToClusterBoundary(clusterName, { animate = true } = {}) {
      const bounds = boundsFromFeatures(baghlanClusterBoundaries(clusterName));
      if (!bounds) return;
      map.fitBounds(bounds.pad(0.12), { animate });
    }

    function fitToDefaultHomeView({ animate = false } = {}) {
      const allBounds = boundsFromFeatures(baghlanClusterBoundaries("All"));
      const focusBounds = boundsFromFeatures(baghlanClusterBoundaries(DEFAULT_START_CLUSTER));
      if (!allBounds || !focusBounds) return;
      fitCenterWithBoundsConstraint(focusBounds.getCenter(), allBounds, { animate, padding: 0.08 });
    }

    function fitToSelection(points) {
      const cluster = clusterFilter.value;
      const village = villageFilter.value;
      const isFiltered = cluster !== "All" || village !== "All";

      if (village !== "All") {
        const villageBounds = boundsFromFeatures(communityBoundaries(cluster, village));
        const contextBounds = boundsFromFeatures(villageContextFeatures(cluster, village));
        if (villageBounds && contextBounds) {
          fitCenterWithBoundsConstraint(villageBounds.getCenter(), contextBounds, { animate: true, padding: 0.12 });
          return;
        }
      } else if (cluster !== "All") {
        fitToClusterBoundary(cluster, { animate: true });
        return;
      } else {
        fitToDefaultHomeView({ animate: isFiltered });
        return;
      }

      const bounds = fitToVisiblePoints(points);
      if (!bounds) return;
      map.fitBounds(bounds.pad(0.12), { animate: true });
    }

    function applyFilters(shouldFitBounds) {
      databaseStores.forEach((store) => rebuildDatabaseLayer(store.entry));
      const points = filteredPriorityPoints();
      renderPriorityMarkers(points);
      renderPriorityLabels(points);
      renderPriorityCards(points);
      updateStoryText();
      filterSummary.textContent = IS_INFRASTRUCTURE_DISPLAY
        ? `Showing ${points.length} infrastructure priorities. Use each popup to browse nearby photos within ${AREA_PHOTO_RADIUS_METERS} m.`
        : `Showing ${points.length} priority locations (${countPriorityPhotos(points)} of ${ALL_PRIORITY_POINTS.reduce((total, point) => total + (point.photoCount || pointPhotos(point).length || 1), 0)} photos) and ${countVisibleFacilities()} Integrated Locations Database features`;
      if (shouldFitBounds) fitToSelection(points);
      scheduleMapLayoutRefresh();
    }

    function initPriorityMarkers() {
      ALL_PRIORITY_POINTS.forEach((point) => {
        markerById.set(
          point.id,
          L.marker(markerLatLng(point), { icon: markerIcon({ ...point, displayId: point.id }), title: point.title })
            .bindPopup("", { maxWidth: 320 })
        );
      });
    }

    populateBasemapFilter();
    populateClusterFilter();
    populateVillageFilter();
    initMapNav();
    initSideHeaderToggle();
    initPriorityMarkers();
    initDatabaseLayers();
    applyFilters(false);
    fitToDefaultHomeView({ animate: false });

    map.on("baselayerchange", (event) => {
      syncBasemapFilterFromMap(event.layer);
    });
    map.on("zoomend moveend", scheduleMapLayoutRefresh);
    scheduleMapLayoutRefresh();

    basemapFilter.addEventListener("change", () => {
      setBaseMap(basemapFilter.value);
    });

    clusterFilter.addEventListener("change", () => {
      populateVillageFilter();
      syncExportSubtitleField();
      applyFilters(true);
    });
    villageFilter.addEventListener("change", () => applyFilters(true));

    toggleAllLayersSidebar.addEventListener("change", () => {
      setAllOverlaysVisible(toggleAllLayersSidebar.checked);
    });

    const photoLightbox = document.getElementById("photoLightbox");
    const photoLightboxImage = photoLightbox.querySelector(".photo-lightbox-image");
    const photoLightboxMessage = photoLightbox.querySelector(".photo-lightbox-message");
    const photoLightboxClose = photoLightbox.querySelector(".photo-lightbox-close");
    const photoLightboxPrev = photoLightbox.querySelector(".photo-lightbox-prev");
    const photoLightboxNext = photoLightbox.querySelector(".photo-lightbox-next");
    const photoLightboxCounter = photoLightbox.querySelector(".photo-lightbox-counter");
    const photoLightboxCaption = photoLightbox.querySelector(".photo-lightbox-caption");

    function renderLightboxSlide() {
      if (!lightboxPhotos?.length) return;
      const photo = lightboxPhotos[lightboxIndex];
      const src = imageSrc(photo.image);
      photoLightboxImage.hidden = false;
      photoLightboxMessage.hidden = true;
      photoLightboxImage.onload = () => {
        photoLightboxImage.hidden = false;
        photoLightboxMessage.hidden = true;
      };
      photoLightboxImage.onerror = () => {
        photoLightboxImage.hidden = true;
        photoLightboxMessage.hidden = false;
        photoLightboxMessage.textContent = photo.title
          ? `Unable to load "${photo.title}". The linked field photo may need its preview regenerated.`
          : "Unable to load this photo preview.";
      };
      photoLightboxImage.src = src;
      photoLightboxImage.alt = photo.title || photo.file || "Expanded field photo";
      const multi = lightboxPhotos.length > 1;
      photoLightboxPrev.hidden = !multi;
      photoLightboxNext.hidden = !multi;
      photoLightboxCounter.hidden = !multi;
      if (multi) {
        photoLightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
      }
      if (photoLightboxCaption) {
        const fileLabel = photo.file || photo.title || "";
        const distanceLabel = Number.isFinite(photo.distanceMeters)
          ? ` · ${Math.round(photo.distanceMeters)} m from priority`
          : "";
        const captionParts = [lightboxCaption, fileLabel ? `${fileLabel}${distanceLabel}` : ""]
          .filter(Boolean);
        photoLightboxCaption.textContent = captionParts.join(" ");
        photoLightboxCaption.hidden = !captionParts.length;
      }
    }

    function openPhotoLightbox(photos, index) {
      lightboxPhotos = photos;
      lightboxIndex = index;
      renderLightboxSlide();
      photoLightbox.hidden = false;
      document.body.style.overflow = "hidden";
    }

    function closePhotoLightbox() {
      photoLightbox.hidden = true;
      photoLightboxImage.removeAttribute("src");
      photoLightboxImage.alt = "";
      photoLightboxImage.hidden = false;
      photoLightboxImage.onload = null;
      photoLightboxImage.onerror = null;
      photoLightboxMessage.hidden = true;
      if (photoLightboxCaption) {
        photoLightboxCaption.textContent = "";
        photoLightboxCaption.hidden = true;
      }
      lightboxPhotos = null;
      lightboxIndex = 0;
      lightboxCaption = "";
      document.body.style.overflow = "";
    }

    function stepLightbox(step) {
      if (!lightboxPhotos?.length) return;
      lightboxIndex = (lightboxIndex + step + lightboxPhotos.length) % lightboxPhotos.length;
      renderLightboxSlide();
    }

    document.addEventListener("click", (event) => {
      const areaPhotosLink = event.target.closest(".popup-area-photos-link");
      if (areaPhotosLink) {
        event.preventDefault();
        event.stopPropagation();
        const point = priorityPointById.get(Number(areaPhotosLink.dataset.pointId));
        if (point) openAreaPhotosForPoint(point);
        return;
      }

      const prevBtn = event.target.closest(".gallery-prev");
      const nextBtn = event.target.closest(".gallery-next");
      if (prevBtn || nextBtn) {
        event.preventDefault();
        event.stopPropagation();
        const galleryEl = (prevBtn || nextBtn).closest(".popup-gallery");
        if (galleryEl) stepGalleryPopup(galleryEl, prevBtn ? -1 : 1);
        return;
      }

      const photo = event.target.closest(".popup-photo");
      if (!photo) return;
      event.preventDefault();
      event.stopPropagation();
      const galleryEl = photo.closest(".popup-gallery");
      if (galleryEl) {
        const photos = priorityGalleryStore.get(Number(galleryEl.dataset.pointId));
        const index = Number(galleryEl.dataset.photoIndex || 0);
        if (photos?.length) {
          openPhotoLightbox(photos, index);
          return;
        }
      }
      openPhotoLightbox([{
        image: popupPhotoSrc(photo),
        title: photo.getAttribute("alt") || photo.alt || "Field photo"
      }], 0);
    });

    photoLightboxClose.addEventListener("click", closePhotoLightbox);
    photoLightboxPrev.addEventListener("click", (event) => {
      event.stopPropagation();
      stepLightbox(-1);
    });
    photoLightboxNext.addEventListener("click", (event) => {
      event.stopPropagation();
      stepLightbox(1);
    });
    photoLightbox.addEventListener("click", (event) => {
      if (event.target === photoLightbox) closePhotoLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (photoLightbox.hidden) return;
      if (event.key === "Escape") closePhotoLightbox();
      if (event.key === "ArrowLeft") stepLightbox(-1);
      if (event.key === "ArrowRight") stepLightbox(1);
    });

    function isLayerRenderedOnMap(store) {
      if (!store || !map.hasLayer(store.group) || (store.visibleCount || 0) <= 0) {
        return false;
      }

      const zoom = map.getZoom();
      const entry = store.entry;
      const bounds = map.getBounds();

      if (entry.geometry === "point" && zoom < ZOOM_SHOW_FACILITIES) {
        return false;
      }

      let hasVisibleFeature = false;
      store.group.eachLayer((layer) => {
        if (hasVisibleFeature) return;

        if (entry.geometry === "point") {
          const element = layer.getElement?.();
          if (element) {
            const opacity = Number.parseFloat(element.style.opacity || "1");
            if (opacity <= 0) return;
          } else if ((layer.options?.opacity ?? 1) <= 0) {
            return;
          }
          const latlng = layer.getLatLng?.();
          if (latlng && bounds.contains(latlng)) {
            hasVisibleFeature = true;
          }
          return;
        }

        const layerBounds = layer.getBounds?.();
        if (layerBounds?.isValid?.() && bounds.intersects(layerBounds)) {
          hasVisibleFeature = true;
        }
      });
      return hasVisibleFeature;
    }

    function isPriorityLayerRenderedOnMap() {
      if (!map.hasLayer(priorityGroup) || map.getZoom() < ZOOM_SHOW_PRIORITIES) {
        return false;
      }
      const bounds = map.getBounds();
      return filteredPriorityPoints().some((point) => bounds.contains(markerLatLng(point)));
    }

    function isBoundaryLayerInLegend(store) {
      return Boolean(store && map.hasLayer(store.group) && (store.visibleCount || 0) > 0);
    }

    function buildDatabaseLegendItem(entry) {
      const style = styleForLayer(entry.id);
      const item = {
        label: entry.label,
        type: entry.geometry,
        strokeColor: style.strokeColor,
        fillColor: style.fillColor || style.markerFill,
        strokeWidth: style.strokeWidth || 2,
        fillOpacity: 0.35,
        iconUrl: style.icon ? resolveAssetUrl(style.icon) : null
      };

      if (entry.id === "boundary_cluster") {
        item.type = "polygon";
        item.fillColor = style.fillColor || "#e9ffbe";
        item.strokeColor = style.strokeColor || "#002673";
        item.fillOpacity = style.fillOpacity ?? 0.35;
      } else if (entry.id === "boundary_community") {
        item.type = "polygon";
        item.fillColor = style.fillColor || "#259070";
        item.strokeColor = style.strokeColor || "#cccccc";
        item.fillOpacity = 0;
      } else if (entry.geometry === "line") {
        item.type = "line";
        item.strokeColor = style.strokeColor || "#666666";
        item.strokeWidth = style.strokeWidth || 2;
      } else if (entry.geometry === "point") {
        item.type = style.icon ? "icon" : "point";
        item.fillColor = style.fillColor || style.markerFill || "#333333";
        item.strokeColor = style.strokeColor || "#ffffff";
      }

      return item;
    }

    function buildExportLegendItems() {
      const items = [];
      const boundaryOrder = ["boundary_cluster", "boundary_community"];
      const entries = databaseManifestEntries();
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

      boundaryOrder.forEach((layerId) => {
        const entry = entriesById.get(layerId);
        if (!entry) return;
        const store = databaseStores.get(layerId);
        if (!isBoundaryLayerInLegend(store)) return;
        items.push(buildDatabaseLegendItem(entry));
      });

      if (isPriorityLayerRenderedOnMap()) {
        items.push({
          label: priorityLayerLabel,
          type: "priority",
          fillColor: "#4a5568",
          strokeColor: "#ffffff"
        });
      }

      entries.forEach((entry) => {
        if (boundaryOrder.includes(entry.id)) return;
        const store = databaseStores.get(entry.id);
        if (!isLayerRenderedOnMap(store)) return;
        items.push(buildDatabaseLegendItem(entry));
      });

      return items;
    }

    function defaultExportTitle() {
      return document.querySelector(".side-header h1")?.textContent?.trim()
        || document.title
        || "Community Priorities Map";
    }

    function defaultExportSubtitle() {
      const cluster = clusterFilter?.value || "All";
      return cluster === "All" ? "All clusters" : cluster;
    }

    function syncExportSubtitleField() {
      const subtitleInput = document.getElementById("exportSubtitleInput");
      if (!subtitleInput || subtitleInput.dataset.userEdited === "true") return;
      subtitleInput.value = defaultExportSubtitle();
    }

    function initPriorityLabelAdjustControls() {
      const section = document.getElementById("priorityLabelAdjustFields");
      if (!section || !IS_INFRASTRUCTURE_DISPLAY || !priorityLabelGroup) return;

      section.hidden = false;

      const sizeSlider = document.getElementById("priorityLabelSizeSlider");
      const widthSlider = document.getElementById("priorityLabelWidthSlider");
      const heightSlider = document.getElementById("priorityLabelHeightSlider");
      const sizeValue = document.getElementById("priorityLabelSizeValue");
      const widthValue = document.getElementById("priorityLabelWidthValue");
      const heightValue = document.getElementById("priorityLabelHeightValue");
      if (!sizeSlider || !widthSlider || !heightSlider) return;

      sizeSlider.value = String(Math.round(priorityLabelUserAdjustments.sizeScale * 100));
      widthSlider.value = String(priorityLabelUserAdjustments.wordsPerLine);
      heightSlider.value = String(Math.round(priorityLabelUserAdjustments.lineHeight * 100));
      if (sizeValue) sizeValue.textContent = `${sizeSlider.value}%`;
      if (widthValue) widthValue.textContent = widthSlider.value;
      if (heightValue) heightValue.textContent = (Number(heightSlider.value) / 100).toFixed(1);

      sizeSlider.addEventListener("input", () => {
        priorityLabelUserAdjustments.sizeScale = Number(sizeSlider.value) / 100;
        if (sizeValue) sizeValue.textContent = `${sizeSlider.value}%`;
        refreshPriorityLabelLayout();
      });

      widthSlider.addEventListener("input", () => {
        priorityLabelUserAdjustments.wordsPerLine = Number(widthSlider.value);
        if (widthValue) widthValue.textContent = widthSlider.value;
        refreshPriorityLabelLayout();
      });

      heightSlider.addEventListener("input", () => {
        priorityLabelUserAdjustments.lineHeight = Number(heightSlider.value) / 100;
        if (heightValue) heightValue.textContent = priorityLabelUserAdjustments.lineHeight.toFixed(1);
        refreshPriorityLabelLayout();
      });
    }

    function prepareExportPanel() {
      const titleInput = document.getElementById("exportTitleInput");
      const subtitleInput = document.getElementById("exportSubtitleInput");
      if (titleInput && !titleInput.value) {
        titleInput.value = defaultExportTitle();
      }
      if (subtitleInput && subtitleInput.dataset.userEdited !== "true") {
        subtitleInput.value = defaultExportSubtitle();
      }
      if (IS_INFRASTRUCTURE_DISPLAY && priorityLabelGroup) {
        refreshPriorityLabelLayout();
      }
    }

    function initExportFields() {
      const exportPill = document.getElementById("mapExportPill");
      const subtitleInput = document.getElementById("exportSubtitleInput");
      if (exportPill) exportPill.hidden = false;
      subtitleInput?.addEventListener("input", () => {
        subtitleInput.dataset.userEdited = "true";
      });
      initPriorityLabelAdjustControls();
    }

    function buildExportMetadata() {
      const cluster = clusterFilter?.value || "All";
      const village = villageFilter?.value || "All";
      const titleInput = document.getElementById("exportTitleInput");
      const subtitleInput = document.getElementById("exportSubtitleInput");
      const qualityInput = document.getElementById("exportQualitySelect");
      const bounds = map.getBounds();

      return {
        title: titleInput?.value?.trim() || defaultExportTitle(),
        subtitle: subtitleInput?.value?.trim() || defaultExportSubtitle(),
        quality: qualityInput?.value || "high",
        basemap: basemapFilter?.value || DEFAULT_BASE_MAP,
        mapScaleLat: bounds.getSouth(),
        mapZoom: map.getZoom(),
        mapSlug: COMMUNITY_PRIORITIES_CONFIG.mapId || defaultExportTitle(),
        legendItems: buildExportLegendItems(),
        cluster,
        village,
        attribution: "Map data © OpenStreetMap contributors, Esri, CARTO, HOT | Community Priorities",
        exportedAt: `Exported ${formatExportDateForDisplay()}`
      };
    }

    function formatExportDateForDisplay() {
      return new Date().toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    if (COMMUNITY_PRIORITIES_CONFIG.enableMapExport && window.CommunityPrioritiesMapExport) {
      initExportFields();
      window.CommunityPrioritiesMapExport.bindExportUI(map, buildExportMetadata, {
        onPreparePanel: prepareExportPanel
      });
    }

    window.communityPrioritiesMap = map;
