import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Helpdesk — Fin",
  description:
    "Conversational IT support agent — LangChain.js + Next.js, Intercom design system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning on <body>: 浏览器扩展 (iMean / Backpack / Grammarly 等) 在 client
          注入 div / hidden 属性，触发 React 19 + Next.js 16 严格 hydration 警告。
          这是 Next.js 官方推荐处理浏览器扩展污染的方式。仅 suppress body 一层，下层组件的真 bug 仍报错。 */}
      <body
        className="min-h-full flex flex-col bg-canvas text-ink"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
