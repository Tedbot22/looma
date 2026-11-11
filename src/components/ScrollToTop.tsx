   import { useLayoutEffect } from 'react'
   import { useLocation, useNavigationType } from 'react-router-dom'

   // React Router changes the page but keeps the scroll position, so after tapping a footer
   // link you'd stay at the bottom. This jumps back to the top whenever the page (path) changes.
   // Back/forward buttons are left alone so the browser can restore where you were.
   export default function ScrollToTop() {
     const { pathname, hash } = useLocation()
     const navType = useNavigationType()

     useLayoutEffect(() => {
       if (navType === 'POP') return
       if (hash) {
         document.getElementById(hash.slice(1))?.scrollIntoView()
         return
       }
       window.scrollTo(0, 0)
     }, [pathname, hash, navType])

     return null
   }