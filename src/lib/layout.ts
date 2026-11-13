// The page width used across the storefront: it runs to both edges of the screen with comfortable
// side padding, and only stops growing on very large monitors.
export const PAGE_WIDTH = 'mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10'

// Lets a section (like the home page banner) break out of that padding and touch both screen edges.
export const FULL_BLEED = '-mx-4 sm:-mx-6 lg:-mx-10'

// Every list of product cards uses this one grid, so cards are the same size on every page:
// 2 across on phones, 3 on tablets, then 4, 5 and 6 as the screen gets wider.
export const PRODUCT_GRID =
  'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

// Image sizes to upload (also shown to the owner in the admin):
//   Home banner     2400 x 800 px (3:1). Keep the subject and any words in the middle half of the picture,
//                   because phones show a taller, narrower slice of the same image.
//   Product photos  900 x 1200 px or bigger, portrait 3:4. The same photo fills the product card and the
//                   product page. Other shapes still work: they are centred and trimmed to fit.
export const BANNER_SIZE_HINT = '2400 × 800 px (3:1)'
export const PRODUCT_PHOTO_HINT = '900 × 1200 px (portrait 3:4)'
