import { requestUrl, type App, type Plugin } from "obsidian";
import { parseGpxTrackPoints, type GpxTrackPoint } from "../tracks/gpxImport";
import {
  geoBoundsFromPoints,
  latLonToMapPixel,
  loadOsmMap,
  mapAttribution,
  type OsmMapData,
  type TileFetcher,
} from "./osmTiles";

export type Track3dBlockOptions = {
  path: string;
  height: number;
  exaggeration: number;
};

export type NormalizedTrack = {
  xs: number[];
  ys: number[];
  zs: number[];
  eles: number[];
  minEle: number;
  maxEle: number;
};

export type ProjectedPoint = { px: number; py: number; depth: number };

export function parseTrack3dBlockSource(source: string): Track3dBlockOptions | null {
  const lines = source.split("\n");
  let path = "";
  let height = 400;
  let exaggeration = 4;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (key === "path") path = value;
    if (key === "height") {
      const n = Number.parseInt(value, 10);
      if (!Number.isNaN(n)) height = n;
    }
    if (key === "exaggeration") {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n)) exaggeration = n;
    }
  }
  if (!path) return null;
  return {
    path,
    height: Math.max(180, height),
    exaggeration: Math.max(1, exaggeration),
  };
}

export function normalizeTrackPoints(points: GpxTrackPoint[], exaggeration: number): NormalizedTrack {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const eles = points.map((p) => p.ele ?? 0);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = maxEle - minEle || 1;
  const latScale = 111_000;
  const lonScale = latScale * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  return {
    xs: points.map((p) => (p.lon - minLon) * lonScale),
    ys: points.map((p) => (p.lat - minLat) * latScale),
    zs: eles.map((e) => ((e - minEle) / eleRange) * 100 * exaggeration),
    eles,
    minEle,
    maxEle,
  };
}

export function projectTrackPoint(
  x: number,
  y: number,
  z: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
): ProjectedPoint {
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const scaleZ = bounds.maxZ - bounds.minZ || 1;
  const nx = (x - bounds.minX) / scaleX - 0.5;
  const ny = (y - bounds.minY) / scaleY - 0.5;
  const nz = (z - bounds.minZ) / scaleZ;
  const angle = Math.PI / 6;
  const sx = nx * Math.cos(angle) - ny * Math.sin(angle);
  const sy = nx * Math.sin(angle) + ny * Math.cos(angle) - nz * 0.55;
  const depth = sx + sy;
  return { px: sx, py: sy, depth };
}

export function fitProjectedPoints(
  points: ProjectedPoint[],
  width: number,
  height: number,
  padding = 0.08,
): void {
  if (points.length === 0) return;
  const minPx = Math.min(...points.map((p) => p.px));
  const maxPx = Math.max(...points.map((p) => p.px));
  const minPy = Math.min(...points.map((p) => p.py));
  const maxPy = Math.max(...points.map((p) => p.py));
  const spanX = maxPx - minPx || 1;
  const spanY = maxPy - minPy || 1;
  const innerW = width * (1 - padding * 2);
  const innerH = height * (1 - padding * 2);
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const cx = (minPx + maxPx) / 2;
  const cy = (minPy + maxPy) / 2;
  for (const p of points) {
    p.px = width / 2 + (p.px - cx) * scale;
    p.py = height / 2 + (p.py - cy) * scale;
  }
}

export function elevationColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(40 + clamped * 200);
  const g = Math.round(120 - clamped * 70);
  const b = Math.round(200 - clamped * 180);
  return `rgb(${r}, ${g}, ${b})`;
}

export function computeAlongTrackDistances(xs: number[], ys: number[]): number[] {
  const dist: number[] = [0];
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i]! - xs[i - 1]!;
    const dy = ys[i]! - ys[i - 1]!;
    dist.push(dist[i - 1]! + Math.hypot(dx, dy));
  }
  return dist;
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.strokeText(label, x + 10, y + 4);
  ctx.fillText(label, x + 10, y + 4);
}

