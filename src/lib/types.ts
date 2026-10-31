// These mirror the tables in schema.sql.
// If you change a table, update the matching type here.

export interface Category {
  id: string
  name: string
  sort_order: number
}

export interface Product {
  id: string
  category_id: string
  name: string
  description: string | null
  price: number
  compare_at_price: number | null
  images: string[]
  is_active: boolean
  created_at: string
}

export interface ProductVariant {
  id: string
  product_id: string
  color: string | null
  size: string | null
  image: string | null
  stock: number
  is_active: boolean
}

export interface Bundle {
  id: string
  name: string
  description: string | null
  price: number
  compare_at_price: number | null
  images: string[]
  is_active: boolean
}

// A product together with its variants, as returned by:
//   supabase.from('products').select('*, product_variants(*)')
export interface ProductWithVariants extends Product {
  product_variants: ProductVariant[]
}

export interface OrderItem {
  id: string
  order_id: string
  variant_id: string | null
  bundle_id: string | null
  name: string
  quantity: number
  unit_price: number
}

export interface Order {
  id: string
  order_number: number
  user_id: string
  total: number
  payment_method: 'online' | 'on_delivery'
  payment_status: 'pending' | 'paid' | 'failed'
  status: 'pending_payment' | 'placed' | 'confirmed' | 'delivered' | 'cancelled'
  delivery_address: string
  phone: string
  created_at: string
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}
