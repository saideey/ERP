import { useState, useEffect, useRef } from 'react'

interface Shop {
  slug: string; name: string; logo_url: string | null
  phone: string | null; address: string | null
  product_count: number; latitude: number | null; longitude: number | null
  region: string | null; district: string | null
  shop_category_name: string | null; shop_category_icon: string | null
  view_count: number; like_count: number
}

interface Props {
  shops: Shop[]
  onShopClick: (slug: string) => void
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ShopMapView({ shops, onShopClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [tab, setTab] = useState<'all' | 'nearest'>('all')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const located = shops.filter(s => s.latitude && s.longitude)

  // Shops with distance
  const shopsWithDist = located.map(s => ({
    ...s,
    distance: myPos ? haversine(myPos.lat, myPos.lng, s.latitude!, s.longitude!) : null,
  })).sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))

  const nearest5 = shopsWithDist.slice(0, 5)
  const displayList = tab === 'nearest' && myPos ? nearest5 : shopsWithDist

  // Load Leaflet CSS + JS
  useEffect(() => {
    if (document.getElementById('leaflet-css')) return
    const css = document.createElement('link')
    css.id = 'leaflet-css'
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
    document.head.appendChild(css)

    const js = document.createElement('script')
    js.id = 'leaflet-js'
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    js.onload = () => initMap()
    document.head.appendChild(js)

    return () => {}
  }, [])

  // Reinit map when shops change
  useEffect(() => {
    if ((window as any).L && mapRef.current) initMap()
  }, [shops, myPos])

  const initMap = () => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Destroy previous
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    // Default center: Uzbekistan
    let center: [number, number] = [41.3, 64.5]
    let zoom = 6

    if (located.length > 0) {
      const lats = located.map(s => s.latitude!)
      const lngs = located.map(s => s.longitude!)
      center = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
      zoom = located.length === 1 ? 13 : 7
    }

    if (myPos) {
      center = [myPos.lat, myPos.lng]
      zoom = 10
    }

    const map = L.map(mapRef.current, { zoomControl: false }).setView(center, zoom)
    mapInstance.current = map

    L.control.zoom({ position: 'topright' }).addTo(map)

    // Tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM',
      maxZoom: 18,
    }).addTo(map)

    // My position marker
    if (myPos) {
      const myIcon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.5);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      L.marker([myPos.lat, myPos.lng], { icon: myIcon }).addTo(map)
        .bindPopup('<b>Siz shu yerdasiz</b>')

      // Accuracy circle
      L.circle([myPos.lat, myPos.lng], { radius: 500, color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.08, weight: 1 }).addTo(map)
    }

    // Shop markers
    located.forEach(shop => {
      const initial = shop.name.charAt(0).toUpperCase()
      const icon = shop.shop_category_icon || '🏪'
      const isSelected = shop.slug === selectedSlug

      const markerIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:44px;height:56px;display:flex;flex-direction:column;align-items:center;">
            <div style="
              width:44px;height:44px;border-radius:50% 50% 50% 4px;
              background:${isSelected ? '#F59E0B' : '#111'};
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 4px 12px rgba(0,0,0,${isSelected ? '0.3' : '0.2'});
              border:3px solid white;font-size:18px;
              transform:rotate(-45deg);
              transition:all 0.2s;
            ">
              <span style="transform:rotate(45deg);${shop.logo_url ? '' : `font-size:16px;`}">
                ${shop.logo_url
                  ? `<img src="${shop.logo_url}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />`
                  : icon
                }
              </span>
            </div>
            <div style="width:3px;height:8px;background:${isSelected ? '#F59E0B' : '#111'};border-radius:0 0 2px 2px;margin-top:-2px;"></div>
          </div>
        `,
        iconSize: [44, 56],
        iconAnchor: [22, 56],
        popupAnchor: [0, -56],
      })

      const dist = myPos ? haversine(myPos.lat, myPos.lng, shop.latitude!, shop.longitude!) : null
      const distText = dist !== null ? `<br/>📏 <b>${dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km'}</b> uzoqlikda` : ''

      const marker = L.marker([shop.latitude, shop.longitude], { icon: markerIcon }).addTo(map)
      marker.bindPopup(`
        <div style="font-family:Outfit,system-ui;min-width:180px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${icon} ${shop.name}</div>
          ${shop.address ? `<div style="font-size:11px;color:#888;margin-bottom:4px;">📍 ${shop.address}</div>` : ''}
          <div style="font-size:11px;color:#666;">📦 ${shop.product_count} ta tovar</div>
          ${distText}
          <div style="margin-top:8px;">
            <a href="/shop/${shop.slug}" style="display:inline-block;padding:6px 14px;background:#111;color:white;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none;">Ochish →</a>
          </div>
        </div>
      `)

      marker.on('click', () => setSelectedSlug(shop.slug))
    })

    // Fit bounds
    if (located.length > 1) {
      const bounds = L.latLngBounds(located.map(s => [s.latitude, s.longitude]))
      if (myPos) bounds.extend([myPos.lat, myPos.lng])
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }

  const getMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setTab('nearest')
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const focusShop = (shop: Shop) => {
    setSelectedSlug(shop.slug)
    if (mapInstance.current && shop.latitude && shop.longitude) {
      mapInstance.current.setView([shop.latitude, shop.longitude], 14, { animate: true })
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
      {/* Sidebar */}
      <div className="w-full lg:w-80 shrink-0 bg-white rounded-2xl border border-neutral-100 overflow-hidden flex flex-col" style={{ maxHeight: '100%' }}>
        {/* Header */}
        <div className="p-4 border-b border-neutral-100">
          <button onClick={getMyLocation} disabled={locating}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition disabled:opacity-50">
            {locating ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aniqlanmoqda...</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                📍 Mening joylashuvim
              </>
            )}
          </button>

          {/* Tabs */}
          <div className="flex mt-3 bg-neutral-100 rounded-xl p-1">
            <button onClick={() => setTab('all')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition ${tab === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'}`}>
              Barchasi ({located.length})
            </button>
            <button onClick={() => setTab('nearest')} disabled={!myPos}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition ${tab === 'nearest' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'} disabled:opacity-30`}>
              Eng yaqin {myPos ? `(${nearest5.length})` : ''}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {displayList.length === 0 ? (
            <div className="text-center py-10 text-neutral-400 text-xs">Joylashuvi belgilangan do'konlar yo'q</div>
          ) : (
            displayList.map((shop, i) => (
              <div key={shop.slug}
                onClick={() => focusShop(shop)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-neutral-50 transition-all hover:bg-neutral-50 ${selectedSlug === shop.slug ? 'bg-amber-50 border-l-2 border-l-amber-400' : ''}`}>
                {/* Rank or icon */}
                <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold"
                  style={{ background: tab === 'nearest' ? (i < 3 ? ['#FEF3C7','#F0FDF4','#EFF6FF'][i] : '#F9FAFB') : '#F9FAFB' }}>
                  {tab === 'nearest' ? (
                    <span className="text-xs">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`}</span>
                  ) : (
                    shop.logo_url ? <img src={shop.logo_url} className="w-7 h-7 rounded-lg object-cover" /> : <span>{shop.shop_category_icon || '🏪'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-800 truncate">{shop.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {shop.region && <span className="text-[10px] text-neutral-400">{shop.region}</span>}
                    <span className="text-[10px] text-neutral-400">📦 {shop.product_count}</span>
                  </div>
                </div>
                {shop.distance !== null && (
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-neutral-700">
                      {shop.distance < 1 ? `${(shop.distance * 1000).toFixed(0)} m` : `${shop.distance.toFixed(1)} km`}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {myPos && (
          <div className="px-4 py-2 bg-blue-50 text-[10px] text-blue-600 text-center border-t">
            📍 Joylashuvingiz aniqlandi ({myPos.lat.toFixed(4)}, {myPos.lng.toFixed(4)})
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-neutral-200 relative" style={{ minHeight: '400px' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {located.length === 0 && (
          <div className="absolute inset-0 bg-neutral-50 flex items-center justify-center">
            <div className="text-center">
              <p className="text-3xl mb-2">🗺️</p>
              <p className="text-neutral-500 text-sm font-medium">Joylashuvi belgilangan do'konlar yo'q</p>
              <p className="text-neutral-400 text-xs mt-1">Super admin do'konlarga lokatsiya qo'shishi kerak</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
