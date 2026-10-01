// 渲染管线：本地 .md 文件 --(File.text)--> string --(react-markdown)--> React 元素 --> DOM
//
// react-markdown 内部分两段：
//   string ──remark 段──▶ mdast ──转译──▶ hast ──rehype 段──▶ React 元素
//   remark-* 识别 markdown 语法，rehype-* 改造生成出来的 HTML 元素

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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
import "./App.css";

// frontmatter 不是 Markdown 语法，解析前先剥掉
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

// sanitize 是白名单：默认 schema 偏严，这里按文档实际用到的写法做最小放开
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
      ["className", /^(language-|math-)/], // 放行 math-*，否则块级公式降级为行内
    ],
  },
};

const MARKDOWN_EXT = [".md", ".markdown", ".mdown", ".mkd", ".mdx"];
const isMarkdown = (file: File) =>
  MARKDOWN_EXT.some((ext) => file.name.toLowerCase().endsWith(ext)) ||
  file.type === "text/markdown";
const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

type PickedFile = {
  name: string;
  // 浏览器不暴露绝对路径：普通选择只有文件名，目录选择才有多级相对路径
  path: string;
  content: string;
  size: number;
};

export default function App() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const body = useMemo(
    () => (file ? file.content.replace(FRONTMATTER, "") : ""),
    [file],
  );

  const handlePick = () => inputRef.current?.click();

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // 清空，保证再次选同一个文件也能触发 change
    if (!picked || !isMarkdown(picked)) return;
    const content = await picked.text();
    setFile({
      name: picked.name,
      path: picked.webkitRelativePath || picked.name,
      content,
      size: picked.size,
    });
  };

  return (
    <>
      <header className="toolbar">
        <button type="button" className="btn" onClick={handlePick}>
          加载 Markdown 文件
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={[...MARKDOWN_EXT, "text/markdown"].join(",")}
          className="visually-hidden"
          onChange={handleChange}
        />
        <span className="file-path" title={file?.path}>
          {file ? `${file.path} · ${formatSize(file.size)}` : "尚未加载文件"}
        </span>
      </header>

      <main className="page">
        {file ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            // 顺序有要求：raw 在 sanitize 之前，sanitize 在 katex/highlight 之前
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
        ) : (
          <div className="empty">
            <p className="empty-title">还没有加载文件</p>
            <p className="empty-hint">
              点击左上角「加载 Markdown 文件」选择本地的 .md 文件
            </p>
          </div>
        )}
      </main>
    </>
  );
}
