import type { Metadata } from 'next';
import '../../styles/globals.css';

export const metadata: Metadata = {
  title: 'Multimodal Agent QA',
  description: '多模态 AI Agent 问答系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
