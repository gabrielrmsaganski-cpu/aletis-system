import React, { useMemo, useState } from 'react'
import { MapPin, ExternalLink, Satellite, Map as MapIcon } from 'lucide-react'

/**
 * Thumbnail de satélite/mapa para um ponto geográfico.
 *
 * Fontes gratuitas (sem API key):
 *  • Esri World Imagery (satélite)   — services.arcgisonline.com/.../World_Imagery
 *  • OpenStreetMap Standard (mapa)  — tile.openstreetmap.org
 *
 * Estratégia: mosaico 3x3 de tiles de 256px centralizado no ponto → visual
 * amplo sem depender de uma API de static-map paga. Usuário pode alternar
 * entre satélite e mapa, e abrir no Google Maps para street view.
 */

type TileLayer = 'satellite' | 'osm'

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z)
}
function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)
}

function tileUrl(layer: TileLayer, z: number, x: number, y: number): string {
  if (layer === 'satellite') {
    return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  }
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

interface Props {
  lat: number
  lng: number
  /** Zoom inicial (default 15 — nível quadra/quarteirão). */
  zoom?: number
  /** Altura do container em pixels. Largura fica 100%. */
  height?: number
  /** Rótulo opcional embaixo do thumbnail. */
  legenda?: string
}

export function MapThumbnail({ lat, lng, zoom = 15, height = 200, legenda }: Props) {
  const [layer, setLayer] = useState<TileLayer>('satellite')
  const [errored, setErrored] = useState(false)

  const { tiles, centerPx } = useMemo(() => {
    const z = Math.max(3, Math.min(18, Math.round(zoom)))
    const cx = lngToTileX(lng, z)
    const cy = latToTileY(lat, z)
    const tx = Math.floor(cx)
    const ty = Math.floor(cy)
    // Offset do ponto exato dentro do tile central (0..256 px).
    const offsetX = Math.round((cx - tx) * 256)
    const offsetY = Math.round((cy - ty) * 256)
    const grid: Array<{ x: number; y: number; dx: number; dy: number }> = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        grid.push({ x: tx + dx, y: ty + dy, dx, dy })
      }
    }
    return {
      tiles: grid.map((g) => ({
        url: tileUrl(layer, z, g.x, g.y),
        dx: g.dx,
        dy: g.dy,
      })),
      // Marker position relativa ao canvas 3x3 (768x768 nominal)
      centerPx: { x: 256 + offsetX, y: 256 + offsetY },
    }
  }, [lat, lng, zoom, layer])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${Math.round(
    zoom,
  )}/${lat}/${lng}`
  const gmapsLink = `https://www.google.com/maps/@${lat},${lng},${Math.round(zoom)}z`

  return (
    <div className="rounded-xl overflow-hidden border border-aletis-borda dark:border-white/10 bg-aletis-bege/30 dark:bg-white/5">
      <div
        className="relative w-full bg-black/70"
        style={{ height: `${height}px`, overflow: 'hidden' }}
      >
        {/* Mosaico 3x3 — cada tile 256px, escala proporcional ao container. */}
        <div
          className="absolute"
          style={{
            width: '768px',
            height: '768px',
            // Centraliza o ponto clicado no viewport
            left: `calc(50% - ${centerPx.x}px)`,
            top: `calc(50% - ${centerPx.y}px)`,
          }}
        >
          {tiles.map((t, i) => (
            <img
              key={i}
              src={t.url}
              alt=""
              loading="lazy"
              onError={() => setErrored(true)}
              style={{
                position: 'absolute',
                width: '256px',
                height: '256px',
                left: `${(t.dx + 1) * 256}px`,
                top: `${(t.dy + 1) * 256}px`,
                imageRendering: 'auto',
              }}
              draggable={false}
            />
          ))}
        </div>

        {/* Marker central */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -100%)',
          }}
        >
          <MapPin
            className="w-7 h-7 text-red-500 drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
            fill="currentColor"
          />
        </div>

        {/* Toggle layer */}
        <div className="absolute top-2 right-2 flex gap-1 bg-black/60 backdrop-blur rounded-lg p-0.5 shadow-lg">
          <button
            onClick={() => setLayer('satellite')}
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition ${
              layer === 'satellite'
                ? 'bg-white text-aletis-grafite-escuro'
                : 'text-white/80 hover:text-white'
            }`}
            title="Imagem de satélite (Esri)"
          >
            <Satellite size={11} />
            Satélite
          </button>
          <button
            onClick={() => setLayer('osm')}
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition ${
              layer === 'osm'
                ? 'bg-white text-aletis-grafite-escuro'
                : 'text-white/80 hover:text-white'
            }`}
            title="Mapa OpenStreetMap"
          >
            <MapIcon size={11} />
            Mapa
          </button>
        </div>

        {/* Créditos — obrigatórios pelas TOS de OSM/Esri */}
        <div className="absolute bottom-1 left-2 text-[9px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
          {layer === 'satellite' ? 'Esri · Maxar · Earthstar' : '© OpenStreetMap'}
        </div>

        {/* Links externos */}
        <div className="absolute bottom-1 right-2 flex gap-1">
          <a
            href={gmapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] bg-black/60 text-white/90 hover:bg-black/80 px-1.5 py-0.5 rounded flex items-center gap-1"
            title="Abrir no Google Maps"
          >
            Google <ExternalLink size={9} />
          </a>
          <a
            href={osmLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] bg-black/60 text-white/90 hover:bg-black/80 px-1.5 py-0.5 rounded flex items-center gap-1"
            title="Abrir no OpenStreetMap"
          >
            OSM <ExternalLink size={9} />
          </a>
        </div>
      </div>

      {(legenda || errored) && (
        <div className="px-3 py-1.5 text-[11px] font-body text-aletis-grafite-medio dark:text-white/60 flex items-center justify-between gap-2">
          <span className="truncate">{legenda || '—'}</span>
          <span className="font-mono text-[10px] text-aletis-grafite-claro flex-shrink-0">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
      )}
    </div>
  )
}

export default MapThumbnail
