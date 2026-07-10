import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "./components/SessionProviderWrapper";
import EnglishInputGuard from "./i18n/EnglishInputGuard";

export const metadata: Metadata = {
  title: "IAM Portal",
  description: "Custom IAM Management Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProviderWrapper>
          <EnglishInputGuard />
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
