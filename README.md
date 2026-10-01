# Markdown-Splitter

Vite + React + TypeScript 学习项目，目标是一步步搞懂「在浏览器里渲染 Markdown」到底是怎么实现的。

```bash
npm install
npm run dev
```

> **当前进度：第 2 步已完成。** `src/App.tsx` 已经装齐全套渲染插件，`asset/sample.md` 能完整渲染（表格 / 任务列表 / 脚注 / 原生 HTML / 目录跳转 / 代码高亮 / 数学公式）。下面按步骤记录学习过程。

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

### 当时渲染不出来什么（第 1 步的实测，现在这些都已解决）

`asset/sample.md` 里刻意留了各种扩展语法，第 1 步（只有 react-markdown）时的表现是：

| sample.md 里的写法 | 现在的表现 | 需要补的东西 |
| --- | --- | --- |
| 表格 `\| a \| b \|` | 原样显示成一堆管道符文本 | `remark-gfm` |
| 任务列表 `- [x] 完成` | 原样显示成 `[x] 完成`，没有复选框 | `remark-gfm` |
| 删除线 `~~x~~` | 原样显示 `~~x~~` | `remark-gfm` |
| 脚注 `[^1]` | 原样显示，不生成脚注区 | `remark-gfm` |
| 文档里的原生 HTML（`<div>`、`<details>`、`<mark>`、`<u>`） | **当成纯文本显示出来**（能看到 `<div style="...">` 这些字符），不会被解析成真实元素 | `rehype-raw` |
| 首部 frontmatter | 原样交给解析器时会变成 `<hr>` + 一个 `<h2>`（见下面专题） | 已在 `App.tsx` 里剥掉 |
| 目录里的 `[1. 标题层级](#1-标题层级)` | 显示成链接但**点了不跳**，因为标题上没有 `id` | `rehype-slug` |
| 代码块 | 有 `<pre><code class="language-javascript">`，但没有着色 | `rehype-highlight` |
| `$E = mc^2$`、`$$…$$` | 原样显示 | `remark-math` + `rehype-katex` |

建议的推进顺序：**remark-gfm → rehype-raw → rehype-slug → rehype-highlight → remark-math + katex**（frontmatter 已经在第 1 步顺手处理掉了），每加一个插件都回来对照这张表看变化，就能看清每个插件到底负责哪一段。

### 专题：frontmatter 为什么会变成一个标题？

**问题不在「YAML 显示得难看」，而在于：CommonMark 规范里根本没有 frontmatter 这个概念。**
对解析器来说 `---` 只有两种身份 —— 分割线（thematic break），或者**上一段的标题下划线**（setext heading underline）。

- **触发位置**：`asset/sample.md` 第 1–7 行。第 1 行的 `---` 前面没有段落 → 解析成分割线；第 7 行的 `---` **紧贴着第 2–6 行的 YAML 段落（中间没有空行）** → 被当成 setext 下划线，把「那一整段」提升成二级标题。
- **表现出来位置**：`src/App.tsx` 里的 `<ReactMarkdown>{markdown}</ReactMarkdown>` —— 传进去的是整份文件，frontmatter 也一起进去了。

用 `unified + remark-parse` 解析真实文件，mdast 顶层节点是这样的（可以自己跑一遍验证）：

```
① sample.md 原样        : thematicBreak → heading(h2) → heading(h1) → blockquote → …
② 收尾 --- 前加一个空行  : thematicBreak → paragraph → thematicBreak → heading(h1) → …
                          （错法变了而已：YAML 变成一段正文，仍然不是元数据）
③ 剥掉 frontmatter 之后  : heading(h1) → blockquote → heading(h2) → list → …   ✅
④ 首行是 --- 且没有收尾  : thematicBreak → heading(h1) → paragraph
                          （普通分割线不受影响，因为「必须找到收尾的 ---」这个条件不满足）
```

所以 `src/App.tsx` 里在**送进 react-markdown 之前**先做一次剥离：

