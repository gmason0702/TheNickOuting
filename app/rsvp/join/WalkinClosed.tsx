import { Logo } from "@/app/EventHead";

export function WalkinClosed() {
  return (
    <main className="frame">
      <div className="card">
        <Logo />
        <h1>Walk-in registration is currently not open</h1>
        <p className="lede">
          We&apos;re not accepting new sign-ups through this link right now. Check back later, or
          reach out if you think you should have your own personal invite link instead.
        </p>
      </div>
    </main>
  );
}
