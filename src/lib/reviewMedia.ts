// Photos and videos on reviews: the limits, the upload, and the shape of the data.
// (The upload itself is in src/api/storage.ts.)

export const MAX_REVIEW_PHOTOS = 4
export const MAX_REVIEW_VIDEOS = 1
export const MAX_VIDEO_MB = 25 // matches the bucket's file size limit
export const MAX_VIDEO_SECONDS = 30

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm'

export interface ReviewMedia {
  id: string
  review_id: string
  kind: 'image' | 'video'
  url: string
}

// A file the customer picked, not yet uploaded.
export interface PendingMedia {
  key: string
  kind: 'image' | 'video'
  file: File
  preview: string // an object URL for the thumbnail
}

export const VIDEO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

// How long a video is, read from the file itself (so a 5 minute clip is refused before uploading).
export function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve(video.duration)
    video.onerror = () => reject(new Error("This video can't be read"))
    video.src = url
  })
}

// Checks a video against the limits. Returns a plain-language problem, or null when it is fine.
export async function checkVideo(file: File, preview: string): Promise<string | null> {
  if (!(file.type in VIDEO_EXT)) return 'Please choose an MP4, MOV or WebM video.'
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) return `Videos can be up to ${MAX_VIDEO_MB} MB.`
  try {
    const seconds = await readVideoDuration(preview)
    // Some phones report Infinity until the video is played: only refuse when we know it is too long.
    if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 1) return `Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`
  } catch {
    return "We couldn't read that video. Try another one."
  }
  return null
}
