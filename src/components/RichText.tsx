import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

// A tiny formatter for the pages the owner edits (About, FAQ, Privacy, Terms), so the owner can write
// plain text instead of code. Supported:
//   ## Heading          a heading
//   - point             a bullet point
//   blank line          a new paragraph
//   **bold**            bold text
//   [label](/shop)      a link (a path on the site, or an https://, mailto: or tel: address)
// Nothing here ever inserts raw HTML, so the text can't be used to inject a script.

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: line.slice(3).trim() })
    } else if (line.startsWith('- ')) {
      flushParagraph()
      list.push(line.slice(2).trim())
    } else if (line === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

const SAFE_LINK = /^(\/(?!\/)|https:\/\/|http:\/\/|mailto:|tel:)/

// Turns **bold** and [label](url) inside a line of text into elements.
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g)
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={i}>{bold[1]}</strong>

    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const [, label, url] = link
      if (!SAFE_LINK.test(url)) return label // a link to anything unexpected is shown as plain text
      return url.startsWith('/') ? (
        <Link key={i} to={url} className="font-medium text-brand underline">
          {label}
        </Link>
      ) : (
        <a key={i} href={url} className="font-medium text-brand underline" target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      )
    }
    return part
  })
}

function BlockView({ block }: { block: Block }) {
  if (block.type === 'list') {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-gray-700">
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    )
  }
  if (block.type === 'heading') return <h2 className="pt-4 text-lg font-semibold">{inline(block.text)}</h2>
  return <p className="leading-relaxed text-gray-700">{inline(block.text)}</p>
}

export function RichText({ content }: { content: string }) {
  return (
    <div className="space-y-3">
      {parseBlocks(content).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  )
}

// The FAQ: each "## question" becomes a section that opens to show its answer.
export function FaqAccordion({ content }: { content: string }) {
  const blocks = parseBlocks(content)
  const groups: { question: string; answer: Block[] }[] = []
  const intro: Block[] = []

  for (const block of blocks) {
    if (block.type === 'heading') groups.push({ question: block.text, answer: [] })
    else if (groups.length) groups[groups.length - 1].answer.push(block)
    else intro.push(block)
  }

  return (
    <div>
      {intro.length > 0 && (
        <div className="mb-6 space-y-3">
          {intro.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )}
      <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
        {groups.map((g, i) => (
          <details key={i} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {g.question}
              <span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {g.answer.map((b, j) => (
                <BlockView key={j} block={b} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
