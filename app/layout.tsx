import type { Metadata } from "next";
import "./globals.css";

import { TistoryPublishingOverlays } from "./user-flow/TistoryPublishingOverlays";
import { WordPressDraftOverlay } from "./user-flow/WordPressDraftOverlay";

export const metadata: Metadata = {
  title: "Bright Studio",
  description: "AI 콘텐츠 자동화 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="system" lang="ko">
      <body>
        {children}
        <TistoryPublishingOverlays />
        <WordPressDraftOverlay />
      </body>
    </html>
  );
}
