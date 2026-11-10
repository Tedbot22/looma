import { discountPercent, formatNaira } from '../lib/format'

interface Props {
  price: number
  compareAt: number | null
  size?: 'sm' | 'lg'
}

// Shows "₦1,500  ₦2,000 (struck through)". Reused on cards and the product page.
export default function PriceTag({ price, compareAt, size = 'sm' }: Props) {
  const onSale = discountPercent(price, compareAt) !== null

  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span
        className={`font-semibold ${size === 'lg' ? 'text-2xl' : 'text-base'} ${
          onSale ? 'text-sale' : 'text-gray-900'
        }`}
      >
        {formatNaira(price)}
      </span>
      {onSale && compareAt && (
        <span className={`text-gray-400 line-through ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
          {formatNaira(compareAt)}
        </span>
      )}
    </div>
  )
}
