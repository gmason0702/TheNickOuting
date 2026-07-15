import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "The Nick Jacobi Memorial Golf Tournament",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
