import { EventHead } from "./EventHead";
import { MustacheIcon } from "./icons";

export default function HomePage() {
  return (
    <main className="frame">
      <div className="card">
        <div className="logo">
          <MustacheIcon />
        </div>
        <EventHead />
        <h1>The Nick Jacobi Memorial Golf Tournament</h1>
        <p className="lede">Check your invite email for your personal RSVP link.</p>
      </div>
    </main>
  );
}
