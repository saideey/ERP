import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import ShopMapView from './ShopMapView'

const shopApi = axios.create({ baseURL: '/api/v1/shop/' })

interface Shop {
  slug: string; name: string; logo_url: string | null
  phone: string | null; address: string | null
  product_count: number; category_count: number
  view_count: number; like_count: number
  latitude: number | null; longitude: number | null
  region: string | null; district: string | null
  shop_category_id: number | null
  shop_category_name: string | null
  shop_category_icon: string | null
}

interface ShopCategory { id: number; name: string; icon: string }

function fmtK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

export default function MarketplacePage() {
  const navigate = useNavigate()
  const [shops, setShops] = useState<Shop[]>([])
  const [allCategories, setAllCategories] = useState<ShopCategory[]>([])
  const [allRegions, setAllRegions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterCat, setFilterCat] = useState<number | null>(null)
  const [filterRegion, setFilterRegion] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [showQR, setShowQR] = useState<string | null>(null)
  const [likedSlugs, setLikedSlugs] = useState<Set<string>>(new Set())

  useEffect(() => { document.title = 'X ADAN — Online Do\'konlar'; loadShops() }, [search, filterCat, filterRegion])
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(t) }, [searchInput])

  const loadShops = async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (search) p.append('search', search)
      if (filterCat) p.append('category_id', String(filterCat))
      if (filterRegion) p.append('region', filterRegion)
      const { data } = await shopApi.get(`?${p}`)
      setShops(data.shops || [])
      setAllCategories(data.categories || [])
      setAllRegions(data.regions || [])
    } catch { setShops([]) }
    finally { setLoading(false) }
  }

  const toggleLike = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { data } = await shopApi.post(`/${slug}/like`)
      setShops(prev => prev.map(s => s.slug === slug ? { ...s, like_count: data.like_count } : s))
      setLikedSlugs(prev => { const n = new Set(prev); data.liked ? n.add(slug) : n.delete(slug); return n })
    } catch {}
  }

  const shopUrl = (slug: string) => `${window.location.origin}/shop/${slug}`

  return (
    <div className="min-h-screen bg-white">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        *{font-family:'Outfit',system-ui,sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse-glow{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0.4)}50%{box-shadow:0 0 0 8px rgba(251,191,36,0)}}
        .card-reveal{animation:fadeUp .5s ease both}
        .like-btn:active{transform:scale(1.3)}
        .scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>

      {/* Hero */}
      <div className="relative overflow-hidden bg-[#070707]">
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',backgroundSize:'32px 32px'}} />
        <div className="absolute top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-amber-500/[0.06] blur-[150px]" />
        <div className="absolute bottom-[-150px] left-[-50px] w-[400px] h-[400px] rounded-full bg-rose-500/[0.04] blur-[120px]" />

        <nav className="relative max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white text-sm font-black shadow-lg" style={{animation:'pulse-glow 3s infinite'}}>X</div>
            <span className="text-white font-extrabold text-xl tracking-tight">ADAN</span>
          </div>
          <a href="/s-panel/access" className="text-[11px] text-white/20 hover:text-white/50 transition">Biznes uchun →</a>
        </nav>

        <div className="relative max-w-6xl mx-auto px-5 pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full mb-8">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-medium text-white/40">{shops.length} ta do'kon onlayn</span>
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
              Do'konlar<br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">dunyosi</span>
            </h1>
            <p className="text-white/35 text-base sm:text-lg leading-relaxed mb-10 max-w-lg font-light">
              Ishonchli do'konlar, real narxlar. Kerakli tovarni toping va bevosita bog'laning.
            </p>
            <div className="relative max-w-xl">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/15">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Do'kon yoki tovar qidiring..." className="w-full pl-14 pr-5 bg-white/[0.05] border border-white/[0.07] rounded-2xl text-white placeholder-white/20 text-sm outline-none focus:border-amber-500/30 transition-all" style={{paddingTop:'18px',paddingBottom:'18px'}} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-5 pt-8 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category pills */}
          {allCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button onClick={() => setFilterCat(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${!filterCat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>Barchasi</button>
              {allCategories.map(c => (
                <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? null : c.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${filterCat === c.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          {/* Region filter */}
          {allRegions.length > 0 && (
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
              className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-600 outline-none">
              <option value="">Barcha viloyatlar</option>
              {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {/* View mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-neutral-200">
            <button onClick={() => setViewMode('grid')}
              className={`px-3 py-2 text-xs font-semibold transition ${viewMode === 'grid' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-400'}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z"/></svg>
            </button>
            <button onClick={() => setViewMode('map')}
              className={`px-3 py-2 text-xs font-semibold transition ${viewMode === 'map' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-5 py-6">
        {loading ? (
          <div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin" /></div>
        ) : shops.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-20 h-20 rounded-3xl bg-neutral-50 flex items-center justify-center mx-auto mb-6 text-3xl">🔍</div>
            <h2 className="text-lg font-bold text-neutral-800 mb-2">{search || filterCat || filterRegion ? 'Natija topilmadi' : "Hozircha do'konlar yo'q"}</h2>
          </div>
        ) : viewMode === 'map' ? (
          /* ===== MAP VIEW ===== */
          <ShopMapView shops={shops} onShopClick={(slug) => navigate(`/shop/${slug}`)} />
        ) : (
          /* ===== GRID VIEW ===== */
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">Do'konlar</h2>
              <p className="text-sm text-neutral-400">{shops.length} ta</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {shops.map((shop, i) => (
                <div key={shop.slug} className="card-reveal group relative bg-white rounded-3xl border border-neutral-100 hover:border-neutral-200 p-6 cursor-pointer hover:shadow-2xl hover:shadow-neutral-200/60 transition-all duration-500"
                  style={{animationDelay:`${i*80}ms`}} onClick={() => navigate(`/shop/${shop.slug}`)}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3.5">
                      {shop.logo_url ? <img src={shop.logo_url} alt="" className="w-[52px] h-[52px] rounded-2xl object-cover shadow-sm" /> : (
                        <div className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center text-white text-lg font-black bg-gradient-to-br from-neutral-800 to-neutral-600 shadow-sm">{shop.name.charAt(0)}</div>
                      )}
                      <div>
                        <h3 className="font-bold text-neutral-900 text-[15px] leading-tight">{shop.name}</h3>
                        {shop.shop_category_name && <p className="text-[10px] text-amber-600 font-medium mt-0.5">{shop.shop_category_icon} {shop.shop_category_name}</p>}
                        {shop.address && <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">{shop.address}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={(e) => toggleLike(shop.slug, e)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${likedSlugs.has(shop.slug) ? 'text-rose-500 bg-rose-50' : 'text-neutral-300 bg-neutral-50 hover:text-rose-400'}`}>
                        <svg className="w-4 h-4" fill={likedSlugs.has(shop.slug) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      </button>
                      <button onClick={(e) => {e.stopPropagation(); setShowQR(shop.slug)}}
                        className="w-8 h-8 rounded-xl bg-neutral-50 flex items-center justify-center text-neutral-300 hover:text-neutral-500 transition">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 2h2v4h-2zm-4-4h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Region tag */}
                  {shop.region && (
                    <div className="flex items-center gap-1 mb-3">
                      <span className="text-[10px] font-medium text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded-lg">📍 {shop.region}{shop.district ? `, ${shop.district}` : ''}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[11px] font-medium text-neutral-500 bg-neutral-50 px-2.5 py-1 rounded-lg">📦 {shop.product_count}</span>
                    {shop.category_count > 0 && <span className="text-[11px] font-medium text-neutral-500 bg-neutral-50 px-2.5 py-1 rounded-lg">📂 {shop.category_count}</span>}
                  </div>

                  <div className="flex items-center gap-4 mb-3">
                    <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      {fmtK(shop.view_count)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      {fmtK(shop.like_count)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-neutral-50">
                    {shop.phone && <span className="text-[11px] text-neutral-400">{shop.phone}</span>}
                    <span className="text-[11px] font-semibold text-amber-600 opacity-0 group-hover:opacity-100 transition-all ml-auto flex items-center gap-1">
                      Kirish <svg className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowQR(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl p-8 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowQR(null)} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-600">✕</button>
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 flex items-center justify-center text-white text-lg font-bold mx-auto mb-4">
              {shops.find(s => s.slug === showQR)?.name?.charAt(0) || 'X'}
            </div>
            <h3 className="font-bold text-neutral-900 mb-1">{shops.find(s => s.slug === showQR)?.name}</h3>
            <p className="text-xs text-neutral-400 mb-5">QR kodni skanerlang</p>
            <div className="bg-neutral-50 rounded-2xl p-4 inline-block mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shopUrl(showQR))}&bgcolor=FAFAFA&color=111111`} alt="QR" className="w-48 h-48 mx-auto" />
            </div>
            <button onClick={() => { navigator.clipboard.writeText(shopUrl(showQR)); setShowQR(null) }}
              className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition">Havolani nusxalash</button>
          </div>
        </div>
      )}

      <footer className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white text-[10px] font-black">X</div>
            <span className="text-neutral-400 text-xs font-bold tracking-wide">ADAN</span>
          </div>
          <p className="text-[11px] text-neutral-300">Universal online do'konlar platformasi</p>
        </div>
      </footer>
    </div>
  )
}
