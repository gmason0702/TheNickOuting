import { EventHead } from "./EventHead";

export default function HomePage() {
  return (
    <main className="frame">
      <div className="card">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mustache.svg" alt="" width={30} height={30} />
        </div>
        <EventHead />
        <h1>The Nick Jacobi Memorial Golf Tournament</h1>
        <p className="lede">Check your invite email for your personal RSVP link.</p>
      </div>
    </main>
  );
}
