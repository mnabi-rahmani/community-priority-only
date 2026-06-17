(function initCommunityPrioritiesMapExport(global) {
  const TILE_WAIT_MS = 15000;
  const TILE_POLL_MS = 150;
  const LEGEND_SCALE = 1.5;
  const LEGEND_SYMBOL_SIZE = 18 * LEGEND_SCALE;
  const LEGEND_ROW_HEIGHT = 22 * LEGEND_SCALE;
  const LEGEND_PADDING = 10 * LEGEND_SCALE;
  const LEGEND_HEADER_HEIGHT = 22 * LEGEND_SCALE;
  const LEGEND_MIN_WIDTH = 196 * LEGEND_SCALE;
  const LEGEND_TITLE_FONT = `${Math.round(13 * LEGEND_SCALE)}px Arial, Helvetica, sans-serif`;
  const LEGEND_LABEL_FONT = `${Math.round(12 * LEGEND_SCALE)}px Arial, Helvetica, sans-serif`;
  const LEGEND_PRIORITY_FONT = `700 ${Math.round(9 * LEGEND_SCALE)}px Arial, Helvetica, sans-serif`;

  const QUALITY_SCALES = {
    high: 3,
    medium: 2,
    low: 1
  };

  const DARK_BASEMAPS = new Set([
    "Satellite imagery",
    "Satellite + labels"
  ]);

  const MAP_DECORATION_MARGIN = 14 * LEGEND_SCALE;

  function decorationColor(basemap) {
    return DARK_BASEMAPS.has(basemap) ? "#ffffff" : "#17201e";
  }

  function metersPerMapPixel(latitude, zoom) {
    return 156543.03392 * Math.cos((latitude * Math.PI) / 180) / Math.pow(2, zoom);
  }

  function pickNiceScaleDistance(maxMeters) {
    const candidates = [
      10, 20, 50, 100, 200, 250, 500, 750,
      1000, 1500, 2000, 2500, 3000, 5000, 7500,
      10000, 15000, 20000, 25000, 50000, 75000, 100000
    ];
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (candidates[index] <= maxMeters * 0.92) return candidates[index];
    }
    return candidates[0];
  }

  function formatScaleLabel(meters, isLast) {
    if (meters >= 1000) {
      const km = meters / 1000;
      const text = Number.isInteger(km)
        ? String(km)
        : km.toFixed(km < 10 ? 2 : 1).replace(/\.?0+$/, "");
      return isLast ? `${text} Kilometers` : text;
    }
    return isLast ? `${meters} Meters` : String(meters);
  }

  function buildScaleBarSpec(metadata, canvasWidth, captureScale) {
    const maxBarPx = Math.min(220 * LEGEND_SCALE, canvasWidth * 0.24);
    const metersPerPx = metersPerMapPixel(metadata.mapScaleLat, metadata.mapZoom) / captureScale;
    const totalMeters = pickNiceScaleDistance(maxBarPx * metersPerPx);
    const barWidthPx = totalMeters / metersPerPx;
    return { totalMeters, barWidthPx, segments: 4 };
  }

  function legendBlockHeight(items) {
    if (!items.length) return 0;
    return LEGEND_PADDING * 2 + LEGEND_HEADER_HEIGHT + items.length * LEGEND_ROW_HEIGHT;
  }

  function scaleBarBlockHeight() {
    return 34 * LEGEND_SCALE;
  }

  function drawNorthArrow(ctx, rightX, topY, color) {
    const arrowWidth = 24 * LEGEND_SCALE;
    const arrowHeight = 30 * LEGEND_SCALE;
    const centerX = rightX - arrowWidth / 2;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.font = `700 ${Math.round(17 * LEGEND_SCALE)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("N", centerX, topY + 16 * LEGEND_SCALE);

    const tipY = topY + 20 * LEGEND_SCALE;
    const baseY = tipY + arrowHeight;
    ctx.beginPath();
    ctx.moveTo(centerX, tipY);
    ctx.lineTo(centerX - arrowWidth / 2, baseY);
    ctx.lineTo(centerX + arrowWidth / 2, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawScaleBar(ctx, leftX, topY, spec, color) {
    const { totalMeters, barWidthPx, segments } = spec;
    const lineY = topY + 8 * LEGEND_SCALE;
    const endTickHeight = 10 * LEGEND_SCALE;
    const midTickHeight = 6 * LEGEND_SCALE;
    const labelY = lineY + 14 * LEGEND_SCALE;
    const fontSize = Math.round(11 * LEGEND_SCALE);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "square";

    ctx.beginPath();
    ctx.moveTo(leftX, lineY);
    ctx.lineTo(leftX + barWidthPx, lineY);
    ctx.stroke();

    for (let index = 0; index <= segments; index += 1) {
      const tickX = leftX + (barWidthPx / segments) * index;
      const tickHeight = index === 0 || index === segments ? endTickHeight : midTickHeight;
      ctx.beginPath();
      ctx.moveTo(tickX, lineY);
      ctx.lineTo(tickX, lineY + tickHeight);
      ctx.stroke();
    }

    ctx.font = `600 ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let index = 0; index <= segments; index += 1) {
      const tickX = leftX + (barWidthPx / segments) * index;
      const meters = (totalMeters / segments) * index;
      const label = formatScaleLabel(meters, index === segments);
      ctx.fillText(label, tickX, labelY);
    }

    ctx.restore();
  }

  function slugify(value) {
    return String(value || "all")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "all";
  }

  function buildFilename(metadata, extension) {
    const parts = [
      slugify(metadata.mapSlug || metadata.title),
      slugify(metadata.cluster),
      slugify(metadata.village)
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    return `${parts.join("_")}_${stamp}.${extension}`;
  }

  function resolveExportScale(metadata) {
    return QUALITY_SCALES[metadata.quality] || QUALITY_SCALES.medium;
  }

  function setExportStatus(statusEl, message, isError = false) {
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = "";
      statusEl.hidden = true;
      statusEl.classList.remove("export-status-error");
      return;
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
    statusEl.classList.toggle("export-status-error", isError);
  }

  function setExportBusy(buttons, busy) {
    buttons.forEach((button) => {
      if (!button) return;
      button.disabled = busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
    });
  }

  function hideExportChrome() {
    const hidden = [];
    document.querySelectorAll(".map-export-pill, [data-export-ui]").forEach((element) => {
      hidden.push({ element, display: element.style.display });
      element.style.display = "none";
    });
    return () => {
      hidden.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }

  function hideTransientMapChrome(mapContainer) {
    const hidden = [];
    mapContainer.querySelectorAll(
      ".leaflet-control-zoom, .leaflet-control-layers, .leaflet-control-attribution"
    ).forEach((element) => {
      hidden.push({ element, display: element.style.display });
      element.style.display = "none";
    });
    return () => {
      hidden.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }

  async function waitForTilesLoaded(map) {
    const container = map.getContainer();
    const started = Date.now();

    await new Promise((resolve) => {
      if (map._loaded) resolve();
      else map.whenReady(resolve);
    });

    while (Date.now() - started < TILE_WAIT_MS) {
      const tiles = [...container.querySelectorAll("img.leaflet-tile")];
      const pending = tiles.filter((tile) => !tile.complete || tile.naturalWidth === 0);
      if (!pending.length) return;
      await new Promise((resolve) => window.setTimeout(resolve, TILE_POLL_MS));
    }
  }

  async function captureMapCanvas(map, scale) {
    if (typeof global.html2canvas !== "function") {
      throw new Error("Map export library failed to load. Refresh the page and try again.");
    }

    const mapContainer = map.getContainer();
    map.invalidateSize({ animate: false });
    await waitForTilesLoaded(map);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const restoreExportUi = hideExportChrome();
    const restoreChrome = hideTransientMapChrome(mapContainer);
    let canvas;
    try {
      canvas = await global.html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false,
        backgroundColor: "#f8faf8",
        scale,
        logging: false,
        imageTimeout: 15000,
        removeContainer: false,
        onclone: (clonedDocument) => {
          const clonedMap = clonedDocument.getElementById(mapContainer.id);
          if (clonedMap) {
            clonedMap.querySelectorAll(
              ".leaflet-control-zoom, .leaflet-control-layers, .leaflet-control-attribution"
            ).forEach((element) => {
              element.style.display = "none";
            });
          }
          clonedDocument.querySelectorAll(".map-export-pill, [data-export-ui]").forEach((element) => {
            element.style.display = "none";
          });
        }
      });
    } finally {
      restoreChrome();
      restoreExportUi();
    }

    return canvas;
  }

  async function preloadLegendIcons(items) {
    return Promise.all(items.map((item) => {
      if (!item.iconUrl) return Promise.resolve(item);
      return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve({ ...item, iconImage: image });
        image.onerror = () => resolve(item);
        image.src = item.iconUrl;
      });
    }));
  }

  function measureLegendWidth(ctx, items) {
    ctx.font = `600 ${LEGEND_LABEL_FONT}`;
    const labelWidths = items.map((item) => ctx.measureText(item.label).width);
    return Math.max(LEGEND_MIN_WIDTH, Math.max(...labelWidths, 80) + LEGEND_SYMBOL_SIZE + LEGEND_PADDING * 3 + 8);
  }

  function drawLegendSymbol(ctx, x, y, item) {
    const size = LEGEND_SYMBOL_SIZE;
    const centerY = y + size / 2;

    if (item.type === "line") {
      ctx.save();
      ctx.strokeStyle = item.strokeColor || "#666666";
      ctx.lineWidth = Math.min((item.strokeWidth || 2) * LEGEND_SCALE, 5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 3, centerY);
      ctx.lineTo(x + size - 3, centerY);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (item.type === "polygon") {
      const rectW = size - 6;
      const rectH = size - 8;
      const rectX = x + 3;
      const rectY = y + 4;
      ctx.save();
      if ((item.fillOpacity ?? 0.35) > 0) {
        ctx.fillStyle = item.fillColor || "#cccccc";
        ctx.globalAlpha = item.fillOpacity ?? 0.35;
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = item.strokeColor || "#666666";
      ctx.lineWidth = Math.min((item.strokeWidth || 1.5) * LEGEND_SCALE, 3);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.restore();
      return;
    }

    if (item.iconImage) {
      ctx.drawImage(item.iconImage, x, y, size, size);
      return;
    }

    if (item.type === "priority") {
      ctx.save();
      ctx.fillStyle = item.fillColor || "#4a5568";
      ctx.strokeStyle = item.strokeColor || "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + size / 2, centerY, size / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = LEGEND_PRIORITY_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("1", x + size / 2, centerY + 0.5);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = item.fillColor || "#333333";
    ctx.strokeStyle = item.strokeColor || "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, centerY, size / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawArcGisLegend(ctx, legendX, legendY, items) {
    if (!items.length) return;

    const legendWidth = measureLegendWidth(ctx, items);
    const legendHeight = legendBlockHeight(items);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1.5;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    ctx.strokeRect(legendX + 0.5, legendY + 0.5, legendWidth - 1, legendHeight - 1);

    ctx.fillStyle = "#17201e";
    ctx.font = `700 ${LEGEND_TITLE_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Legend", legendX + LEGEND_PADDING, legendY + LEGEND_PADDING);

    const symbolX = legendX + LEGEND_PADDING;
    const labelX = symbolX + LEGEND_SYMBOL_SIZE + 10;
    let rowY = legendY + LEGEND_PADDING + LEGEND_HEADER_HEIGHT;

    items.forEach((item) => {
      drawLegendSymbol(ctx, symbolX, rowY + 2, item);
      ctx.fillStyle = "#17201e";
      ctx.font = `600 ${LEGEND_LABEL_FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, labelX, rowY + LEGEND_ROW_HEIGHT / 2);
      rowY += LEGEND_ROW_HEIGHT;
    });

    ctx.restore();
  }

  function compositeMapWithDecorations(mapCanvas, legendItems, metadata, captureScale) {
    const composite = document.createElement("canvas");
    composite.width = mapCanvas.width;
    composite.height = mapCanvas.height;
    const ctx = composite.getContext("2d");
    ctx.drawImage(mapCanvas, 0, 0);

    const color = decorationColor(metadata.basemap);
    const mapWidth = composite.width;
    const mapHeight = composite.height;
    const margin = MAP_DECORATION_MARGIN;

    drawNorthArrow(ctx, mapWidth - margin, margin, color);

    const scaleSpec = buildScaleBarSpec(metadata, mapWidth, captureScale);
    const scaleHeight = scaleBarBlockHeight();
    const scaleTop = mapHeight - margin - scaleHeight;
    const scaleLeft = mapWidth - margin - scaleSpec.barWidthPx;
    drawScaleBar(ctx, scaleLeft, scaleTop, scaleSpec, color);

    if (legendItems.length) {
      const legendWidth = measureLegendWidth(ctx, legendItems);
      const legendHeight = legendBlockHeight(legendItems);
      const legendGap = 12 * LEGEND_SCALE;
      const legendBottom = scaleTop - legendGap;
      const legendY = Math.max(margin, legendBottom - legendHeight);
      const legendX = mapWidth - margin - legendWidth;
      drawArcGisLegend(ctx, legendX, legendY, legendItems);
    }

    return composite;
  }

  function buildFramedCanvas(mapCanvas, metadata) {
    const padding = 48;
    const headerHeight = 78;
    const footerHeight = 44;
    const framed = document.createElement("canvas");
    framed.width = mapCanvas.width + padding * 2;
    framed.height = mapCanvas.height + padding * 2 + headerHeight + footerHeight;
    const ctx = framed.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, framed.width, framed.height);

    ctx.fillStyle = "#17201e";
    ctx.font = "700 30px Arial, Helvetica, sans-serif";
    ctx.fillText(metadata.title, padding, padding + 30);

    ctx.fillStyle = "#5b6764";
    ctx.font = "600 17px Arial, Helvetica, sans-serif";
    ctx.fillText(metadata.subtitle, padding, padding + 58);

    const mapY = padding + headerHeight;
    ctx.strokeStyle = "#d8dfda";
    ctx.lineWidth = 2;
    ctx.strokeRect(padding - 1, mapY - 1, mapCanvas.width + 2, mapCanvas.height + 2);
    ctx.drawImage(mapCanvas, padding, mapY);

    const footerY = framed.height - padding + 6;
    ctx.strokeStyle = "#d8dfda";
    ctx.beginPath();
    ctx.moveTo(padding, footerY - 20);
    ctx.lineTo(framed.width - padding, footerY - 20);
    ctx.stroke();

    ctx.fillStyle = "#5b6764";
    ctx.font = "500 12px Arial, Helvetica, sans-serif";
    ctx.fillText(metadata.attribution, padding, footerY);
    ctx.textAlign = "right";
    ctx.fillText(metadata.exportedAt, framed.width - padding, footerY);
    ctx.textAlign = "left";

    return framed;
  }

  function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Unable to create image file."));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    });
  }

  async function buildExportCanvas(map, getMetadata) {
    const metadata = getMetadata();
    const captureScale = resolveExportScale(metadata);
    const legendItems = await preloadLegendIcons(metadata.legendItems || []);
    const mapCanvas = await captureMapCanvas(map, captureScale);
    const mapWithDecorations = compositeMapWithDecorations(mapCanvas, legendItems, metadata, captureScale);
    return buildFramedCanvas(mapWithDecorations, metadata);
  }

  async function exportPng(map, getMetadata) {
    const metadata = getMetadata();
    const framedCanvas = await buildExportCanvas(map, getMetadata);
    await downloadCanvas(framedCanvas, buildFilename(metadata, "png"));
  }

  async function exportPdf(map, getMetadata) {
    if (!global.jspdf?.jsPDF) {
      throw new Error("PDF export library failed to load. Refresh the page and try again.");
    }

    const metadata = getMetadata();
    const framedCanvas = await buildExportCanvas(map, getMetadata);
    const imageData = framedCanvas.toDataURL("image/png");

    const pdf = new global.jspdf.jsPDF({
      orientation: framedCanvas.width >= framedCanvas.height ? "landscape" : "portrait",
      unit: "pt",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const scale = Math.min(maxWidth / framedCanvas.width, maxHeight / framedCanvas.height);
    const renderWidth = framedCanvas.width * scale;
    const renderHeight = framedCanvas.height * scale;
    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = (pageHeight - renderHeight) / 2;

    pdf.addImage(imageData, "PNG", offsetX, offsetY, renderWidth, renderHeight, undefined, "FAST");
    pdf.save(buildFilename(metadata, "pdf"));
  }

  function bindExportUI(map, getMetadata, options = {}) {
    const root = document.getElementById(options.rootId || "mapExportPill");
    const toggleButton = document.getElementById(options.toggleButtonId || "exportToggleBtn");
    const panel = document.getElementById(options.panelId || "mapExportPanel");
    const pngButton = document.getElementById(options.pngButtonId || "exportPngBtn");
    const pdfButton = document.getElementById(options.pdfButtonId || "exportPdfBtn");
    const statusEl = document.getElementById(options.statusId || "exportStatus");
    const buttons = [pngButton, pdfButton, toggleButton];
    if (!root && !pngButton && !pdfButton) return;

    const onPreparePanel = typeof options.onPreparePanel === "function" ? options.onPreparePanel : null;

    function setPanelOpen(open) {
      if (!root || !panel || !toggleButton) return;
      root.classList.toggle("map-export-expanded", open);
      panel.hidden = !open;
      toggleButton.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && onPreparePanel) onPreparePanel();
    }

    toggleButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      setPanelOpen(!root.classList.contains("map-export-expanded"));
    });

    document.addEventListener("click", (event) => {
      if (!root?.classList.contains("map-export-expanded")) return;
      if (root.contains(event.target)) return;
      setPanelOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setPanelOpen(false);
    });

    async function runExport(kind) {
      setExportBusy(buttons, true);
      setExportStatus(statusEl, "Preparing export…");
      try {
        if (kind === "png") {
          await exportPng(map, getMetadata);
          setExportStatus(statusEl, "PNG downloaded.");
        } else {
          await exportPdf(map, getMetadata);
          setExportStatus(statusEl, "PDF downloaded.");
        }
        setPanelOpen(false);
      } catch (error) {
        console.error("Map export failed:", error);
        setExportStatus(
          statusEl,
          error?.message || "Export failed. Try a different basemap or refresh the page.",
          true
        );
      } finally {
        setExportBusy(buttons, false);
        window.setTimeout(() => setExportStatus(statusEl, ""), 5000);
      }
    }

    pngButton?.addEventListener("click", () => runExport("png"));
    pdfButton?.addEventListener("click", () => runExport("pdf"));
  }

  global.CommunityPrioritiesMapExport = {
    bindExportUI,
    exportPng,
    exportPdf
  };
})(window);
