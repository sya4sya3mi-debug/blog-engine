import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "BlogEngine v3",
  description: "Auto Affiliate Blog System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; overflow-x: hidden; }
          input, select, textarea, button { font-size: 16px !important; }
          @media (max-width: 768px) {
            .desktop-sidebar { display: none !important; }
          }
          @media (min-width: 769px) {
            .desktop-sidebar { display: flex !important; }
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
