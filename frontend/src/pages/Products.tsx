import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { 
  Search, Plus, Edit2, Trash2, Package, Ruler, Link2,
  ChevronRight, Loader2, X, FolderPlus, Star, Check, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui'
import { productsService } from '@/services'
import api from '@/services/api'
import { formatMoney, formatNumber, formatInputNumber, cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Product, Category, UnitOfMeasure, UOMConversion } from '@/types'

interface ProductFormData {
  name: string
  article?: string
  barcode?: string
  category_id?: number
  base_uom_id: number
  sale_price: number  // UZS da sotish narxi
  vip_price?: number  // UZS da VIP narx
  color?: string
  is_favorite?: boolean
  min_stock_level?: number
}

interface UOMConversionFormData {
  from_uom_id: number
  to_uom_id: number
  factor: number
  sale_price?: number
}

interface CategoryFormData {
  name: string
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showUOMDialog, setShowUOMDialog] = useState(false)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showEditCategoryDialog, setShowEditCategoryDialog] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [colorValue, setColorValue] = useState('#3B82F6')
  
  // Price display states (formatted with spaces)
  const [salePriceDisplay, setSalePriceDisplay] = useState('')
  const [vipPriceDisplay, setVipPriceDisplay] = useState('')

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<ProductFormData>()
  const { register: registerUOM, handleSubmit: handleUOMSubmit, reset: resetUOM } = useForm<UOMConversionFormData>()

  // Watch color field
  const watchedColor = watch('color')

  // Sync color value
  useEffect(() => {
    if (watchedColor) {
      setColorValue(watchedColor)
    }
  }, [watchedColor])

  // Fetch products
  // Pending image for new product (upload after create)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)

  // Infinite scroll ref
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const PER_PAGE = 30

  // Infinite query for products
  const {
    data: productsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['products', searchQuery, selectedCategory],
    queryFn: ({ pageParam = 1 }) => productsService.getProducts({
      q: searchQuery || undefined,
      category_id: selectedCategory || undefined,
      page: pageParam,
      per_page: PER_PAGE,
    }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    initialPageParam: 1,
  })

  // Flatten all pages into one array
  const allProducts = productsPages?.pages?.flatMap(p => p.data || []) || []
  const totalProducts = productsPages?.pages?.[0]?.total || 0

  // Intersection Observer for auto-load
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: productsService.getCategories,
  })

  // Fetch UOMs
  const { data: uomsResponse } = useQuery({
    queryKey: ['uoms'],
    queryFn: productsService.getUOMs,
  })
  const uoms: UnitOfMeasure[] = Array.isArray(uomsResponse) ? uomsResponse : []

  // Fetch product UOM conversions
  const { data: productUOMsData } = useQuery({
    queryKey: ['product-uoms', selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct) return null
      const response = await api.get(`/products/${selectedProduct.id}/uom-conversions`)
      return response.data
    },
    enabled: !!selectedProduct,
  })

  // Create product
  const createProduct = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await api.post('/products', {
        name: data.name,
        article: data.article,
        barcode: data.barcode,
        category_id: data.category_id,
        base_uom_id: data.base_uom_id,
        cost_price: 0,
        sale_price: data.sale_price,
        vip_price: data.vip_price || null,
        color: data.color,
        is_favorite: data.is_favorite || false,
        min_stock_level: data.min_stock_level || 0,
        uom_conversions: []
      })
      // Upload pending image if any
      if (pendingImage && response.data?.id) {
        const form = new FormData()
        form.append('file', pendingImage)
        try {
          await api.post(`/products/${response.data.id}/image`, form, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } catch { /* ignore image error */ }
      }
      return response.data
    },
    onSuccess: () => {
      toast.success(t('productSaved'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowAddDialog(false)
      reset()
      setSalePriceDisplay('')
      setVipPriceDisplay('')
      setPendingImage(null)
      setPendingImagePreview(null)
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map((e: any) => e.msg).join(', ') || t('validationError'))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Update product
  const updateProduct = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!editingProduct) return
      const response = await api.patch(`/products/${editingProduct.id}`, {
        name: data.name,
        article: data.article,
        barcode: data.barcode,
        category_id: data.category_id,
        base_uom_id: data.base_uom_id,  // Asosiy o'lchov birligi
        sale_price: data.sale_price,  // UZS da sotish narxi
        vip_price: data.vip_price || null,  // UZS da VIP narx
        color: data.color,
        is_favorite: data.is_favorite,
        min_stock_level: data.min_stock_level,
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('productUpdated'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowAddDialog(false)
      setEditingProduct(null)
      reset()
      setSalePriceDisplay('')
      setVipPriceDisplay('')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map((e: any) => e.msg).join(', ') || t('validationError'))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Add UOM conversion
  const addUOMConversion = useMutation({
    mutationFn: async (data: UOMConversionFormData) => {
      if (!selectedProduct) return
      // Send universal conversion data to backend
      const response = await api.post(`/products/${selectedProduct.id}/uom-conversions`, {
        from_uom_id: data.from_uom_id,
        to_uom_id: data.to_uom_id,
        factor: data.factor,
        sale_price: data.sale_price || null
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('uomAdded'))
      queryClient.invalidateQueries({ queryKey: ['product-uoms', selectedProduct?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      resetUOM()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map((e: any) => e.msg).join(', ') || t('validationError'))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Delete UOM conversion
  const deleteUOMConversion = useMutation({
    mutationFn: async (conversionId: number) => {
      if (!selectedProduct) return
      await api.delete(`/products/${selectedProduct.id}/uom-conversions/${conversionId}`)
    },
    onSuccess: () => {
      toast.success(t('uomDeleted'))
      queryClient.invalidateQueries({ queryKey: ['product-uoms', selectedProduct?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Delete product
  const deleteProduct = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/products/${id}`)
    },
    onSuccess: () => {
      toast.success(t('productDeleted'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Create category
  const createCategory = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/products/categories', { name })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('categoryAdded'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setShowCategoryDialog(false)
      setCategoryName('')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map((e: any) => e.msg).join(', ') || t('validationError'))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Update category
  const updateCategory = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await api.patch(`/products/categories/${id}`, { name })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('categoryUpdated'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setShowEditCategoryDialog(false)
      setEditingCategory(null)
      setEditCategoryName('')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Delete category
  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/products/categories/${id}`)
    },
    onSuccess: () => {
      toast.success(t('categoryDeleted'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (selectedCategory === editingCategory?.id) {
        setSelectedCategory(null)
      }
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('categoryHasProducts'))
    },
  })

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setEditCategoryName(category.name)
    setShowEditCategoryDialog(true)
  }

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProduct.mutate(data)
    } else {
      createProduct.mutate(data)
    }
  }

  const onUOMSubmit = (data: UOMConversionFormData) => {
    addUOMConversion.mutate(data)
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setValue('name', product.name)
    setValue('article', product.article || '')
    setValue('barcode', product.barcode || '')
    setValue('category_id', product.category_id)
    setValue('base_uom_id', product.base_uom_id)
    setValue('sale_price', product.sale_price || 0)
    setValue('vip_price', product.vip_price || undefined)
    setSalePriceDisplay(formatInputNumber(product.sale_price || 0))
    setVipPriceDisplay(formatInputNumber(product.vip_price || 0))
    setValue('min_stock_level', product.min_stock_level || 0)
    setValue('color', product.color || '#3B82F6')
    setColorValue(product.color || '#3B82F6')
    setValue('is_favorite', product.is_favorite || false)
    setShowAddDialog(true)
  }

  const handleOpenUOMDialog = (product: Product) => {
    setSelectedProduct(product)
    setShowUOMDialog(true)
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4">
        <h1 className="text-xl lg:text-2xl font-bold">{t('products')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoryDialog(true)} className="flex-1 sm:flex-none text-sm lg:text-base">
            <FolderPlus className="w-4 h-4 lg:w-5 lg:h-5 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">{t('category')}</span>
            <span className="sm:hidden">+</span>
          </Button>
          <Button variant="primary" onClick={() => { setEditingProduct(null); reset(); setShowAddDialog(true) }} className="flex-1 sm:flex-none text-sm lg:text-base">
            <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-1 lg:mr-2" />
            <span className="hidden sm:inline">{t('addProduct')}</span>
            <span className="sm:hidden">{t('add')}</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 lg:gap-4 flex-col sm:flex-row">
        <Input
          icon={<Search className="w-4 h-4 lg:w-5 lg:h-5" />}
          placeholder={t('searchProducts') + '...'}
          className="w-full sm:max-w-xs text-sm lg:text-base"
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="min-h-[44px] lg:min-h-btn px-3 lg:px-4 border-2 border-border rounded-xl text-sm lg:text-base"
          onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
          value={selectedCategory || ''}
        >
          <option value="">{t('allProducts')}</option>
          {categories?.map((cat: Category) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Categories Management */}
      <Card>
        <CardContent className="p-3 lg:p-4">
          <h3 className="font-semibold mb-2 lg:mb-3 text-sm lg:text-base">{t('categories')}</h3>
          <div className="flex flex-wrap gap-1.5 lg:gap-2">
            {categories?.map((cat: Category) => (
              <div
                key={cat.id}
                className={cn(
                  "flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 lg:py-2 rounded-lg border text-sm",
                  selectedCategory === cat.id ? "bg-primary/10 border-primary" : "bg-gray-50"
                )}
              >
                <span
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                >
                  {cat.name}
                </span>
                <button
                  onClick={() => handleEditCategory(cat)}
                  className="p-1 hover:bg-gray-200 rounded"
                  title={t('edit')}
                >
                  <Edit2 className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-blue-600" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`"${cat.name}" ${t('delete')}?`)) {
                      deleteCategory.mutate(cat.id)
                    }
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                  title={t('delete')}
                >
                  <Trash2 className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-red-500" />
                </button>
              </div>
            ))}
            {(!categories || categories.length === 0) && (
              <p className="text-gray-500 text-xs lg:text-sm">{t('noData')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : allProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">{t('product')}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">{t('units')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('costPrice')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('sellingPrice')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('currentStock')}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allProducts.map((product: Product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 mt-0.5" />
                          ) : product.color ? (
                            <div
                              className="w-8 h-8 rounded-lg shrink-0 mt-0.5"
                              style={{ backgroundColor: product.color + '20', border: `2px solid ${product.color}` }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0 mt-0.5 flex items-center justify-center text-xs text-gray-400">📦</div>
                          )}
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="font-semibold">{product.name}</p>
                              {product.is_favorite && (
                                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                              )}
                            </div>
                            {product.article && (
                              <p className="text-sm text-text-secondary">Art: {product.article}</p>
                            )}
                            {product.category_name && (
                              <Badge variant="secondary" className="mt-1">{product.category_name}</Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="primary">{product.base_uom_symbol}</Badge>
                          {product.uom_conversions?.map((conv) => (
                            <Badge key={conv.uom_id} variant="secondary">
                              {conv.uom_symbol}
                            </Badge>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenUOMDialog(product)}
                            className="h-6 px-2"
                          >
                            <Link2 className="w-3 h-3 mr-1" />
                            <span className="text-xs">+</span>
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-warning">
                        {formatMoney(product.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-success">
                          {formatMoney(product.sale_price)}
                        </div>
                        {product.vip_price && product.vip_price > 0 && (
                          <div className="text-xs text-purple-600">VIP: {formatMoney(product.vip_price)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "font-medium",
                          (product.current_stock || 0) <= 0 ? "text-danger" :
                          (product.current_stock || 0) < 10 ? "text-warning" : ""
                        )}>
                          {formatNumber(product.current_stock || 0)} {product.base_uom_symbol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(product)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(t('confirmDelete'))) {
                                deleteProduct.mutate(product.id)
                              }
                            }}
                            className="text-danger hover:bg-danger/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <Package className="w-16 h-16 mb-4 opacity-50" />
              <p>{t('noProductsFound')}</p>
            </div>
          )}

          {/* Infinite scroll sentinel + info */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-secondary">
                {allProducts.length} / {totalProducts} {t('totalItems')}
              </p>
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 className="w-3 h-3 animate-spin" /> Yuklanmoqda...
                </div>
              )}
            </div>
            <div ref={loadMoreRef} className="h-1" />
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) {
          setSalePriceDisplay('')
          setVipPriceDisplay('')
          setEditingProduct(null)
          setPendingImage(null)
          setPendingImagePreview(null)
          reset()
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? t('editProduct') : t('newProduct')}</DialogTitle>
            <DialogDescription>{t('enterProductDetails')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Hidden inputs for price fields */}
            <input type="hidden" {...register('sale_price', { valueAsNumber: true })} />
            <input type="hidden" {...register('vip_price', { valueAsNumber: true })} />

            <div className="space-y-2">
              <label className="font-medium">{t('productName')} *</label>
              <Input
                {...register('name', { required: true })}
                placeholder={t('productName')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('article')}</label>
                <Input {...register('article')} placeholder={t('article')} />
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('barcode')}</label>
                <Input {...register('barcode')} placeholder={t('barcode')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('category')}</label>
                <select
                  {...register('category_id', { valueAsNumber: true })}
                  className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos"
                >
                  <option value="">{t('notSelected')}</option>
                  {categories?.map((cat: Category) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('baseUnit')} *</label>
                <select
                  {...register('base_uom_id', { required: true, valueAsNumber: true })}
                  className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos"
                >
                  <option value="">{t('select')}</option>
                  {uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>{uom.name} ({uom.symbol})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('sellingPrice')} (UZS) *</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={salePriceDisplay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\s/g, '')
                      const num = parseFloat(raw) || 0
                      setValue('sale_price', num)
                      setSalePriceDisplay(formatInputNumber(num))
                    }}
                    placeholder="0"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{t('sum')}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('vipPrice')} (UZS)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={vipPriceDisplay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\s/g, '')
                      const num = parseFloat(raw) || 0
                      setValue('vip_price', num)
                      setVipPriceDisplay(formatInputNumber(num))
                    }}
                    placeholder="0"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{t('sum')}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('minStock')}</label>
                <div className="relative">
                  <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warning" />
                  <Input
                    type="number"
                    step="0.01"
                    {...register('min_stock_level', { valueAsNumber: true })}
                    placeholder="10"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {t('minStockHint')}
                </p>
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('favoriteProduct')}</label>
                <div className="flex items-center gap-2 h-10">
                  <input
                    type="checkbox"
                    {...register('is_favorite')}
                    className="w-5 h-5 rounded border-2 text-yellow-500"
                  />
                  <span className="text-sm text-gray-600">{t('favoriteHint')}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-medium">{t('productColor')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorValue}
                  onChange={(e) => {
                    setColorValue(e.target.value)
                    setValue('color', e.target.value)
                  }}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={colorValue}
                  onChange={(e) => {
                    setColorValue(e.target.value)
                    setValue('color', e.target.value)
                  }}
                  placeholder="#3B82F6"
                  className="flex-1 max-w-[200px]"
                />
              </div>
            </div>

            {/* Product Image */}
            <div className="space-y-2">
              <label className="font-medium">📸 Rasm</label>
              <div className="flex items-center gap-3">
                {editingProduct ? (
                  /* Editing existing product — direct upload */
                  <>
                    {editingProduct.image_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={editingProduct.image_url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.delete(`/products/${editingProduct.id}/image`)
                              setEditingProduct({ ...editingProduct, image_url: null } as any)
                              queryClient.invalidateQueries({ queryKey: ['products'] })
                            } catch {}
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"
                        >✕</button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xl">📷</div>
                    )}
                    <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition">
                      {editingProduct.image_url ? "O'zgartirish" : 'Yuklash'}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const form = new FormData()
                        form.append('file', f)
                        try {
                          const { data } = await api.post(`/products/${editingProduct.id}/image`, form, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          })
                          setEditingProduct({ ...editingProduct, image_url: data.image_url } as any)
                          queryClient.invalidateQueries({ queryKey: ['products'] })
                        } catch { /* ignore */ }
                      }} />
                    </label>
                  </>
                ) : (
                  /* New product — pending image (upload after create) */
                  <>
                    {pendingImagePreview ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={pendingImagePreview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => { setPendingImage(null); setPendingImagePreview(null) }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"
                        >✕</button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xl">📷</div>
                    )}
                    <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition">
                      {pendingImagePreview ? "O'zgartirish" : 'Yuklash'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        setPendingImage(f)
                        setPendingImagePreview(URL.createObjectURL(f))
                      }} />
                    </label>
                  </>
                )}
              </div>
            </div>

            <p className="text-sm text-text-secondary bg-blue-50 p-3 rounded-pos">
              💡 {t('costPriceHint')}
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                {(createProduct.isPending || updateProduct.isPending) ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* UOM Conversions Dialog */}
      <Dialog open={showUOMDialog} onOpenChange={setShowUOMDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('configureUnits')}</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} - {t('sellInDifferentUnits')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current conversions */}
            <div className="space-y-2">
              <p className="font-medium text-sm">{t('existingUnits')}:</p>
              <div className="space-y-2">
                {productUOMsData?.data?.map((conv: any) => {
                  // Calculate: 1 base = how many of this
                  const toThisFromBase = conv.is_base ? 1 : (1 / conv.conversion_factor)
                  return (
                    <div
                      key={conv.uom_id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-pos",
                        conv.is_base ? "bg-primary/10 border-2 border-primary" : "bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Ruler className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-semibold">{conv.uom_name} ({conv.uom_symbol})</p>
                          {conv.is_base ? (
                            <p className="text-sm text-primary">{t('baseUnit')}</p>
                          ) : (
                            <p className="text-sm text-success font-medium">
                              1 {selectedProduct?.base_uom_symbol} = {formatNumber(toThisFromBase, 4)} {conv.uom_symbol}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {conv.sale_price && (
                          <Badge variant="success">{formatMoney(conv.sale_price)}</Badge>
                        )}
                        {!conv.is_base && conv.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteUOMConversion.mutate(conv.id)}
                            className="text-danger hover:bg-danger/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add new conversion */}
            <div className="border-t border-border pt-4">
              <p className="font-medium text-sm mb-3">{t('addNewUnit')}:</p>
              <form onSubmit={handleUOMSubmit(onUOMSubmit)} className="space-y-3">
                <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-pos space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg">1</span>
                    <select
                      {...registerUOM('from_uom_id', { required: true, valueAsNumber: true })}
                      className="min-h-btn px-3 py-2 border-2 border-primary bg-white rounded-pos text-sm font-medium"
                    >
                      <option value="">{t('fromUnit')}</option>
                      {/* Show all existing UOMs for this product */}
                      {productUOMsData?.data?.map((conv: any) => (
                        <option key={conv.uom_id} value={conv.uom_id}>
                          {conv.uom_name} ({conv.uom_symbol})
                        </option>
                      ))}
                    </select>
                    <span className="font-bold text-lg">=</span>
                    <Input
                      type="number"
                      step="0.0001"
                      {...registerUOM('factor', { required: true, valueAsNumber: true, min: 0.0001 })}
                      className="w-24 text-center font-bold"
                      placeholder="?"
                    />
                    <select
                      {...registerUOM('to_uom_id', { required: true, valueAsNumber: true })}
                      className="min-h-btn px-3 py-2 border-2 border-success bg-white rounded-pos text-sm font-medium"
                    >
                      <option value="">{t('toUnit')}</option>
                      {/* Show UOMs not yet added to this product */}
                      {uoms
                        .filter(u => !productUOMsData?.data?.find((c: any) => c.uom_id === u.id))
                        .map((uom) => (
                          <option key={uom.id} value={uom.id}>{uom.name} ({uom.symbol})</option>
                        ))
                      }
                    </select>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>💡 <strong>{t('exampleText')}:</strong></p>
                    <p>• 1 <span className="text-primary font-medium">tonna</span> = 52 <span className="text-success font-medium">dona</span></p>
                    <p>• 1 <span className="text-primary font-medium">dona</span> = 12 <span className="text-success font-medium">metr</span></p>
                    <p>• 1 <span className="text-primary font-medium">tonna</span> = 20 <span className="text-success font-medium">pochka</span></p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('salePriceOptional')}</label>
                  <Input
                    type="number"
                    step="0.01"
                    {...registerUOM('sale_price', { valueAsNumber: true })}
                    placeholder={t('autoCalculated')}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={addUOMConversion.isPending}
                >
                  {addUOMConversion.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('adding')}
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      {t('add')}
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('newCategory')}</DialogTitle>
            <DialogDescription>{t('enterCategoryName')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t('categoryName')}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (categoryName.trim()) {
                    createCategory.mutate(categoryName.trim())
                  } else {
                    toast.error(t('enterCategoryName'))
                  }
                }}
                disabled={createCategory.isPending}
              >
                {createCategory.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {t('add')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={showEditCategoryDialog} onOpenChange={setShowEditCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editCategory')}</DialogTitle>
            <DialogDescription>{t('changeCategoryName')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t('categoryName')}
              value={editCategoryName}
              onChange={(e) => setEditCategoryName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditCategoryDialog(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (editCategoryName.trim() && editingCategory) {
                    updateCategory.mutate({ id: editingCategory.id, name: editCategoryName.trim() })
                  } else {
                    toast.error(t('enterCategoryName'))
                  }
                }}
                disabled={updateCategory.isPending}
              >
                {updateCategory.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {t('save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}