export function renderTrack3dCanvas(
  canvas: HTMLCanvasElement,
  points: GpxTrackPoint[],
  options?: { label?: string; exaggeration?: number },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || points.length === 0) return;

  const width = canvas.width;
  const height = canvas.height;
  const exaggeration = options?.exaggeration ?? 4;
  ctx.clearRect(0, 0, width, height);

  const { xs, ys, zs, minEle, maxEle } = normalizeTrackPoints(points, exaggeration);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };

  const bg = getComputedStyle(canvas).getPropertyValue("--background-secondary").trim() || "#1e1e1e";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const projected = xs.map((x, i) => projectTrackPoint(x, ys[i]!, zs[i]!, bounds));
  fitProjectedPoints(projected, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < projected.length - 1; i++) {
    const a = projected[i]!;
    const b = projected[i + 1]!;
    const eleT =
      maxEle > minEle
        ? (((points[i]?.ele ?? minEle) + (points[i + 1]?.ele ?? minEle)) / 2 - minEle) / (maxEle - minEle)
        : i / Math.max(1, projected.length - 1);
    ctx.strokeStyle = elevationColor(eleT);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }

  if (projected.length >= 1) {
    drawMarker(ctx, projected[0]!.px, projected[0]!.py, "rgb(60, 170, 80)", "Start");
  }
  if (projected.length >= 2) {
    const end = projected[projected.length - 1]!;
    drawMarker(ctx, end.px, end.py, "rgb(210, 70, 60)", "Ende");
  }

  ctx.fillStyle = "var(--text-muted)";
  ctx.font = "12px sans-serif";
  ctx.fillText(options?.label ?? "GPX-Track", 8, 16);
}

