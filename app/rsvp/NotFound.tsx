import Image from "next/image";

export function NotFound() {
  return (
    <main className="frame">
      <div className="card">
        <div className="logo">
          <Image src="/the-nick-logo.png" alt="The Nick" width={220} height={113} priority />
        </div>
        <h1>Page not found</h1>
        <p className="lede">This link isn&apos;t valid. Double-check the link from your invite email.</p>
      </div>
    </main>
  );
}
