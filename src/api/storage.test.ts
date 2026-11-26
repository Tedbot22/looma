import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import type { PendingMedia } from '../lib/reviewMedia'
import { removeUploadedReviewMedia, uploadProductImage, uploadReviewMedia } from './storage'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
// Shrinking a photo needs a real browser canvas, so the test just checks it is used and what is sent after.
vi.mock('../lib/images', () => ({
  resizeImage: vi.fn(async () => new Blob(['small'], { type: 'image/jpeg' })),
}))
import { resizeImage } from '../lib/images'

const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => {
  fake.reset()
  vi.mocked(resizeImage).mockClear()
})

const photo = (): PendingMedia => ({ kind: 'image', file: new File(['x'], 'p.png', { type: 'image/png' }), preview: 'blob:p', key: 'k1' })
const video = (type = 'video/mp4'): PendingMedia => ({ kind: 'video', file: new File(['v'], 'v.mp4', { type }), preview: 'blob:v', key: 'k2' })

describe('uploadProductImage', () => {
  it('shrinks the photo, stores it under a random name, and returns the public link', async () => {
    const url = await uploadProductImage(new File(['x'], 'tee.png', { type: 'image/png' }))
    expect(resizeImage).toHaveBeenCalledWith(expect.any(File), 1200)
    const [call] = fake.calls
    expect(call.target).toBe('product-images')
    const [path, sent, options] = call.steps[0][1] as [string, string, { contentType: string; cacheControl: string }]
    expect(path).toMatch(/^[0-9a-f-]{36}\.jpg$/) // never the customer's own file name
    expect(sent).toBe('image/jpeg')
    expect(options).toEqual({ contentType: 'image/jpeg', cacheControl: '31536000' })
    expect(url).toBe(`https://files.test/product-images/${path}`)
  })

  it('lets wide banners be larger', async () => {
    await uploadProductImage(new File(['x'], 'b.png'), 2000)
    expect(resizeImage).toHaveBeenCalledWith(expect.any(File), 2000)
  })

  it('throws if the upload is refused', async () => {
    fake.failUploads()
    await expect(uploadProductImage(new File(['x'], 'tee.png'))).rejects.toMatchObject({ message: 'upload refused' })
  })
})

describe('uploadReviewMedia', () => {
  it('puts a photo (shrunk) in the customer’s own folder', async () => {
    const url = await uploadReviewMedia('user-7', photo())
    expect(resizeImage).toHaveBeenCalledWith(expect.any(File), 1600, 0.8)
    const [path, , options] = fake.calls[0].steps[0][1] as [string, string, { contentType: string }]
    expect(fake.calls[0].target).toBe('review-media')
    expect(path).toMatch(/^user-7\/[0-9a-f-]{36}\.jpg$/)
    expect(options.contentType).toBe('image/jpeg')
    expect(url).toBe(`https://files.test/review-media/${path}`)
  })

  it('sends a video as it is, with the right extension for its type', async () => {
    await uploadReviewMedia('user-7', video('video/mp4'))
    await uploadReviewMedia('user-7', video('video/webm'))
    expect(resizeImage).not.toHaveBeenCalled()
    const paths = fake.calls.map((c) => (c.steps[0][1] as [string])[0])
    expect(paths[0]).toMatch(/\.mp4$/)
    expect(paths[1]).toMatch(/\.webm$/)
  })

  it('throws if the upload is refused, so no half-finished review is left', async () => {
    fake.failUploads()
    await expect(uploadReviewMedia('user-7', photo())).rejects.toMatchObject({ message: 'upload refused' })
  })
})

describe('removeUploadedReviewMedia', () => {
  it('removes files by their path inside the bucket', async () => {
    await removeUploadedReviewMedia([
      'https://files.test/review-media/user-7/a.jpg',
      'https://files.test/review-media/user-7/b.mp4',
    ])
    expect(fake.calls[0].target).toBe('review-media')
    expect(fake.calls[0].steps[0]).toEqual(['remove', [['user-7/a.jpg', 'user-7/b.mp4']]])
  })

  it('does nothing for an empty list, and never throws if storage is down', async () => {
    await removeUploadedReviewMedia([])
    expect(fake.calls).toHaveLength(0)
    fake.failStorage()
    await expect(removeUploadedReviewMedia(['https://files.test/review-media/user-7/a.jpg'])).resolves.toBeUndefined()
  })
})
