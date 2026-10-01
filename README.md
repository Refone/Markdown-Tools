# Markdown-Splitter

Vite + React + TypeScript 学习项目，目标是一步步搞懂「在浏览器里渲染 Markdown」到底是怎么实现的。

```bash
npm install
npm run dev
```

---

## 第 1 步：只用 react-markdown，渲染一个写死的本地文件

依赖里只有一个新东西：`react-markdown`（它的解析内核 unified / remark / rehype 会被一起装进来）。

### 核心逻辑

`src/App.tsx` 里真正有意义的只有三行：

```tsx
import markdown from '../asset/sample.md?raw'   // 1. 拿到 markdown 字符串

<ReactMarkdown>{markdown}</ReactMarkdown>       // 2. 字符串 → React 元素树
                                                // 3. React 把元素树渲染成 DOM
```

数据流：

```
asset/sample.md
      │  Vite 的 ?raw 后缀（构建时，把文件内容当字符串导出）
      ▼
   string  "---\ntitle: ..."
      │  react-markdown（运行时，内部是 unified：markdown → mdast → hast → React 元素）
      ▼
 React 元素树  <h1> <p> <ul> …
      │  React DOM
      ▼
   真实 DOM
```

### 两个关键点

**1. `?raw` 不是 react-markdown 的功能，是 Vite 的功能。**
默认情况下 `import x from './a.md'` 会把 `.md` 当 JS 模块解析（然后报错或得到空对象）。加上 `?raw` 后 Vite 直接把文件内容作为字符串给你。换文件就是改这一行路径。

**2. react-markdown 产出的是 React 元素，不是 HTML 字符串。**
它内部把 markdown 解析成 AST，再转成 React 元素交给 React 渲染 —— 没有 `innerHTML`，默认也不会执行文档里的 HTML/脚本。这也是它比 `markdown-it + dangerouslySetInnerHTML` 更安全的原因。

### 现在能渲染什么

只有 **CommonMark 标准语法**：标题、段落、强调（`*斜体*` `**粗体**`）、有序/无序列表、嵌套列表、引用（含嵌套）、链接、图片、围栏代码块（带 `language-xxx` class，但**没有**语法高亮）、行内代码、水平线、反斜杠转义、`<https://example.com>` 形式的自动链接。

### 现在渲染不出来什么（实测结果，等于下一步的清单）

`asset/sample.md` 里刻意留了各种扩展语法，现在的表现是：

| sample.md 里的写法 | 现在的表现 | 需要补的东西 |
| --- | --- | --- |
| 表格 `\| a \| b \|` | 原样显示成一堆管道符文本 | `remark-gfm` |
| 任务列表 `- [x] 完成` | 原样显示成 `[x] 完成`，没有复选框 | `remark-gfm` |
| 删除线 `~~x~~` | 原样显示 `~~x~~` | `remark-gfm` |
| 脚注 `[^1]` | 原样显示，不生成脚注区 | `remark-gfm` |
| 文档里的原生 HTML（`<div>`、`<details>`、`<mark>`、`<u>`） | **当成纯文本显示出来**（能看到 `<div style="...">` 这些字符），不会被解析成真实元素 | `rehype-raw` |
| 首部 frontmatter | 变成一条 `<hr>` + 一个 `<h2>`（因为 CommonMark 里紧跟段落的 `---` 是「setext 标题下划线」），YAML 被当成标题文字 | 自己在喂给 react-markdown 之前剥掉，或用 `remark-frontmatter` |
| 目录里的 `[1. 标题层级](#1-标题层级)` | 显示成链接但**点了不跳**，因为标题上没有 `id` | `rehype-slug` |
| 代码块 | 有 `<pre><code class="language-javascript">`，但没有着色 | `rehype-highlight` |
| `$E = mc^2$`、`$$…$$` | 原样显示 | `remark-math` + `rehype-katex` |

建议的推进顺序：**remark-gfm → frontmatter 剥离 → rehype-raw → rehype-slug → rehype-highlight → remark-math + katex**，每加一个插件都回来对照这张表看变化，就能看清每个插件到底负责哪一段。

### 关于样式

- `src/index.css` 被清成了最小的全局重置。原因：Vite 模板自带的 index.css 是按「宣传页」排的（`#root` 固定 1126px、`h1` 56px、`p{margin:0}`、`code` 变成 `inline-flex`），这些规则会和 Markdown 自己的排版打架。
- `src/App.css` 只负责让渲染结果好读（标题间距、代码块底色…），跟解析逻辑无关，可以随意改；颜色走 `index.css` 里的 CSS 变量，所以跟随系统深浅色。
