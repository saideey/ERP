// ==================== TENANT TYPES ====================

export interface Tenant {
  id: number
  name: string
  slug: string
  logo_url?: string
  phone?: string
  email?: string
  address?: string
  subscription_plan: 'free' | 'basic' | 'pro' | 'enterprise'
  subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled' | 'expired'
  max_users: number
  max_products: number
  max_warehouses: number
  is_active: boolean
  notes?: string
  payment_required: boolean
  payment_message?: string
  created_at: string
  updated_at: string
  users_count?: number
  products_count?: number
  warehouses_count?: number
}

export interface TenantPublicInfo {
  name: string
  slug: string
  logo_url?: string
  payment_required: boolean
  payment_message?: string
}

// ==================== AUTH TYPES ====================

export interface User {
  id: number
  username: string
  email?: string
  first_name: string
  last_name: string
  phone?: string
  avatar_url?: string
  role_id: number
  role_name: string
  role_type: string
  permissions: string[]
  max_discount_percent: number
  assigned_warehouse_id?: number
  assigned_warehouse_name?: string
  language?: string
  tenant_id?: number
  tenant_name?: string
  tenant_slug?: string
  tenant_logo_url?: string
  payment_required?: boolean
  payment_message?: string
  tenant_features?: Record<string, boolean>
}

export interface SuperAdmin {
  id: number
  username: string
  email?: string
  first_name: string
  last_name: string
}

export interface Role {
  id: number
  name: string
  display_name: string
  permissions: string[]
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface AuthResponse {
  success: boolean
  message: string
  user: User
  tokens: TokenResponse
}

export interface SuperAdminAuthResponse {
  success: boolean
  message: string
  admin: SuperAdmin
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// ==================== PRODUCT TYPES ====================

export interface UOMConversion {
  id?: number
  uom_id: number
  uom_name: string
  uom_symbol: string
  conversion_factor: number
  sale_price?: number
  vip_price?: number
  is_default_sale_uom?: boolean
  is_base?: boolean
  stock_quantity?: number
}

export interface Product {
  id: number
  name: string
  article?: string
  barcode?: string
  category_id?: number
  category_name?: string
  base_uom_id: number
  base_uom_symbol: string
  base_uom_name?: string
  cost_price: number
  cost_price_usd?: number
  sale_price: number
  sale_price_usd?: number
  vip_price?: number
  vip_price_usd?: number
  color?: string
  is_favorite?: boolean
  sort_order?: number
  image_url?: string
  is_active: boolean
  current_stock?: number
  uom_conversions?: UOMConversion[]
}

export interface Category {
  id: number
  name: string
  slug: string
  parent_id?: number
  children?: Category[]
  is_active: boolean
}

export interface UnitOfMeasure {
  id: number
  name: string
  symbol: string
  uom_type: string
}

// ==================== CUSTOMER TYPES ====================

export interface Customer {
  id: number
  name: string
  company_name?: string
  phone: string
  phone_secondary?: string
  telegram_id?: string
  email?: string
  address?: string
  customer_type: 'REGULAR' | 'VIP' | 'WHOLESALE'
  current_debt: number
  advance_balance: number
  credit_limit: number
  total_purchases: number
  is_active: boolean
  manager_id?: number
  manager_name?: string
}

// ==================== POS / SALE TYPES ====================

export interface CartItem {
  id: string
  product_id: number
  product_name: string
  quantity: number
  uom_id: number
  uom_symbol: string
  uom_name?: string
  conversion_factor: number
  base_uom_id?: number
  base_uom_symbol?: string
  cost_price: number
  original_price: number
  unit_price: number
  discount_percent?: number
  discount_amount?: number
  total_price?: number
  available_stock?: number
}

export interface PaymentMethod {
  type: 'CASH' | 'CARD' | 'TRANSFER' | 'DEBT'
  amount: number
}

export interface SaleCreate {
  warehouse_id: number
  customer_id?: number
  items: SaleItemCreate[]
  final_total?: number
  payments: PaymentCreate[]
  notes?: string
}

export interface SaleItemCreate {
  product_id: number
  quantity: number
  uom_id: number
  unit_price?: number
}

export interface PaymentCreate {
  payment_type: string
  amount: number
}

export interface Sale {
  id: number
  sale_number: string
  sale_date: string
  customer_id?: number
  customer_name?: string
  seller_name: string
  subtotal: number
  discount_amount: number
  discount_percent: number
  total_amount: number
  paid_amount: number
  debt_amount: number
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID' | 'DEBT' | 'CANCELLED'
  items_count: number
  is_cancelled: boolean
  created_at: string
}

// ==================== STOCK TYPES ====================

export interface Stock {
  id: number
  product_id: number
  product_name: string
  product_article?: string
  warehouse_id: number
  warehouse_name: string
  quantity: number
  base_uom_symbol: string
  reserved_quantity: number
  available_quantity: number
  average_cost: number
  total_value: number
  min_stock_level: number
  is_below_minimum: boolean
}

export interface Warehouse {
  id: number
  name: string
  code?: string
  address?: string
  is_main: boolean
  is_active: boolean
  total_value?: number
}

export interface QuickProduct {
  id: number
  product_id: number
  name: string
  price: number
  color: string
  position: number
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  per_page: number
}

export interface DailySummary {
  date: string
  total_sales: number
  total_amount: number
  total_paid: number
  total_debt: number
  total_discount: number
  gross_profit: number
  payment_breakdown: Record<string, number>
}

// ==================== SUPER ADMIN DASHBOARD ====================

export interface DashboardStats {
  total_tenants: number
  active_tenants: number
  suspended_tenants: number
  total_users: number
  total_products: number
  total_sales_today: number
}
