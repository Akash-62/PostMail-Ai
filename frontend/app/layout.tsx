import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostMail AI - AI Email Generator",
  description:
    "Turn rough thoughts into ready-to-send emails with an AI-powered email assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
