export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-gray-400">This page is coming soon.</p>
    </div>
  )
}
