// 渲染管线：本地 .md 文件 --(File.text)--> string --(react-markdown)--> React 元素 --> DOM
//
// react-markdown 内部分两段：
//   string ──remark 段──▶ mdast ──转译──▶ hast ──rehype 段──▶ React 元素
//   remark-* 识别 markdown 语法，rehype-* 改造生成出来的 HTML 元素

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
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

import { runMarkdownSplitter } from "./python";
import splitterScript from "./splitter.py?raw";
import sampleMd from "../asset/sample.md?raw";

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

type Mode = "view" | "logic";
type ViewKind = "origin" | "split";

type ChunkState = {
  fingerprint: string;
  chunks: string[];
  stdout: string;
  error: string | null;
};

// 没加载文件时，splitter logic 页用这份示例内容跑脚本
const SAMPLE_BODY = sampleMd.replace(FRONTMATTER, "");

function Markdown({ children }: { children: string }) {
  return (
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
      {children}
    </ReactMarkdown>
  );
}

// 右上角的两个分段开关
function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`segmented${disabled ? " is-disabled" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "segmented-item active" : "segmented-item"}
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// 带行号的 Python 编辑器（无第三方依赖，滚动时行号跟着走）
function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  const syncScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + "    " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div className="editor">
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="editor-input"
        value={value}
        spellCheck={false}
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        aria-label="Python 脚本编辑器"
      />
    </div>
  );
}

function chunkPreview(text: string): string {
  const flat = text.replace(/\n/g, "↵");
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [view, setView] = useState<ViewKind>("origin");
  const [script, setScript] = useState(splitterScript);
  const [maxChunkSize, setMaxChunkSize] = useState(2000);
  const [chunkState, setChunkState] = useState<ChunkState | null>(null);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef<string | null>(null);

  const body = useMemo(
    () => (file ? file.content.replace(FRONTMATTER, "") : ""),
    [file],
  );

  // 当前要拿去切分的内容：优先用加载的文件，否则用示例。
  const currentContent = file ? body : SAMPLE_BODY;
  const fingerprint = `${currentContent}\u0000${script}\u0000${maxChunkSize}`;
  const isStale = chunkState === null || chunkState.fingerprint !== fingerprint;

  const runNow = useCallback(async () => {
    const content = file ? body : SAMPLE_BODY;
    const fp = `${content}\u0000${script}\u0000${maxChunkSize}`;
    runningRef.current = fp;
    setRunning(true);
    try {
      const result = await runMarkdownSplitter(script, content, maxChunkSize);
      setChunkState({
        fingerprint: fp,
        chunks: result.chunks,
        stdout: result.stdout,
        error: null,
      });
    } catch (error) {
      setChunkState({
        fingerprint: fp,
        chunks: [],
        stdout: "",
        error: toMessage(error),
      });
    } finally {
      if (runningRef.current === fp) runningRef.current = null;
      setRunning(false);
    }
  }, [file, body, script, maxChunkSize]);

  // 切到 split 视图且结果过期时，自动跑一次切分。
  useEffect(() => {
    if (mode !== "view" || view !== "split" || !file) return;
    if (!isStale) return;
    if (runningRef.current === fingerprint) return;
    void runNow();
  }, [mode, view, file, isStale, fingerprint, runNow]);

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

  const splitMarkdown =
    view === "split" && chunkState && !chunkState.error && chunkState.chunks.length > 0;

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

        <div className="toolbar-switches">
          <Segmented
            value={mode}
            options={[
              { value: "view", label: "markdown view" },
              { value: "logic", label: "splitter logic" },
            ]}
            onChange={setMode}
          />
          <Segmented
            value={view}
            options={[
              { value: "origin", label: "origin" },
              { value: "split", label: "split" },
            ]}
            onChange={setView}
            disabled={mode === "logic"}
          />
        </div>
      </header>

      <main className={mode === "view" ? "page" : "page logic-page"}>
        {mode === "view" ? (
          !file ? (
            <div className="empty">
              <p className="empty-title">还没有加载文件</p>
              <p className="empty-hint">
                点击左上角「加载 Markdown 文件」选择本地的 .md 文件
              </p>
            </div>
          ) : view === "origin" ? (
            <Markdown>{body}</Markdown>
          ) : running ? (
            <div className="empty">
              <p className="empty-title">正在切分…</p>
              <p className="empty-hint">用脚本里的 markdown_splitter 处理文档</p>
            </div>
          ) : chunkState?.error ? (
            <div className="run-error">
              <div className="run-error-title">切分出错</div>
              <pre>{chunkState.error}</pre>
            </div>
          ) : !splitMarkdown ? (
            <div className="empty">
              <p className="empty-title">切分结果为空</p>
              <p className="empty-hint">
                回到 splitter logic 检查脚本，或调大 max_chunk_size
              </p>
            </div>
          ) : (
            <div className="split-view">
              {chunkState!.chunks.map((chunk, index) => (
                <section className="chunk" key={index}>
                  <div className="chunk-label">
                    <span>Chunk {index + 1}</span>
                    <span className="chunk-label-len">{chunk.length} 字符</span>
                  </div>
                  <Markdown>{chunk}</Markdown>
                </section>
              ))}
            </div>
          )
        ) : (
          <div className="logic">
            <div className="logic-head">
              <h1 className="logic-title">Splitter Logic</h1>
              <p className="logic-desc">
                编辑下面的 Python 脚本，脚本会通过 Pyodide（WebAssembly Python）
                在浏览器内执行。入口函数必须为{" "}
                <code>
                  markdown_splitter(md_content: str, max_chunk_size: int) → list[str]
                </code>
                。
              </p>
            </div>

            <div className="logic-controls">
              <label className="logic-field">
                <span>max_chunk_size</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={maxChunkSize}
                  onChange={(event) => {
                    const n = event.target.valueAsNumber;
                    setMaxChunkSize(
                      Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
                    );
                  }}
                />
              </label>
              <span className="logic-input-hint">
                当前输入：{file ? file.name : "示例 sample.md（尚未加载文件）"}
              </span>
              <button
                type="button"
                className="btn logic-run"
                onClick={() => void runNow()}
                disabled={running}
              >
                {running ? "运行中…" : "运行"}
              </button>
            </div>

            <CodeEditor value={script} onChange={setScript} />

            {chunkState?.error ? (
              <div className="run-error">
                <div className="run-error-title">运行出错</div>
                <pre>{chunkState.error}</pre>
              </div>
            ) : chunkState ? (
              <div className="run-result">
                <div className="run-result-head">
                  共 {chunkState.chunks.length} 个 chunk · 合计{" "}
                  {chunkState.chunks.reduce((sum, c) => sum + c.length, 0)} 字符
                </div>
                {chunkState.stdout && (
                  <pre className="run-stdout">{chunkState.stdout}</pre>
                )}
                <ol className="chunk-summary">
                  {chunkState.chunks.map((chunk, index) => (
                    <li key={index}>
                      <span className="chunk-summary-idx">#{index + 1}</span>
                      <span className="chunk-summary-len">{chunk.length} 字符</span>
                      <code className="chunk-summary-preview">
                        {chunkPreview(chunk)}
                      </code>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="logic-hint">点击「运行」执行脚本，查看切分结果。</p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
