(function initCommunityPrioritiesMapExportCallouts(global) {
  const PHOTO_RADIUS_PX = 55;
  const ARROW_MARKER_ID = "map-export-callout-arrowhead";
  const SAVE_ENDPOINT = "/api/export-callout-layout";
  const DEFAULT_TARGET_ICON_SIZE_PX = 20;
  const TARGET_ICON_GAP_PX = 4;

  function ensureArrowMarker(svg) {
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.appendChild(defs);
    }

    if (svg.querySelector(`#${ARROW_MARKER_ID}`)) return;

    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", ARROW_MARKER_ID);
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");

    const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    head.setAttribute("points", "0 0, 10 5, 0 10");
    head.setAttribute("fill", "#6b7280");
    marker.appendChild(head);
    defs.appendChild(marker);
  }

  function resolvePhotoEntry(callout, areaPhotos) {
    if (callout.image) return { image: callout.image };
    if (!callout.photoFile) return null;
    return areaPhotos.find((photo) => photo.file === callout.photoFile) || null;
  }

  function getCalloutId(callout) {
    return callout.id || callout.photoFile || callout.label || "callout";
  }

  function getSavedLayout() {
    return global.EXPORT_CALLOUT_LAYOUT || {};
  }

  function resolveTargetInset(callout) {
    if (Number.isFinite(callout.targetInsetPx)) return callout.targetInsetPx;

    let iconSize = Number(callout.targetIconSizePx);
    if (!iconSize && callout.targetLayerId) {
      const style = global.CURSOR_V2_STYLES?.[callout.targetLayerId];
      iconSize = style?.iconSize?.[0] || style?.pointRadius * 2;
    }

    return (iconSize || DEFAULT_TARGET_ICON_SIZE_PX) / 2 + TARGET_ICON_GAP_PX;
  }

  function isLocalDevServer() {
    return ["localhost", "127.0.0.1"].includes(global.location.hostname);
  }

  function setSaveStatus(element, message, isError = false) {
    let status = element.querySelector(".map-export-callout-save-status");
    if (!message) {
      if (status) status.remove();
      return;
    }

    if (!status) {
      status = document.createElement("p");
      status.className = "map-export-callout-save-status";
      element.appendChild(status);
    }

    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  async function savePosition(calloutId, offsetPx, element) {
    const layout = getSavedLayout();
    layout[calloutId] = {
      x: Math.round(offsetPx.x),
      y: Math.round(offsetPx.y)
    };
    global.EXPORT_CALLOUT_LAYOUT = layout;

    if (!isLocalDevServer()) {
      setSaveStatus(element, "Drag works here, but saving needs the local dev server.", true);
      return;
    }

    try {
      const response = await fetch(SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calloutId, offsetPx: layout[calloutId] })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Save failed (${response.status})`);
      }

      setSaveStatus(element, "Position saved to project files.");
      global.setTimeout(() => setSaveStatus(element, ""), 2500);
    } catch (error) {
      console.warn("Unable to save export callout position:", error);
      setSaveStatus(element, error.message || "Unable to save position.", true);
    }
  }

  function bindDrag(map, state, updateCallouts) {
    const handle = state.element.querySelector(".map-export-callout-photo-wrap");
    if (!handle) return;

    L.DomEvent.disableClickPropagation(handle);
    L.DomEvent.disableScrollPropagation(handle);

    let dragStart = null;
    let startOffset = null;

    function finishDrag() {
      if (!dragStart) return;
      dragStart = null;
      startOffset = null;
      state.element.classList.remove("is-dragging");
      map.dragging.enable();
      savePosition(state.calloutId, state.offsetPx, state.element);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    }

    function applyDrag(clientX, clientY) {
      if (!dragStart || !startOffset) return;
      state.offsetPx = {
        x: startOffset.x + (clientX - dragStart.x),
        y: startOffset.y + (clientY - dragStart.y)
      };
      setSaveStatus(state.element, "");
      updateCallouts();
    }

    function onMouseMove(event) {
      event.preventDefault();
      applyDrag(event.clientX, event.clientY);
    }

    function onMouseUp() {
      finishDrag();
    }

    function onTouchMove(event) {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      applyDrag(touch.clientX, touch.clientY);
    }

    function onTouchEnd() {
      finishDrag();
    }

    function startDrag(clientX, clientY) {
      dragStart = { x: clientX, y: clientY };
      startOffset = { ...state.offsetPx };
      state.element.classList.add("is-dragging");
      map.dragging.disable();
    }

    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      startDrag(event.clientX, event.clientY);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    handle.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      startDrag(touch.clientX, touch.clientY);
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
    }, { passive: false });
  }

  function init(map, options = {}) {
    const callouts = options.callouts || [];
    const resolveAssetUrl = typeof options.resolveAssetUrl === "function"
      ? options.resolveAssetUrl
      : (path) => path;
    const areaPhotos = options.areaPhotos
      || window.INFRASTRUCTURE_AREA_PHOTOS
      || window[global.COMMUNITY_PRIORITIES_CONFIG?.areaPhotosGlobal]
      || [];
    const savedLayout = getSavedLayout();

    if (!callouts.length) return;

    const layer = L.DomUtil.create("div", "map-export-callouts-layer", map.getContainer());
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "map-export-callout-arrows");
    svg.setAttribute("aria-hidden", "true");
    layer.appendChild(svg);

    const calloutElements = callouts.map((callout) => {
      const photoEntry = resolvePhotoEntry(callout, areaPhotos);
      const calloutId = getCalloutId(callout);
      const defaultOffset = callout.offsetPx || { x: 165, y: -125 };
      const savedOffset = savedLayout[calloutId];
      const element = document.createElement("div");
      element.className = "map-export-callout";
      element.innerHTML = `
        <div class="map-export-callout-photo-wrap" title="Drag to reposition">
          <img class="map-export-callout-photo" src="" alt="" draggable="false">
        </div>
        <div class="map-export-callout-label"></div>
      `;

      const image = element.querySelector(".map-export-callout-photo");
      const label = callout.label || photoEntry?.file?.replace(/\.[^.]+$/, "") || "Photo";
      image.src = resolveAssetUrl(photoEntry?.image || callout.image || "");
      image.alt = label;
      element.querySelector(".map-export-callout-label").textContent = label;
      layer.appendChild(element);

      return {
        callout,
        element,
        calloutId,
        offsetPx: savedOffset
          ? { x: Number(savedOffset.x), y: Number(savedOffset.y) }
          : { ...defaultOffset }
      };
    });

    function updateCallouts() {
      const size = map.getSize();
      svg.setAttribute("width", String(size.x));
      svg.setAttribute("height", String(size.y));
      svg.style.width = `${size.x}px`;
      svg.style.height = `${size.y}px`;

      [...svg.querySelectorAll("line")].forEach((line) => line.remove());
      ensureArrowMarker(svg);

      calloutElements.forEach((state) => {
        const { callout, element, offsetPx } = state;
        const radius = Number(callout.radiusPx) || PHOTO_RADIUS_PX;
        const targetPoint = map.latLngToContainerPoint([callout.targetLat, callout.targetLon]);
        const calloutCenter = L.point(targetPoint.x + offsetPx.x, targetPoint.y + offsetPx.y);
        const dx = targetPoint.x - calloutCenter.x;
        const dy = targetPoint.y - calloutCenter.y;
        const distance = Math.hypot(dx, dy) || 1;
        const startX = calloutCenter.x + (dx / distance) * radius;
        const startY = calloutCenter.y + (dy / distance) * radius;
        const targetInset = Math.min(
          resolveTargetInset(callout),
          Math.max(0, distance - radius - 8)
        );
        const endX = targetPoint.x - (dx / distance) * targetInset;
        const endY = targetPoint.y - (dy / distance) * targetInset;

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "map-export-callout-arrow");
        line.setAttribute("x1", String(startX));
        line.setAttribute("y1", String(startY));
        line.setAttribute("x2", String(endX));
        line.setAttribute("y2", String(endY));
        line.setAttribute("marker-end", `url(#${ARROW_MARKER_ID})`);
        svg.appendChild(line);

        element.style.left = `${calloutCenter.x - radius}px`;
        element.style.top = `${calloutCenter.y - radius}px`;
      });
    }

    calloutElements.forEach((state) => bindDrag(map, state, updateCallouts));

    map.on("move zoom resize viewreset", updateCallouts);
    updateCallouts();
  }

  global.CommunityPrioritiesMapExportCallouts = { init };
})(window);
