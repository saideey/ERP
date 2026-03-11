import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const shopApi = axios.create({ baseURL: '/api/v1/shop/' })

interface ShopInfo {
  name: string; slug: string; logo_url: string | null; phone: string | null
  address: string | null; product_count: number; category_count: number
  working_hours: string; description: string; email: string | null
  telegram: string; whatsapp: string
}
interface ShopCategory { id: number; name: string; product_count: number }
interface ShopProduct {
  id: number; name: string; article: string | null; category_id: number | null
  category_name: string | null; sale_price: number; sale_price_usd: number | null
  image_url: string | null; images: string[]; uom: string; in_stock: boolean
  color: string | null; description: string | null
}

function fmt(n: number): string { return n.toLocaleString('uz-UZ').replace(/,/g, ' ') }

export default function ShopPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const navigate = useNavigate()
  const [info, setInfo] = useState<ShopInfo | null>(null)
  const [categories, setCategories] = useState<ShopCategory[]>([])
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<'name'|'price_asc'|'price_desc'>('name')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<ShopProduct | null>(null)
  const [showQR, setShowQR] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const PP = 24
  const [likedIds, setLikedIds] = useState<Set<number|null>>(new Set())
  const [shopLiked, setShopLiked] = useState(false)

  useEffect(() => {
    if (!tenantSlug) return
    setLoading(true)
    Promise.all([shopApi.get(`/${tenantSlug}/info`), shopApi.get(`/${tenantSlug}/categories`)])
      .then(([a, b]) => {
        setInfo(a.data); setCategories(b.data.categories || []); document.title = `${a.data.name}`
        // Record view
        shopApi.post(`/${tenantSlug}/view`).catch(() => {})
        // Load my likes
        shopApi.get(`/${tenantSlug}/my-likes`).then(({ data }) => {
          setShopLiked(data.shop_liked)
          setLikedIds(new Set(data.liked_product_ids || []))
        }).catch(() => {})
      })
      .catch(() => setError(true)).finally(() => setLoading(false))
  }, [tenantSlug])

  useEffect(() => {
    if (!tenantSlug || loading) return
    setProducts([]); setPage(1); setHasMore(true)
    ;(async () => {
      try {
        const p = new URLSearchParams()
        if (selectedCat) p.append('category_id', String(selectedCat))
        if (search) p.append('search', search)
        p.append('sort', sort); p.append('page', '1'); p.append('per_page', String(PP))
        const { data } = await shopApi.get(`/${tenantSlug}/products?${p}`)
        setProducts(data.products || []); setTotal(data.total || 0); setPage(2)
        setHasMore((data.products || []).length >= PP)
      } catch {}
    })()
  }, [tenantSlug, selectedCat, search, sort, loading])

  const loadMore = useCallback(async () => {
    if (!tenantSlug || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const p = new URLSearchParams()
      if (selectedCat) p.append('category_id', String(selectedCat))
      if (search) p.append('search', search)
      p.append('sort', sort); p.append('page', String(page)); p.append('per_page', String(PP))
      const { data } = await shopApi.get(`/${tenantSlug}/products?${p}`)
      const np = data.products || []
      setProducts(prev => [...prev, ...np]); setPage(pg => pg + 1); setHasMore(np.length >= PP)
    } catch {} finally { setLoadingMore(false) }
  }, [tenantSlug, selectedCat, search, sort, page, loadingMore, hasMore])

  useEffect(() => {
    const el = sentinel.current; if (!el) return
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting && hasMore && !loadingMore) loadMore() }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [hasMore, loadingMore, loadMore])

  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 400); return () => clearTimeout(t) }, [searchInput])

  const shopUrl = `${window.location.origin}/shop/${tenantSlug}`
  const waMsg = (product?: string) => {
    const phone = (info?.whatsapp || info?.phone || '').replace(/[^0-9+]/g, '')
    const text = product ? `Salom! "${product}" tovar haqida so'ramoqchi edim. Narxi va mavjudligi qanday?` : `Salom! Do'koningiz haqida so'ramoqchi edim.`
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  }
  const tgMsg = (product?: string) => {
    const user = info?.telegram?.replace('@', '') || ''
    if (!user) return ''
    const text = product ? `Salom! "${product}" tovar haqida so'ramoqchi edim.` : `Salom!`
    return `https://t.me/${user}?text=${encodeURIComponent(text)}`
  }

  const toggleShopLike = async () => {
    if (!tenantSlug) return
    try {
      const { data } = await shopApi.post(`/${tenantSlug}/like`)
      setShopLiked(data.liked)
    } catch {}
  }

  const toggleProductLike = async (pid: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tenantSlug) return
    try {
      const { data } = await shopApi.post(`/${tenantSlug}/products/${pid}/like`)
      setProducts(prev => prev.map(p => p.id === pid ? { ...p, like_count: data.like_count } : p))
      setLikedIds(prev => { const n = new Set(prev); data.liked ? n.add(pid) : n.delete(pid); return n })
    } catch {}
  }

  const recordProductView = (pid: number) => {
    if (tenantSlug) shopApi.post(`/${tenantSlug}/products/${pid}/view`).catch(() => {})
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]"><div className="w-7 h-7 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
      <div className="text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-neutral-100 flex items-center justify-center mx-auto mb-6 text-3xl">🏪</div>
        <h1 className="text-xl font-bold text-neutral-800 mb-2">Do'kon topilmadi</h1>
        <p className="text-neutral-400 text-sm mb-6">Bu manzilda do'kon mavjud emas yoki yopilgan</p>
        <button onClick={() => navigate('/shop')} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition">← Marketplace</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { font-family: 'Outfit', system-ui, sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
        .prod-card { animation: fadeUp 0.4s ease both; }
        .scrollbar-hide::-webkit-scrollbar { display:none }
        .scrollbar-hide { -ms-overflow-style:none; scrollbar-width:none }
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-neutral-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/shop')} className="text-neutral-300 hover:text-neutral-600 transition -ml-1 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            {info?.logo_url ? <img src={info.logo_url} alt="" className="w-8 h-8 rounded-xl object-cover" /> : (
              <div className="w-8 h-8 rounded-xl bg-neutral-900 flex items-center justify-center text-white text-xs font-bold">{info?.name?.charAt(0)}</div>
            )}
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-neutral-900">{info?.name}</h1>
              <p className="text-[10px] text-neutral-400">{total} ta tovar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View count */}
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-neutral-400 mr-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {(info as any)?.view_count || 0}
            </div>
            {/* Shop like */}
            <button onClick={toggleShopLike}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${shopLiked ? 'bg-rose-50 text-rose-500' : 'bg-neutral-50 text-neutral-300 hover:text-rose-400'}`}>
              <svg className="w-4 h-4" fill={shopLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </button>
            <button onClick={() => setShowQR(true)} className="w-8 h-8 rounded-xl bg-neutral-50 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition" title="QR kod">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm8-12v8h8V3h-8zm6 6h-4V5h4v4zm-2 10h2v2h-2zm-4-4h2v4h-2v2h4v-2h2v-4h-2v2h-2v-2zm4 4h2v2h-2z"/></svg>
            </button>
            {(info?.whatsapp || info?.phone) && (
              <a href={waMsg()} target="_blank" rel="noopener" className="w-8 h-8 rounded-xl bg-[#25D366] flex items-center justify-center text-white hover:opacity-90 transition" title="WhatsApp">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            )}
            {info?.telegram && (
              <a href={tgMsg()} target="_blank" rel="noopener" className="w-8 h-8 rounded-xl bg-[#0088cc] flex items-center justify-center text-white hover:opacity-90 transition" title="Telegram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </a>
            )}
            {info?.phone && (
              <a href={`tel:${info.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-xl text-[11px] font-semibold hover:bg-neutral-700 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                <span className="hidden sm:inline">Qo'ng'iroq</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {info?.address && (
        <div className="bg-neutral-900 text-neutral-400 text-[11px]">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap gap-4">
            <span>📍 {info.address}</span>
            {info.working_hours && <span>🕐 {info.working_hours}</span>}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Categories */}
        {categories.length > 0 && (
          <div className="mb-5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div className="flex gap-2 min-w-max">
              <button onClick={() => setSelectedCat(null)} className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${!selectedCat ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-900/10' : 'bg-white text-neutral-500 border border-neutral-200 hover:shadow-sm'}`}>Barchasi</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${selectedCat === c.id ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-900/10' : 'bg-white text-neutral-500 border border-neutral-200 hover:shadow-sm'}`}>
                  {c.name} <span className="opacity-40 ml-0.5">{c.product_count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search & Sort */}
        <div className="flex gap-2 mb-5">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Tovar qidirish..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm outline-none focus:border-neutral-400 focus:shadow-sm transition-all" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as any)} className="px-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-600 outline-none">
            <option value="name">Nomi</option><option value="price_asc">Arzon →</option><option value="price_desc">Qimmat →</option>
          </select>
        </div>

        {/* Products */}
        {products.length === 0 && !loadingMore ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-neutral-100">
            <div className="w-16 h-16 rounded-2xl bg-neutral-50 flex items-center justify-center mx-auto mb-4 text-2xl">📦</div>
            <p className="text-neutral-500 text-sm font-medium">Tovar topilmadi</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.map((p, i) => (
              <div key={p.id} onClick={() => { setDetail(p); recordProductView(p.id) }} style={{ animationDelay: `${(i % PP) * 30}ms` }}
                className="prod-card group bg-white rounded-2xl border border-neutral-100 overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-neutral-200/60 hover:-translate-y-1 transition-all duration-400">
                <div className="aspect-square bg-neutral-50 relative overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" /> : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: p.color ? `${p.color}08` : '#FAFAF9' }}>
                      <span className="text-4xl opacity-10">📦</span>
                    </div>
                  )}
                  {!p.in_stock && <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center"><span className="text-[11px] font-semibold text-neutral-500 bg-white px-3 py-1.5 rounded-full shadow-sm">Mavjud emas</span></div>}
                  {p.in_stock && <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-white" />}
                  {/* Like button on card */}
                  <button onClick={(e) => toggleProductLike(p.id, e)}
                    className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm ${likedIds.has(p.id) ? 'bg-rose-500 text-white' : 'bg-black/10 text-white hover:bg-black/20'}`}>
                    <svg className="w-4 h-4" fill={likedIds.has(p.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                  </button>
                </div>
                <div className="p-3 sm:p-3.5">
                  {p.category_name && <p className="text-[9px] font-semibold text-neutral-400 uppercase tracking-[0.08em] mb-1">{p.category_name}</p>}
                  <h3 className="text-[13px] font-bold text-neutral-800 leading-tight line-clamp-2 mb-2">{p.name}</h3>
                  <div className="flex items-end justify-between mb-1.5">
                    <div>
                      <p className="text-[15px] font-extrabold text-neutral-900 tracking-tight">{fmt(p.sale_price)} <span className="text-[9px] font-normal text-neutral-400">so'm</span></p>
                      {p.sale_price_usd && p.sale_price_usd > 0 && <p className="text-[10px] text-neutral-400">${p.sale_price_usd.toFixed(2)}</p>}
                    </div>
                    <span className="text-[9px] text-neutral-300 font-medium">/{p.uom}</span>
                  </div>
                  {/* Stats */}
                  <div className="flex items-center gap-3 text-[10px] text-neutral-400">
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      {(p as any).view_count || 0}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      {(p as any).like_count || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && <div ref={sentinel} className="flex justify-center py-8">{loadingMore && <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />}</div>}
        {!hasMore && products.length > 0 && <p className="text-center text-[10px] text-neutral-300 py-8">Barcha tovarlar · {products.length} ta</p>}
      </div>

      {/* Product Detail */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-lg bg-white sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto" style={{ animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetail(null)} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/20 backdrop-blur text-white flex items-center justify-center hover:bg-black/40 transition">✕</button>
            <div className="aspect-[4/3] bg-neutral-100 relative">
              {detail.image_url ? <img src={detail.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-neutral-50"><span className="text-6xl opacity-10">📦</span></div>}
              <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-white to-transparent" />
              <div className="absolute bottom-3 left-4">
                {detail.in_stock ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-[11px] font-bold rounded-full shadow-lg shadow-emerald-500/30"><span className="w-1.5 h-1.5 bg-white rounded-full" /> Mavjud</span>
                : <span className="px-3 py-1.5 bg-neutral-500 text-white text-[11px] font-bold rounded-full">Mavjud emas</span>}
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              {detail.category_name && <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-[0.1em]">{detail.category_name}</span>}
              <h2 className="text-xl font-extrabold text-neutral-900 tracking-tight">{detail.name}</h2>
              <div className="flex items-end gap-3">
                <p className="text-3xl font-extrabold text-neutral-900 tracking-tight">{fmt(detail.sale_price)} <span className="text-sm font-normal text-neutral-400">so'm</span></p>
                <span className="text-sm text-neutral-300 mb-1">/ {detail.uom}</span>
              </div>
              {detail.sale_price_usd && detail.sale_price_usd > 0 && <p className="text-sm text-neutral-400">${detail.sale_price_usd.toFixed(2)}</p>}
              {detail.article && <p className="text-xs text-neutral-400">Artikul: <span className="font-mono">{detail.article}</span></p>}
              {detail.description && <div className="pt-4 border-t border-neutral-100"><p className="text-sm text-neutral-600 leading-relaxed">{detail.description}</p></div>}

              {/* Action buttons */}
              <div className="pt-2 space-y-2">
                {(info?.whatsapp || info?.phone) && (
                  <a href={waMsg(detail.name)} target="_blank" rel="noopener"
                    className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-[#25D366] text-white rounded-2xl text-sm font-bold hover:bg-[#20BD5A] transition-all active:scale-[0.98]">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp orqali so'rash
                  </a>
                )}
                {info?.telegram && (
                  <a href={tgMsg(detail.name)} target="_blank" rel="noopener"
                    className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-[#0088cc] text-white rounded-2xl text-sm font-bold hover:bg-[#0077b5] transition-all active:scale-[0.98]">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    Telegram orqali so'rash
                  </a>
                )}
                {info?.phone && (
                  <a href={`tel:${info.phone}`} className="flex items-center justify-center gap-2 w-full py-3.5 bg-neutral-900 text-white rounded-2xl text-sm font-bold hover:bg-neutral-800 transition-all active:scale-[0.98]">
                    📞 Qo'ng'iroq qilish
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl p-8 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            {info?.logo_url ? <img src={info.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover mx-auto mb-4" /> : (
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 flex items-center justify-center text-white text-lg font-bold mx-auto mb-4">{info?.name?.charAt(0)}</div>
            )}
            <h3 className="font-bold text-neutral-900 mb-1">{info?.name}</h3>
            <p className="text-xs text-neutral-400 mb-5">QR kodni skanerlang</p>
            <div className="bg-neutral-50 rounded-2xl p-4 inline-block mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shopUrl)}&bgcolor=FAFAFA&color=111111`} alt="QR" className="w-48 h-48" />
            </div>
            <p className="text-[10px] text-neutral-400 mb-4 break-all">{shopUrl}</p>
            <button onClick={() => { navigator.clipboard.writeText(shopUrl); setShowQR(false) }}
              className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition">
              Havolani nusxalash
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-neutral-100 bg-white mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">{info?.name} © {new Date().getFullYear()}</p>
          <p className="text-[10px] text-neutral-300">Powered by <span className="font-semibold">X ADAN</span></p>
        </div>
      </footer>
    </div>
  )
}
