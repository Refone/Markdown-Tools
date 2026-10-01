# react-markdown 能力边界

| 写法                              | 现在的表现                                                      | 下一步要加的                   |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| 表格                              | 原样显示成一堆管道符文本（`table` 数量 = 0）                    | `remark-gfm`                   |
| `- [x] 任务`                      | 原样文本 `[x]`，无复选框（checkbox = 0）                        | `remark-gfm`                   |
| `~~删除线~~`                      | 原样显示（`del` = 0）                                           | `remark-gfm`                   |
| `[^1]` 脚注                       | 原样显示，无脚注区                                              | `remark-gfm`                   |
| `<div>` / `<details>` / `<mark>`  | **当纯文本显示**，页面上能直接看到 `<div style="...">` 这些字符 | `rehype-raw`                   |
| frontmatter                       | 变成 `<hr>` + `<h2>`，YAML 被当成标题文字                       | 自己剥掉                       |
| 目录 `[1. 标题层级](#1-标题层级)` | 是链接但**点了不跳**，标题没有 `id`                             | `rehype-slug`                  |
| 代码块                            | 有 `<code class="language-javascript">`，但不着色               | `rehype-highlight`             |
| `$E = mc^2$`                      | 原样显示                                                        | `remark-math` + `rehype-katex` |
