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
  details: string | null // extra product details, one per line
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

// A product together with its variants, as returned by:
//   supabase.from('products').select('*, product_variants(*)')
export interface ProductWithVariants extends Product {
  product_variants: ProductVariant[]
  categories?: { name: string } | null // present when the product page asks for it
}

export interface OrderItem {
  id: string
  order_id: string
  variant_id: string | null
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
  payment_status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded' | 'refund_failed'
  refund_needs_details: boolean
  status: 'pending_payment' | 'placed' | 'confirmed' | 'out_for_delivery' | 'delivered' | 'cancelled'
  subtotal: number
  delivery_fee: number
  delivery_zone: string | null
  discount: number
  delivery_address: string
  delivery_note: string | null
  delivery_lat: number | null
  delivery_lon: number | null
  delivery_distance_m: number | null
  origin_lat: number | null
  origin_lon: number | null
  phone: string
  expires_at: string | null
  payment_reference: string | null
  created_at: string
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}

// One step in an order's history (what the tracking timeline is built from).
export interface OrderEvent {
  id: string
  order_id: string
  status: Order['status']
  note: string | null
  created_at: string
}

// A campus LOOMA delivers to, with its delivery fee.
export interface DeliveryZone {
  id: string
  name: string
  fee: number
  is_active: boolean
  sort_order: number
  kind: 'campus' | 'home' // campus = ready-made option; home = customer enters an address
  latitude?: number | null // where a campus delivery goes (campus options only)
  longitude?: number | null
}

// A customer's saved delivery location: a campus plus their own details (hostel, room, landmark).
export interface SavedAddress {
  id: string
  zone_id: string
  details: string // the address text the customer picked from the suggestions
  latitude: number
  longitude: number
  note: string | null // optional landmark or extra directions
  is_default: boolean
  created_at: string
  // null when the campus has since been switched off (Row Level Security hides inactive zones)
  delivery_zones: DeliveryZone | null
}