```tsx
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
const body = markdown.replace(FRONTMATTER, '')
```

逐段拆开看：

| 片段 | 作用 |
| --- | --- |
| `^` + `\uFEFF?` | 只匹配**文件最开头**（顺便吃掉 BOM），正文中间出现的 `---` 不会被误伤 |
| `---[ \t]*\r?\n` | 第一行必须是 `---`（允许行尾空格，兼容 CRLF 换行） |
| `[\s\S]*?` | 中间是任意内容，**非贪婪** |
| `\r?\n---[ \t]*` | 必须能找到收尾的 `---`；找不到就整体不匹配，文件原样传下去 |
| `(?:\r?\n\|$)` | 连收尾换行一起吃掉，免得正文开头多一个空行 |

效果（实测 DOM）：页面第一个块级元素从 `HR → H2` 变回 `H1`，`h2` 数量 15 → 14，YAML 文本不再出现在页面上。

几个要知道的边界：

- **元数据被丢掉了。** 现在只是「不显示」。要真正用它（显示标题、标签、按标签分类），还得再解析一次 YAML：轻量做法是 `gray-matter` / `yaml`，插件做法是 `remark-frontmatter`。
- **没有 frontmatter 的文件完全不受影响** —— 整体匹配要求「开头 `---` + 中间内容 + 收尾 `---`」同时成立。
- **歧义是 frontmatter 自己的问题，不是正则的问题。** 如果一份文档正文第一行恰好是分割线 `---`、后面又出现 `---`，它会被误当成 frontmatter。frontmatter 是约定而非规范，所有工具（Jekyll、Obsidian、GitHub）都是按「文件开头」来猜的。
- **另一种改法**：装 `remark-frontmatter`，让 remark 阶段就把它识别成 AST 里的 `yaml` 节点而不是标题。它默认**不显示也不报错** —— `mdast-util-to-hast` 的 handler 表里写着一行 `yaml: ignore`。所以「只想让它别变成标题」的话，它和手写正则**二选一**即可（选它就更严谨，因为是在语法层识别，不靠猜）。
- **想让 frontmatter 显示出来**（比如一块「文档信息」面板）：最省事的办法是给它换一个**有 handler 的节点类型** —— 把 `yaml` 节点改写成 `code` 节点（`lang: 'yaml'`），它就会渲染成代码块。注意直接设 `data.hName` 是没用的：`mdast-util-to-hast` 的分发逻辑是「节点类型有注册 handler 就走 handler」，压根不会看 `hName`。
- **想把 frontmatter 当数据用**（读 title / tags 做过滤、当页面标题）：那是另一条路，在解析前用 `gray-matter` / `yaml` 把它抽成 JS 对象，正文再交给解析器。Astro、VitePress、Docusaurus 都是这么做的。

### 专题：rehype 类插件能救 frontmatter 吗？—— 不能

react-markdown 的插件分两层，**frontmatter 的命运在最早那层就定了**：

| 层 | 跑在这一层的插件 | 它看到的东西 |
| --- | --- | --- |
| remark（mdast，markdown 语法层） | `remark-parse`、`remark-gfm`、`remark-frontmatter`… | **原始 markdown 文本转成的语法树**。frontmatter 在这一层被正确识别，或者被误判成 `thematicBreak + heading` |
| rehype（hast，HTML 元素层） | `rehype-raw`、`rehype-slug`、`rehype-highlight`、`rehype-katex`… | 已经是 `<hr>` / `<h2>` 这类元素了，**它根本不知道曾经有过 frontmatter** |
| React 渲染层 | `components={{...}}` | 只能决定「某个已有元素怎么画」，改不了树的结构和来源 |

实测：写一个探针插件挂在 `rehypePlugins` 上打印它实际收到的树 ——

```
不处理              : rehype 看到 [element(hr), text, element(h2), text]      ← 已经坏掉了
加 remark-frontmatter: rehype 看到 [element(h1), text, element(blockquote)…]  ← yaml 节点在进 rehype 之前就被丢掉了
```

