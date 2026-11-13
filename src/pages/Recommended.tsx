import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProductPool, useRecommendations } from '../hooks/useRecommendations'
import { useSimilarProducts } from '../hooks/useSimilarProducts'
import ProductCard from '../components/ProductCard'
import { ProductGridSkeleton } from '../components/Skeleton'
import type { ProductWithVariants } from '../lib/types'

import { PRODUCT_GRID } from '../lib/layout'

const GRID = PRODUCT_GRID

// The full list behind "You may also like". With ?like=<product id> it shows more items like that product,
// tuned to the customer (the same algorithm as the product page row). Without it, it shows picks based on
// the customer alone.
export default function Recommended() {
  const [params] = useSearchParams()
  const likeId = params.get('like')
  const pool = useProductPool()

  if (likeId) {
    if (pool.isLoading) return <Shell title="More like this" back={{ to: '/', label: 'Home' }}><ProductGridSkeleton count={10} /></Shell>
    const product = pool.data?.find((p) => p.id === likeId)
    if (product) return <LikeThis product={product} />
  }
  return <ForYou />
}

function Shell({
  title,
  intro,
  back,
  children,
}: {
  title: string
  intro?: string
  back: { to: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div>
      <Link to={back.to} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> {back.label}
      </Link>
      <h1 className="text-2xl font-bold">{title}</h1>
      {intro && <p className="mb-6 mt-1 text-sm text-gray-500">{intro}</p>}
      {children}
    </div>
  )
}

function LikeThis({ product }: { product: ProductWithVariants }) {
  const { items, isLoading } = useSimilarProducts(product, 40)
  return (
    <Shell
      title={`More like ${product.name}`}
      intro=" "
      back={{ to: `/product/${product.id}`, label: 'Back' }}
    >
      {isLoading && <ProductGridSkeleton count={10} />}
      {!isLoading && items.length === 0 && <p className="text-gray-500">Nothing here right now. Check back soon!</p>}
      <div className={GRID}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </Shell>
  )
}

function ForYou() {
  const { items, personalised, isLoading, error } = useRecommendations(40)
  return (
    <Shell
      title="Recommended for you"
      intro={
        personalised > 0
          ? ' '
          : ' '
      }
      back={{ to: '/', label: 'Home' }}
    >
      {isLoading && <ProductGridSkeleton count={10} />}
      {error && <p className="text-red-600">Couldn't load recommendations.</p>}
      <div className={GRID}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </Shell>
  )
}
