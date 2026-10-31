import { supabase } from './supabase'

// Phone photos are often 3 to 8 MB. Shrinking them BEFORE upload means faster uploads for the
// owner, and much faster pages (and less mobile data) for students browsing the store.
export async function resizeImage(file: File, maxSize = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // also respects the phone's rotation
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image'))),
      'image/jpeg',
      quality
    )
  )
}

// Uploads one photo and returns its public URL.
export async function uploadProductImage(file: File): Promise<string> {
  const blob = await resizeImage(file)
  const path = `${crypto.randomUUID()}.jpg` // random name: no clashes, no guessable URLs

  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error

  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
