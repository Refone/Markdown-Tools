def markdown_splitter(md_content: str, max_chunk_size: int) -> list[str]:
    """把 Markdown 文本切成若干段，每段长度尽量不超过 max_chunk_size。

    切分策略：
      1. 先按「段落 / 围栏代码块」拆成原子块，围栏代码块绝不从中间切开；
      2. 再贪心地把块装进 chunk，超过上限就另起一个 chunk；
      3. 单个块（超长行 / 超大代码块）超过上限时才做硬切。

    返回值按顺序拼接（块与块之间补一个空行）即可大致还原原文。
    """
    if max_chunk_size <= 0:
        raise ValueError("max_chunk_size 必须是正整数")

    lines = md_content.split("\n")

    # ---- 第一步：拆原子块 ----
    blocks = []
    buf = []
    fence = None

    def flush():
        nonlocal buf
        if buf:
            blocks.append("\n".join(buf))
            buf = []

    for line in lines:
        stripped = line.lstrip()
        if fence is None:
            if stripped.startswith("```"):
                flush()
                fence = "```"
                buf.append(line)
            elif line == "":
                flush()
            else:
                buf.append(line)
        else:
            buf.append(line)
            if stripped.startswith("```"):
                flush()
                fence = None
    flush()

    # ---- 第二步：贪心装 chunk ----
    chunks = []
    current = []

    for block in blocks:
        # 单个块超过上限：先把已积累的 chunk 收口，再硬切这个块。
        if len(block) > max_chunk_size:
            if current:
                chunks.append("\n\n".join(current))
                current = []
            chunks.extend(_hard_split(block, max_chunk_size))
            continue

        candidate = block if not current else "\n\n".join(current + [block])
        if len(candidate) > max_chunk_size:
            chunks.append("\n\n".join(current))
            current = [block]
        else:
            current.append(block)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def _hard_split(text: str, limit: int) -> list[str]:
    """硬切超长块：优先在最后一个换行处切，否则按字符硬切。"""
    parts = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut <= 0:
            cut = limit
        parts.append(text[:cut])
        text = text[cut:].lstrip("\n")
    if text:
        parts.append(text)
    return parts
