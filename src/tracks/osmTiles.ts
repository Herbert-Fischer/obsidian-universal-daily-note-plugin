import type { GpxTrackPoint } from "./gpxImport";

const TILE_SIZE = 256;
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TOPO_TILE_URL = "https://tile.opentopomap.org/{z}/{x}/{y}.png";

export type GeoBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export type OsmMapData = {
  canvas: HTMLCanvasElement;
  bounds: GeoBounds;
  zoom: number;
  source: "topo" | "osm";
};

export type TileFetcher = (url: string) => Promise<HTMLImageElement | null>;

export function geoBoundsFromPoints(points: GpxTrackPoint[], padding = 0.18): GeoBounds {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  const latPad = Math.max(0.002, (maxLat - minLat || 0.01) * padding);
  const lonPad = Math.max(0.002, (maxLon - minLon || 0.01) * padding);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
  };
}

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export function pickZoomForBounds(bounds: GeoBounds, maxTiles = 12): number {
  for (let zoom = 16; zoom >= 11; zoom--) {
    const xMin = Math.floor(lonToTileX(bounds.minLon, zoom));
    const xMax = Math.floor(lonToTileX(bounds.maxLon, zoom));
    const yMin = Math.floor(latToTileY(bounds.maxLat, zoom));
    const yMax = Math.floor(latToTileY(bounds.minLat, zoom));
    const tilesW = xMax - xMin + 1;
    const tilesH = yMax - yMin + 1;
    if (tilesW * tilesH <= maxTiles * maxTiles) return zoom;
  }
  return 11;
}

export function latLonToMapPixel(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * mapWidth;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat || 1)) * mapHeight;
  return { x, y };
}

function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export async function defaultTileFetcher(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function fetchTileLayer(
  z: number,
  x: number,
  y: number,
  fetchTile: TileFetcher,
  preferTopo: boolean,
): Promise<{ img: HTMLImageElement; source: "topo" | "osm" } | null> {
  if (preferTopo) {
    const topo = await fetchTile(tileUrl(TOPO_TILE_URL, z, x, y));
    if (topo) return { img: topo, source: "topo" };
  }
  const osm = await fetchTile(tileUrl(OSM_TILE_URL, z, x, y));
  if (osm) return { img: osm, source: "osm" };
  return null;
}

export async function loadOsmMap(bounds: GeoBounds, fetchTile = defaultTileFetcher): Promise<OsmMapData | null> {
  const zoom = pickZoomForBounds(bounds);
  const xMin = Math.floor(lonToTileX(bounds.minLon, zoom));
  const xMax = Math.floor(lonToTileX(bounds.maxLon, zoom));
  const yMin = Math.floor(latToTileY(bounds.maxLat, zoom));
  const yMax = Math.floor(latToTileY(bounds.minLat, zoom));
  const tilesW = xMax - xMin + 1;
  const tilesH = yMax - yMin + 1;
  const canvas = document.createElement("canvas");
  canvas.width = tilesW * TILE_SIZE;
  canvas.height = tilesH * TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let loaded = 0;
  let source: "topo" | "osm" = "osm";
  const jobs: Promise<void>[] = [];
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      jobs.push(
        (async () => {
          const result = await fetchTileLayer(zoom, tx, ty, fetchTile, true);
          if (!result) return;
          loaded++;
          if (result.source === "topo") source = "topo";
          ctx.drawImage(result.img, (tx - xMin) * TILE_SIZE, (ty - yMin) * TILE_SIZE);
        })(),
      );
    }
  }
  await Promise.all(jobs);
  if (loaded === 0) return null;
  return { canvas, bounds, zoom, source };
}

export function mapAttribution(source: "topo" | "osm"): string {
  if (source === "topo") {
    return "© OpenStreetMap · SRTM | Kartendarstellung © OpenTopoMap (CC-BY-SA)";
  }
  return "© OpenStreetMap-Mitwirkende";
}
