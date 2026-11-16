import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import { langScript, themeScript } from "@/lib/headScripts";
import "./globals.css";

export const metadata: Metadata = {
  title: "تخته",
  description: "همه کارها روی یک تخته؛ مدیریت ساده پروژه به سبک کانبان، با دستیار هوش مصنوعی.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets class="dark" before React loads, so the server markup differs on purpose.
    <html lang="fa" dir="rtl" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + langScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
