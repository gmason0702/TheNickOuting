import { EventHead } from "./EventHead";

export default function HomePage() {
  return (
    <main className="frame">
      <div className="card">
        <EventHead />
        <h1>The Nick Jacobi Memorial Golf Tournament</h1>
        <p className="lede">Check your invite email for your personal RSVP link.</p>
      </div>
    </main>
  );
}
