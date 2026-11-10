// PLACEHOLDER for the official LOOMA logo, used as the assistant's avatar in the support chat.
// To use the real logo: put the image in /public (for example /public/logo.png), then replace the
// <span> below with:  <img src="/logo.png" alt={STORE_NAME} className={...} />
export default function LoomaLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-white font-bold leading-none text-brand ring-1 ring-gray-200 ${className}`}
    >
      L
    </span>
  )
}
