import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, LayersControl, Circle, ScaleControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { X, ExternalLink, Maximize2, Copy, Check } from 'lucide-react'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Props {
  lat: number
  lng: number
  titulo?: string
  /** Subtítulo exibido no popup (ex: endereço formatado). */
  subtitulo?: string
  /** Área em hectares — desenha círculo aproximado (raio = sqrt(area * 10000 / π)). */
  areaHa?: number
  /** Inicial zoom — default 16 (nível quarteirão). */
  zoom?: number
  onClose: () => void
}

const GIBS_DATE = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  return d.toISOString().slice(0, 10)
})()

export function FullScreenMap({ lat, lng, titulo, subtitulo, areaHa, zoom = 16, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const radius = areaHa && areaHa > 0 ? Math.sqrt((areaHa * 10000) / Math.PI) : 0
  const gmapsUrl = `https://www.google.com/maps/@${lat},${lng},${zoom}z`
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(`${lat}, ${lng}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 bg-black/80 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold truncate">{titulo || 'Localização'}</div>
          {subtitulo && (
            <div className="text-white/60 text-xs truncate font-body">{subtitulo}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={copyCoords}
            className="text-white/80 hover:text-white text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition"
            title="Copiar coordenadas"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span className="font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
          </button>
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:text-white text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition"
          >
            Google Maps <ExternalLink size={11} />
          </a>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:text-white text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition"
          >
            OSM <ExternalLink size={11} />
          </a>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition"
            title="Fechar (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[lat, lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          zoomControl
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Satélite (Esri · Maxar)">
              <TileLayer
                attribution='Tiles © <a href="https://www.esri.com/">Esri</a> — Maxar, Earthstar Geographics'
                url="https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Topográfico (OpenTopoMap)">
              <TileLayer
                attribution='© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
                url="https://a.tile.opentopomap.org/{z}/{x}/{y}.png"
                maxZoom={17}
              />
            </LayersControl.BaseLayer>
            <LayersControl.Overlay name={`NDVI — vegetação (NASA MODIS · ${GIBS_DATE})`}>
              <TileLayer
                attribution='Imagery by <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
                url={`https://map1.vis.earthdata.nasa.gov/wmts-webmerc/MODIS_Terra_NDVI_8Day/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`}
                maxZoom={9}
                opacity={0.65}
              />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Nomes/estradas (Esri ref.)">
              <TileLayer
                attribution='Reference layer © Esri'
                url="https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
                opacity={0.9}
              />
            </LayersControl.Overlay>
          </LayersControl>

          <Marker position={[lat, lng]}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{titulo || 'Localização'}</div>
                {subtitulo && <div className="text-xs text-gray-600 mt-1">{subtitulo}</div>}
                {areaHa && areaHa > 0 && (
                  <div className="text-xs mt-1">Área declarada: <strong>{areaHa.toFixed(1)} ha</strong></div>
                )}
                <div className="text-[11px] text-gray-500 mt-1 font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>

          {radius > 0 && (
            <Circle
              center={[lat, lng]}
              radius={radius}
              pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15, weight: 2 }}
            />
          )}

          <ScaleControl position="bottomleft" imperial={false} />
        </MapContainer>

        {areaHa && areaHa > 0 && (
          <div className="absolute bottom-3 right-3 bg-black/75 text-white text-xs px-3 py-2 rounded-lg shadow-lg backdrop-blur border border-white/10 font-body">
            <div className="flex items-center gap-2">
              <Maximize2 size={12} className="text-amber-400" />
              <span>Círculo estimado: <strong>{areaHa.toFixed(1)} ha</strong> (raio {(radius).toFixed(0)} m)</span>
            </div>
            <div className="text-[10px] text-white/60 mt-0.5">Geometria exata do CAR não disponível — círculo representa área declarada.</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FullScreenMap
