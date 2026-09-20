import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Done For Teachers | Your lessons. Done.",
  description: "Teacher-created educational materials that give teachers their time back.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
