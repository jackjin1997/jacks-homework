import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fix: LangChain `initChatModel` uses dynamic `import(\`@langchain/${provider}\`)`
  // which Turbopack can't statically analyze ("Cannot find module as expression is too dynamic"
  // → MODULE_NOT_FOUND at runtime). Mark these as server-external so they resolve via Node's
  // runtime require() instead of being bundled. Vitest doesn't hit this because it runs ESM
  // directly without Turbopack's static bundling.
  serverExternalPackages: [
    "langchain",
    "@langchain/core",
    "@langchain/langgraph",
    "@langchain/google-genai",
    "@langchain/anthropic",
    "@langchain/openai",
    "@langchain/mcp-adapters",
  ],
};

export default nextConfig;
