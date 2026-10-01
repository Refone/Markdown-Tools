// 在浏览器里执行 Python 脚本（Pyodide / WebAssembly）。
// 运行时会从 CDN 惰性加载，只有第一次跑切分器时才下载。
//
// 约定：脚本必须定义一个
//   markdown_splitter(md_content: str, max_chunk_size: int) -> list[str]

const PYODIDE_VERSION = "0.29.5";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;

// Pyodide 没有官方 TS 类型，这里只声明用得到的最小接口。
type PyProxy = {
  toJs: () => unknown;
  destroy: () => void;
};

type Pyodide = {
  runPython: (code: string) => unknown;
  globals: { set: (name: string, value: unknown) => void };
  setStdout: (options?: { batched?: (text: string) => void }) => void;
  setStderr: (options?: { batched?: (text: string) => void }) => void;
};

declare global {
  interface Window {
    loadPyodide?: (options?: Record<string, unknown>) => Promise<Pyodide>;
  }
}

let runtimePromise: Promise<Pyodide> | null = null;

function loadRuntime(): Promise<Pyodide> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!window.loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = PYODIDE_URL;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("无法从 CDN 加载 Pyodide，请检查网络连接"));
          document.head.appendChild(script);
        });
      }
      return window.loadPyodide!();
    })();
  }
  return runtimePromise;
}

export type SplitterResult = {
  chunks: string[];
  stdout: string;
};

export async function runMarkdownSplitter(
  script: string,
  mdContent: string,
  maxChunkSize: number,
): Promise<SplitterResult> {
  const pyodide = await loadRuntime();

  // 捕获脚本里 print() 的输出，方便调试。
  let stdout = "";
  const capture = (text: string) => {
    stdout += text;
  };
  pyodide.setStdout({ batched: capture });
  pyodide.setStderr({ batched: capture });

  try {
    pyodide.runPython(script);

    // 通过全局变量传参，避免把大段 Markdown 内联进 Python 字符串。
    pyodide.globals.set("__md_content", mdContent);
    pyodide.globals.set("__max_chunk_size", maxChunkSize);

    const raw = pyodide.runPython(
      "markdown_splitter(__md_content, __max_chunk_size)",
    ) as PyProxy;

    let chunks: string[];
    try {
      const js = raw.toJs();
      if (Array.isArray(js)) {
        chunks = js.map((item) => String(item));
      } else {
        throw new Error(
          `markdown_splitter 必须返回 list[str]，实际返回了 ${typeof js}`,
        );
      }
    } finally {
      raw.destroy();
    }

    return { chunks, stdout };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  } finally {
    // 恢复默认 stdout / stderr，避免影响后续运行。
    try {
      pyodide.setStdout();
      pyodide.setStderr();
    } catch {
      // 恢复失败也不影响切分结果。
    }
  }
}
