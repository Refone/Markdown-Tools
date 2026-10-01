// ============================================================================
// 「在浏览器里渲染本地 Markdown 文件」的全部核心逻辑，就三步：
//
//   1) ?raw        —— 让 Vite 在构建时把 .md 文件当成字符串读进来
//   2) ReactMarkdown —— 把 markdown 字符串解析成 React 元素树
//   3) React       —— 把元素树渲染进 DOM（这一步是 React 自己做的）
//
// 数据流：sample.md → (Vite ?raw) → string → (react-markdown) → React 元素 → DOM
//
// 除此之外没有任何东西：没有文件选择、没有状态、没有路由、没有插件。
// ============================================================================

import ReactMarkdown from 'react-markdown'

// 文件写死在这里：换文件就改这一行路径（例如 '../asset/example.md?raw'）
import markdown from '../asset/sample.md?raw'

import './App.css'

export default function App() {
  return (
    <div className="page">
      {/* children 就是 markdown 字符串本身 */}
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  )
}
