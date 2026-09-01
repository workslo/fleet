import type { Decision } from "../api";

export function DecisionsView({ decisions }: { decisions: Decision[] }) {
  return (
    <section aria-labelledby="decisions-heading">
      <h1 id="decisions-heading">Shane Decisions</h1>
      {decisions.length === 0 ? <p>No decisions need Shane’s attention.</p> : (
        <ul className="card-list">
          {decisions.map((decision) => <li key={decision.id}><h2>{decision.question}</h2><p>State: {decision.state}</p><p>Project: {decision.project_id}</p></li>)}
        </ul>
      )}
    </section>
  );
}
