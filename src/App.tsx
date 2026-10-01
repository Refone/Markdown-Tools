// 渲染管线：sample.md --(?raw)--> string --(react-markdown)--> React 元素 --> DOM
//
// react-markdown 内部分两段：
//   string ──remark 段──▶ mdast ──转译──▶ hast ──rehype 段──▶ React 元素
//   remark-* 识别 markdown 语法，rehype-* 改造生成出来的 HTML 元素

import ReactMarkdown from "react-markdown";

// ---- remark 段：语法识别 ----
import remarkGfm from "remark-gfm"; // 表格 / 任务列表 / 删除线 / 脚注
import remarkMath from "remark-math"; // $…$ 与 $$…$$

// ---- rehype 段：元素改造 ----
import rehypeRaw from "rehype-raw"; // 原生 HTML 变回真元素
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"; // 按白名单清洗
import rehypeSlug from "rehype-slug"; // 标题 id，让目录锚点能跳
import rehypeKatex from "rehype-katex"; // math 节点渲染成公式
import rehypeHighlight from "rehype-highlight"; // 代码块高亮

import "katex/dist/katex.min.css"; // KaTeX 自带样式

// 写死的文件：换文件改这一行
import markdown from "../asset/sample.md?raw";

import "./App.css";

// frontmatter 不是 Markdown 语法，解析前先剥掉
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const body = markdown.replace(FRONTMATTER, "");

// 默认 schema 偏严：会删掉 <mark>/<u>/<abbr>、div 的 style，
// 以及 code 上的 math-* class（少了它块级公式会降级成行内），
// 所以按文档实际用到的写法做「最小放开」。
// 以下为白名单, 允许 markdown 中出现的 html 标签和属性，其他的都会被过滤掉
const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "", // 默认给 id 加前缀但不同步改 href，会打断脚注锚点
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "u", "abbr"],
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "style"],
    abbr: [...(defaultSchema.attributes?.abbr ?? []), "title"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^(language-|math-)/],
    ],
  },
};

export default function App() {
  return (
    <div className="page">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // 顺序有要求：raw 必须在 sanitize 之前（反过来原生 HTML 会被整个丢掉），
        // sanitize 必须在 katex/highlight 之前（否则它们生成的 class 会被清掉）
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
          rehypeKatex,
          rehypeHighlight,
        ]}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
