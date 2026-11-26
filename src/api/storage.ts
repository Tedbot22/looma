// Uploading and removing photos and videos. Files are shrunk or checked before they are sent (see lib/images.ts
// and lib/reviewMedia.ts), and every upload gets a random name so there are no clashes and no guessable links.

import { supabase } from '../lib/supabase'
import { resizeImage } from '../lib/images'
import { VIDEO_EXT, type PendingMedia } from '../lib/reviewMedia'

const PRODUCT_BUCKET = 'product-images'
const REVIEW_BUCKET = 'review-media'
const ONE_YEAR = '31536000'

// Uploads one product (or banner) photo and returns its public URL.
// maxSize is the longest side in pixels: product photos use 1200, wide banners use more.
export async function uploadProductImage(file: File, maxSize = 1200): Promise<string> {
  const blob = await resizeImage(file, maxSize)
  const path = `${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: ONE_YEAR })
  if (error) throw error

  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl
}

// Uploads one picked review photo or video into the customer's own folder and returns its public URL.
export async function uploadReviewMedia(userId: string, item: PendingMedia): Promise<string> {
  const isImage = item.kind === 'image'
  const body: Blob = isImage ? await resizeImage(item.file, 1600, 0.8) : item.file
  const contentType = isImage ? 'image/jpeg' : item.file.type
  const ext = isImage ? 'jpg' : VIDEO_EXT[item.file.type]
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(REVIEW_BUCKET).upload(path, body, { contentType, cacheControl: ONE_YEAR })
  if (error) throw error
  return supabase.storage.from(REVIEW_BUCKET).getPublicUrl(path).data.publicUrl
}

// Removes review files that were uploaded but never attached to a review (best effort).
export async function removeUploadedReviewMedia(urls: string[]): Promise<void> {
  const marker = `/${REVIEW_BUCKET}/`
  const paths = urls.map((u) => u.slice(u.indexOf(marker) + marker.length)).filter(Boolean)
  if (paths.length > 0) await supabase.storage.from(REVIEW_BUCKET).remove(paths).catch(() => {})
}
