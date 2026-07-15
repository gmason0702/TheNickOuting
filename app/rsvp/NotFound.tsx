import { MustacheIcon } from "@/app/icons";

export function NotFound() {
  return (
    <main className="frame">
      <div className="card">
        <div className="logo">
          <MustacheIcon />
        </div>
        <h1>Page not found</h1>
        <p className="lede">This link isn&apos;t valid. Double-check the link from your invite email.</p>
      </div>
    </main>
  );
}
