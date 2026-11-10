import { supabase } from './supabase'

export type DeleteOutcome = 'deleted' | 'archived'

// The storage file name is the last part of the public URL.
function imagePath(url: string): string | null {
  const marker = '/product-images/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

// Deletes a product through the database function.
// 'deleted'  = gone for good.
// 'archived' = it's part of past orders, so it was hidden instead (history stays intact).
export async function deleteProduct(id: string, images: string[]): Promise<DeleteOutcome> {
  const { data, error } = await supabase.rpc('admin_delete_product', { p_product_id: id })
  if (error) throw error
  const outcome = data as DeleteOutcome

  if (outcome === 'deleted') {
    const paths = images.map(imagePath).filter((p): p is string => !!p)
    // Best effort: a leftover photo is harmless, so never fail the delete over it.
    if (paths.length > 0) await supabase.storage.from('product-images').remove(paths).catch(() => {})
  }
  return outcome
}
