// ============================================================================
// 渲染本地 Markdown：数据流与分层
//
//   sample.md  --(?raw)-->  string  --(react-markdown)-->  React 元素  -->  DOM
//
// react-markdown 内部是一条流水线，插件分两段：
//
//   string ──remark 段──▶ mdast ──转译──▶ hast ──rehype 段──▶ React 元素
//   （markdown 语法层）            （HTML 元素层）
//
//   · remark-* 跑在「语法树」上：负责“识别”新的 markdown 语法
//   · rehype-* 跑在「元素树」上：负责“改造”已经生成的 HTML 元素
//   · 有的能力必须跨两段成对出现：remark-math 识别公式，rehype-katex 渲染公式
// ============================================================================

import ReactMarkdown from 'react-markdown'

// ---- remark 段：语法识别 ----
import remarkGfm from 'remark-gfm' // 表格 / 任务列表 / 删除线 / 脚注 / 自动链接
import remarkMath from 'remark-math' // 把 $…$ 和 $$…$$ 识别成 math 节点

// ---- rehype 段：元素改造 ----
import rehypeRaw from 'rehype-raw' // 把文档里的原生 HTML 从“纯文本”变成真元素
import rehypeSlug from 'rehype-slug' // 给标题生成 id，让 [目录](#锚点) 能跳
import rehypeKatex from 'rehype-katex' // 把 math 节点渲染成 KaTeX 公式
import rehypeHighlight from 'rehype-highlight' // 代码块语法高亮

import 'katex/dist/katex.min.css' // KaTeX 自带的公式样式

// 文件写死在这里：换文件就改这一行路径
import markdown from '../asset/sample.md?raw'

import './App.css'

// 首部 frontmatter 不是 Markdown，在交给解析器之前剥掉（详见 README 专题）
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
const body = markdown.replace(FRONTMATTER, '')

export default function App() {
  return (
    <div className="page">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // rehype 插件的顺序有意义：先 raw 让 HTML 成真元素，
        // 再 slug 给标题加 id，再 katex 吃掉公式（否则会被后面的 highlight 误当成代码），
        // 最后 highlight 高亮代码块。
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex, rehypeHighlight]}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