结论：**处理 frontmatter 只有两个时机 —— 解析前（字符串预处理）或解析中（remark 插件）**。rehype 永远来不及。



### 关于样式

- `src/index.css` 被清成了最小的全局重置。原因：Vite 模板自带的 index.css 是按「宣传页」排的（`#root` 固定 1126px、`h1` 56px、`p{margin:0}`、`code` 变成 `inline-flex`），这些规则会和 Markdown 自己的排版打架。
- `src/App.css` 只负责让渲染结果好读（标题间距、代码块底色…），跟解析逻辑无关，可以随意改；颜色走 `index.css` 里的 CSS 变量，所以跟随系统深浅色。

---

## 第 2 步：一次装齐渲染插件（把 remark 段 + rehype 段当作一步）

第 1 步之后决定不再把「remark 系列 / rehype 系列」拆成两次来学，而是一次装齐、让 `sample.md` 完整渲染。**但代码里仍按管道分两层注释**，插件各自负责什么没有糊在一起。

### 装了什么

| 依赖 | 挂在哪段 | 解决 sample.md 里的 |
| --- | --- | --- |
| `remark-gfm` | remark | 表格 / 任务列表 / 删除线 / 脚注 / 自动链接 |
| `remark-math` | remark | 把 `$…$` 和 `$$…$$` 识别成 math 节点 |
| `rehype-raw` | rehype | 原生 HTML（`<div>`、`<details>`、`<mark>`、`<kbd>`） |
| `rehype-slug` | rehype | 标题 `id`，让目录锚点能跳 |
| `rehype-katex` | rehype | 把 math 节点渲染成 KaTeX 公式 |
| `rehype-highlight` | rehype | 代码块语法高亮 |
| `katex` | — | KaTeX 的样式/字体（`rehype-katex` 的底层依赖） |

### App.tsx 关键部分

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  // rehype 插件的顺序有意义：先 raw 让 HTML 成真元素，
  // 再 slug 给标题加 id，再 katex 吃掉公式（否则会被后面的 highlight 误当成代码），
  // 最后 highlight 高亮代码块。
  rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex, rehypeHighlight]}
>
  {body}
</ReactMarkdown>
```

注意 `rehypePlugins` 数组里的**顺序**是真实约束（raw → slug → katex → highlight），这跟「remark 和 rehype 谁先装」无关 —— 那是管道结构早就定死的。

### 实测 before / after（headless Chrome 读真实 DOM）

| 检查项 | 第 1 步（裸 react-markdown） | 第 2 步（装齐插件） |
| --- | --- | --- |
| 表格 `table` | 0 | **3** |
| 任务列表复选框 | 0 | **5**（全部 `disabled`） |
| 删除线 `del` | 0 | **1** |
| 脚注区 `.footnotes` | 0 | **1**（2 个引用） |
| 原生 HTML | 源码字符串原样显示 | `<details>`×1、`<mark>`×2、`<kbd>`×2 真元素 |
| 标题 `id` | 无 | `1-标题层级` 等全部生成，目录可跳 |
| 代码高亮 | 无 token | **10/11 个代码块着色**（无语言那块正确跳过），106 个 token |
| KaTeX | 原样文本 | 行内 1 + 块级 2 |

控制台 warning/error 数量：**0**。

### 这一步学到的

1. **remark 段管「识别语法」，rehype 段管「改造元素」**：gfm 之所以是 remark 插件，是因为表格识别发生在分词阶段；raw/slug/highlight 之所以是 rehype 插件，是因为它们要改的是已经生成的 HTML 元素。
2. **有的能力必须成对**：`remark-math` 单独装没有任何可见效果，必须配 `rehype-katex`。
3. **顺序约束在 rehype 数组内部**：`rehypeKatex` 必须在 `rehypeHighlight` 之前，否则数学公式的 `code.language-math` 节点会被 highlighter 误当成代码。

