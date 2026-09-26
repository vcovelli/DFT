import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Done For Teachers | Your lessons. Done.",
  description:
    "Teacher-created educational materials that give teachers their time back.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {process.env.SHOW_DEMO_BANNER !== "false" && (
          <div className="demo-banner" role="status">
            DEMO / STAGING — Test environment. Do not submit real orders or
            payment details.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
