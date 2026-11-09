import type { ProductWithVariants } from '../lib/types'

// The "Product details" section at the bottom of a product page:
// the owner's own bullet points, plus facts worked out from the product's data.
export default function ProductDetails({ product }: { product: ProductWithVariants }) {
  const variants = product.product_variants.filter((v) => v.is_active)
  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0)

  // Unique colours and sizes, in the order the owner added them.
  const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))]
  const colours = unique(variants.map((v) => v.color))
  const sizes = unique(variants.map((v) => v.size))

  // One point per line of the owner's details text.
  const points = (product.details ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)

  const availability =
    totalStock === 0 ? 'Sold out' : totalStock === 1 ? 'Only 1 left' : totalStock <= 3 ? `Only ${totalStock} left` : 'In stock'

  const facts: [string, string][] = [
    ['Category', product.categories?.name ?? ''],
    ['Colours', colours.join(', ')],
    ['Sizes', sizes.join(', ')],
    ['Availability', availability],
    ['Listed', new Date(product.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })],
    ['Item ID', product.id.slice(0, 8).toUpperCase()],
  ].filter((row): row is [string, string] => row[1] !== '')

  return (
    <section className="mt-12 border-t border-gray-100 pt-8">
      <h2 className="mb-5 text-lg font-semibold">Product details</h2>

      <div className="grid gap-8 md:grid-cols-2">
        {points.length > 0 && (
          <ul className="space-y-2 text-sm text-gray-700">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className={`divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm ${points.length === 0 ? 'md:col-span-2 md:max-w-md' : ''}`}>
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-gray-500">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-xs text-gray-400">Mention the item ID if you contact us about this product.</p>
    </section>
  )
}
