import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trac - 校园生活记录',
  description: '记录校园生活事件、切换时间线，并查看习惯与待办统计。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