export function renderOsmMapCanvas(
  canvas: HTMLCanvasElement,
  points: GpxTrackPoint[],
  osm: OsmMapData,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || points.length === 0) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(osm.canvas, 0, 0, osm.canvas.width, osm.canvas.height, 0, 0, width, height);

  const eles = points.map((p) => p.ele ?? 0);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);

  const toPixel = (i: number) => latLonToMapPixel(points[i]!.lat, points[i]!.lon, osm.bounds, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = toPixel(i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  for (let i = 0; i < points.length - 1; i++) {
    const a = toPixel(i);
    const b = toPixel(i + 1);
    const eleT =
      maxEle > minEle ? ((eles[i]! + eles[i + 1]!) / 2 - minEle) / (maxEle - minEle) : i / (points.length - 1);
    ctx.strokeStyle = elevationColor(eleT);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (points.length >= 1) {
    const start = toPixel(0);
    drawMarker(ctx, start.x, start.y, "rgb(60, 170, 80)", "Start");
  }
  if (points.length >= 2) {
    const end = toPixel(points.length - 1);
    drawMarker(ctx, end.x, end.y, "rgb(210, 70, 60)", "Ende");
  }
}

export function renderElevationProfileCanvas(
  canvas: HTMLCanvasElement,
  points: GpxTrackPoint[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || points.length < 2) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const { xs, ys, eles, minEle, maxEle } = normalizeTrackPoints(points, 1);
  const distances = computeAlongTrackDistances(xs, ys);
  const totalDist = distances[distances.length - 1] || 1;
  const padding = { l: 36, r: 8, t: 8, b: 18 };
  const plotW = width - padding.l - padding.r;
  const plotH = height - padding.t - padding.b;

  const bg = getComputedStyle(canvas).getPropertyValue("--background-secondary").trim() || "#1e1e1e";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(127,127,127,0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(width - padding.r, y);
    ctx.stroke();
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgb(80, 140, 220)";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const x = padding.l + (distances[i]! / totalDist) * plotW;
    const ele = eles[i] ?? minEle;
    const y =
      maxEle > minEle
        ? padding.t + plotH - ((ele - minEle) / (maxEle - minEle)) * plotH
        : padding.t + plotH / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "var(--text-muted)";
  ctx.font = "10px sans-serif";
  ctx.fillText(`${Math.round(minEle)} m`, 4, padding.t + plotH);
  ctx.fillText(`${Math.round(maxEle)} m`, 4, padding.t + 10);
  ctx.fillText(`${(totalDist / 1000).toFixed(1)} km`, width - padding.r - 36, height - 4);
}

export async function obsidianTileFetcher(url: string): Promise<HTMLImageElement | null> {
  try {
    const resp = await requestUrl({
      url,
      headers: { "User-Agent": "UniversalDailyNote/1.1 (Obsidian plugin; contact: github.com/denkarium)" },
    });
    const blob = new Blob([resp.arrayBuffer]);
    const objectUrl = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch {
    return null;
  }
}

export async function mountTrack3dBlock(
  app: App,
  container: HTMLElement,
  options: Track3dBlockOptions,
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(options.path);
  if (!file || !("extension" in file)) {
    container.createEl("p", { text: `GPX nicht gefunden: ${options.path}` });
    return;
  }

  let xml = "";
  try {
    xml = await app.vault.read(file as import("obsidian").TFile);
  } catch {
    container.createEl("p", { text: `GPX konnte nicht gelesen werden: ${options.path}` });
    return;
  }

  const points = parseGpxTrackPoints(xml);
  if (points.length === 0) {
    container.createEl("p", { text: "Keine Track-Punkte in der GPX-Datei." });
    return;
  }

  const hasEle = points.some((p) => p.ele != null);
  const wrap = container.createDiv({ cls: "udn-track3d" });
  const mapStage = wrap.createDiv({ cls: "udn-track3dMapStage" });
  const mapInner = mapStage.createDiv({ cls: "udn-track3dMapInner" });
  const mapCanvas = mapInner.createEl("canvas", { cls: "udn-track3dMap" });
  const profile = wrap.createEl("canvas", { cls: "udn-track3dProfile" });
  const canvasWidth = Math.max(320, wrap.clientWidth || 480);
  const mapHeight = Math.max(280, options.height);

  mapCanvas.width = canvasWidth;
  mapCanvas.height = mapHeight;
  mapCanvas.style.width = "100%";
  mapCanvas.style.height = `${mapHeight}px`;
  profile.width = canvasWidth;
  profile.height = 80;
  profile.style.width = "100%";
  profile.style.height = "80px";

  mapStage.createDiv({ cls: "udn-track3dLoading", text: "Karte wird geladen…" });

  const fetchTile: TileFetcher = obsidianTileFetcher;
  const osmMap = await loadOsmMap(geoBoundsFromPoints(points), fetchTile);
  mapStage.querySelector(".udn-track3dLoading")?.remove();

  if (osmMap) {
    renderOsmMapCanvas(mapCanvas, points, osmMap);
    wrap.createEl("p", {
      cls: "udn-track3dAttribution",
      text: mapAttribution(osmMap.source),
    });
  } else {
    mapStage.remove();
    const fallback = wrap.createDiv({ cls: "udn-track3dFallback" });
    const fallbackCanvas = fallback.createEl("canvas", { cls: "udn-track3dCanvas" });
    fallbackCanvas.width = canvasWidth;
    fallbackCanvas.height = Math.min(240, mapHeight);
    fallbackCanvas.style.width = "100%";
    fallbackCanvas.style.height = `${fallbackCanvas.height}px`;
    const label = options.path.split("/").pop() ?? options.path;
    renderTrack3dCanvas(fallbackCanvas, points, { label, exaggeration: options.exaggeration });
    fallback.createEl("p", {
      cls: "udn-track3dHint",
      text: "Kartenkacheln konnten nicht geladen werden — nur Track-Vorschau.",
    });
  }

  renderElevationProfileCanvas(profile, points);

  if (!hasEle) {
    wrap.createEl("p", {
      cls: "udn-track3dHint",
      text: "Hinweis: GPX ohne Höhendaten — Höhenprofil und Farbverlauf sind eingeschränkt.",
    });
  }
}

export function registerTrack3dProcessor(plugin: Plugin): void {
  plugin.registerMarkdownCodeBlockProcessor("udn-track-3d", (source, el) => {
    const options = parseTrack3dBlockSource(source);
    if (!options) {
      el.createEl("p", { text: "udn-track-3d: path fehlt" });
      return;
    }
    void mountTrack3dBlock(plugin.app, el, options);
  });
}
