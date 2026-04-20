import React, { useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ExternalLink, Satellite, Map as MapIcon, Maximize2 } from 'lucide-react'
import FullScreenMap from './FullScreenMap'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type TileLayerKey = 'satellite' | 'osm'

interface Props {
  lat: number
  lng: number
  /** Zoom inicial (default 15). */
  zoom?: number
  /** Altura do container em pixels. Largura fica 100%. */
  height?: number
  /** Rótulo opcional embaixo do thumbnail. */
  legenda?: string
  /** Título exibido no modal full-screen (quando o usuário escolhe ampliar). */
  titulo?: string
  /** Área em hectares — renderizada como círculo aproximado. */
  areaHa?: number
}

function RecenterOnChange({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap()
  React.useEffect(() => {
    map.setView([lat, lng], zoom)
  }, [lat, lng, zoom, map])
  return null
}

export function MapThumbnail({ lat, lng, zoom = 15, height = 200, legenda, titulo, areaHa }: Props) {
  const [layer, setLayer] = useState<TileLayerKey>('satellite')
  const [showFullScreen, setShowFullScreen] = useState(false)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${Math.round(
    zoom,
  )}/${lat}/${lng}`
  const gmapsLink = `https://www.google.com/maps/@${lat},${lng},${Math.round(zoom)}z`

  const radius = areaHa && areaHa > 0 ? Math.sqrt((areaHa * 10000) / Math.PI) : 0

  const tileUrl =
    layer === 'satellite'
      ? 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttribution =
    layer === 'satellite'
      ? 'Esri · Maxar · Earthstar'
      : '© OpenStreetMap'

  return (
    <div className="rounded-xl overflow-hidden border border-aletis-borda dark:border-white/10 bg-aletis-bege/30 dark:bg-white/5">
      <div
        className="relative w-full bg-black/70"
        style={{ height: `${height}px`, overflow: 'hidden' }}
      >
        <MapContainer
          center={[lat, lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          zoomControl
          attributionControl={false}
          key={layer}
        >
          <RecenterOnChange lat={lat} lng={lng} zoom={zoom} />
          <TileLayer url={tileUrl} maxZoom={19} attribution="" />
          <Marker position={[lat, lng]} />
          {radius > 0 && (
            <Circle
              center={[lat, lng]}
              radius={radius}
              pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15, weight: 2 }}
            />
          )}
        </MapContainer>

        {/* Toolbar: layer toggle + ampliar (acima do mapa) */}
        <div className="absolute top-2 right-2 flex gap-1 bg-black/70 backdrop-blur rounded-lg p-0.5 shadow-lg z-[400]">
          <button
            onClick={() => setLayer('satellite')}
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition ${
              layer === 'satellite'
                ? 'bg-white text-aletis-grafite-escuro'
                : 'text-white/80 hover:text-white'
            }`}
            title="Imagem de satélite (Esri)"
            type="button"
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
            type="button"
          >
            <MapIcon size={11} />
            Mapa
          </button>
          <button
            onClick={() => setShowFullScreen(true)}
            className="px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 text-white/80 hover:text-white hover:bg-white/10 transition"
            title="Ampliar em tela cheia (NDVI, camadas, etc)"
            type="button"
          >
            <Maximize2 size={11} />
            Ampliar
          </button>
        </div>

        {/* Créditos obrigatórios pelas TOS */}
        <div className="absolute bottom-1 left-2 text-[9px] text-white/80 bg-black/50 px-1.5 py-0.5 rounded z-[400] pointer-events-none">
          {tileAttribution}
        </div>

        {/* Links externos */}
        <div className="absolute bottom-1 right-2 flex gap-1 z-[400]">
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

      {showFullScreen && (
        <FullScreenMap
          lat={lat}
          lng={lng}
          titulo={titulo || legenda}
          subtitulo={titulo ? legenda : undefined}
          areaHa={areaHa}
          zoom={Math.max(zoom, 16)}
          onClose={() => setShowFullScreen(false)}
        />
      )}

      {legenda && (
        <div className="px-3 py-1.5 text-[11px] font-body text-aletis-grafite-medio dark:text-white/60 flex items-center justify-between gap-2">
          <span className="truncate">{legenda}</span>
          <span className="font-mono text-[10px] text-aletis-grafite-claro flex-shrink-0">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
      )}
    </div>
  )
}

export default MapThumbnail
