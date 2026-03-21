import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BlogEngine v2",
  description: "Auto Affiliate Blog System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
