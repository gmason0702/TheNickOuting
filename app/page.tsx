import { EventRows, Logo } from "./EventHead";

export default function HomePage() {
  return (
    <main className="frame">
      <div className="card">
        <Logo />
        <h1>6th Annual Nick Jacobi Memorial</h1>
        <EventRows />
        <p className="lede">Check your invite email for your personal RSVP link.</p>
      </div>
    </main>
  );
}
