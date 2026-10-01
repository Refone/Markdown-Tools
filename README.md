# Markdown-Splitter

Vite + React + TypeScript 学习项目：把一份本地 Markdown 渲染到浏览器里。

```bash
npm install
npm run dev
```

## 渲染管线

```
本地 .md 文件
   │  <input type="file"> + File.text()（在浏览器里读成字符串，内容不上传）
   ▼
string ──remark 段──▶ mdast ──转译──▶ hast ──rehype 段──▶ React 元素 ──▶ DOM
        语法识别                     元素改造
```

- **`remark-*` 改语法树**：决定 markdown 里哪些写法能被识别（表格、公式、frontmatter…）
- **`rehype-*` 改元素树**：决定识别出来的东西渲染成什么元素
- 两段是管道里先后两个阶段，不可互换。个别能力必须跨段成对：`remark-math` 识别公式，`rehype-katex` 渲染公式
- react-markdown 产出的是 React 元素而不是 HTML 字符串，全程没有 `innerHTML`
- 浏览器出于安全**不暴露文件的本地绝对路径**：顶栏显示的「路径」实际是文件名（选目录时才是多级相对路径）

## 插件清单

| 依赖 | 段 | 作用 |
| --- | --- | --- |
| `remark-gfm` | remark | 表格 / 任务列表 / 删除线 / 脚注 / 自动链接 |
| `remark-math` | remark | 识别 `$…$` 与 `$$…$$` |
| `rehype-raw` | rehype | 文档里的原生 HTML 变成真元素 |
| `rehype-sanitize` | rehype | 按白名单清洗元素 |
| `rehype-slug` | rehype | 标题 `id`，让目录锚点能跳 |
| `rehype-katex` | rehype | math 节点 → KaTeX 公式 |
| `rehype-highlight` | rehype | 代码块高亮 |

## 三个关键点

### 1. 插件顺序：只有两条真实约束（都做过 A/B 验证）

```tsx
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeSlug, rehypeKatex, rehypeHighlight]}
```

| 约束 | 违反后果 | 实测 |
| --- | --- | --- |
| `raw` 在 `sanitize` 之前 | 原生 HTML **整个消失** —— sanitize 只认元素和文本，会把还没变成元素的 `raw` 节点直接丢掉 | `details` 1 → 0 |
| `sanitize` 在 `katex`/`highlight` 之前 | 它们生成的 class 被清掉 | KaTeX 11 → 0、高亮 token 106 → 0 |
| `katex` ↔ `highlight` | **没有约束**：highlight 只高亮它认识的语言，`language-math` 不在其中 | 两种顺序结果完全一致 |

### 2. frontmatter 不是 Markdown 语法，必须在解析前剥掉

CommonMark 里 `---` 只有两种身份：分割线，或**上一段的标题下划线**（setext）。`sample.md` 第 7 行的 `---` 紧贴前面的 YAML（中间没空行），于是整段 YAML 被提升成了一个 `<h2>`。

`src/App.tsx` 用一条正则只匹配「文件最开头」的 `---` 块来剥离。这类问题**只能在解析前或解析中处理** —— 到了 rehype 阶段，看到的已经是 `<hr>` / `<h2>`，来不及了。

### 3. sanitize 是白名单，默认值需要三处放开

| 放开 | 原因 |
| --- | --- |
| `tagNames` 加 `mark`/`u`/`abbr`，`div` 加 `style`，`abbr` 加 `title` | 默认 schema 会把这些合法标签/属性删掉 |
| `code.className` 额外放行 `/^math-/` | 少了 `math-display`，块级公式会**静默降级为行内** |
| `clobberPrefix: ''` | 默认给 `id` 加前缀却不同步改 `href`，会打断脚注锚点。必须写在 `...defaultSchema` **之后**，否则被 spread 覆盖 |

白名单的兜底行为值得记一笔：**不在 `tagNames` 里的元素是「拆壳保留内容」**（`<mark>x</mark>` 只剩文字），只有 `strip` 里的（默认仅 `script`）才连内容一起删。所以被删掉的 `<style>` 会把 CSS 源码当可见文字显示出来 —— 不需要的话把 `style` 加进 `strip`。

## 实测结果

| 项 | 结果 |
| --- | --- |
| 表格 / 复选框 / 删除线 / 脚注区 | 3 / 5（全部 disabled）/ 1 / 1 |
| 原生 HTML | `details` 1、`mark` 2、`kbd` 2、`abbr` 1、`u` 1 |
| 代码高亮 | 10/11 块着色（无语言那块正确跳过），106 个 token |
| KaTeX | 行内 1 + 块级 2 |
| 标题 `id` / 目录锚点 | 55 个 id，16 个锚点全部能解析 |
| 控制台 warning/error | 0 |

加 sanitize 前后这份结果**逐项一致**，说明白名单收紧没有误伤合法内容。

## 样式

- `src/index.css`：全局重置 + 主题变量（跟随系统深浅色）。Vite 模板自带的 index.css 是按「宣传页」排的（`#root` 固定 1126px、`h1` 56px、`p{margin:0}`），会和 Markdown 排版打架，已清掉。
- `src/App.css`：只负责让渲染结果好读（标题间距、代码块底色、`--hl-*` 高亮配色…），与解析逻辑无关。

## 后续

- 已经支持打开任意本地文件，`rehype-sanitize` 从此开始真正干活（之前 `sample.md` 是构建期写死的可信文件）。可选再补：拖拽打开、粘贴内容、上次文件的记忆。
- 想让 frontmatter 当数据用（标题、标签）：解析前用 `gray-matter` 抽成对象，而不是把它渲染出来。
