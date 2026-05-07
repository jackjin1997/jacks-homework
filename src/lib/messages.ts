import type { BaseMessage } from "@langchain/core/messages";

/**
 * 把 LangChain BaseMessage.content 归一化为 string。
 * content 是 string | MessageContentComplex[] 联合类型 (LangChain 1.x):
 *   - string: 直接返回
 *   - array: 提取所有 text block 拼接（忽略 image/tool_use 等非文本 block）
 *   - 其他: ""
 *
 * 所有 /api/* route 返回 reply 前都过这个 helper, 避免前端拿到 object 渲染崩。
 */
export function extractTextContent(msg: BaseMessage | { content?: unknown } | null | undefined): string {
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "type" in c && c.type === "text" && "text" in c) {
        return String(c.text ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
