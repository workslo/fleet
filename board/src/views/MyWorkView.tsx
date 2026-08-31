import type { AgentWorkSnapshot } from "../api";

function Empty({ children }: { children: string }) {
  return <p>{children}</p>;
}

export function MyWorkView({ work }: { work: AgentWorkSnapshot }) {
  return (
    <section aria-labelledby="my-work-heading">
      <h1 id="my-work-heading">My Work</h1>
      <section aria-labelledby="obligations-heading">
        <h2 id="obligations-heading">Obligations</h2>
        {work.obligations.length === 0 ? <Empty>No obligations are owed now.</Empty> : <ul>{work.obligations.map((item) => <li key={`${item.source}-${item.request_id ?? item.project_id}`}><strong>{item.title ?? item.source}</strong>{item.detail ? `: ${item.detail}` : ""}</li>)}</ul>}
      </section>
      <RequestList heading="Outbound requests" requests={work.outbound_requests} empty="No outbound requests have been made." />
      <RequestList heading="Inbound requests" requests={work.inbound_requests} empty="No inbound requests need attention." />
      <PullCandidateList candidates={work.pull_candidates} />
    </section>
  );
}

function RequestList({ heading, requests, empty }: { heading: string; requests: AgentWorkSnapshot["outbound_requests"]; empty: string }) {
  return (
    <section aria-labelledby={`${heading}-heading`}>
      <h2 id={`${heading}-heading`}>{heading}</h2>
      {requests.length === 0 ? <Empty>{empty}</Empty> : <ul>{requests.map((request) => <li key={request.id}><strong>{request.title}</strong> ({request.state}): {request.detail}</li>)}</ul>}
    </section>
  );
}

export function PullCandidateList({ candidates }: { candidates: AgentWorkSnapshot["pull_candidates"] }) {
  return (
    <section aria-labelledby="pull-candidates-heading">
      <h2 id="pull-candidates-heading">Pull Candidates</h2>
      {candidates.length === 0 ? <Empty>No Pull Candidates have been published. Published Pulls remain voluntary and create no obligation.</Empty> : <ul>{candidates.map((candidate) => <li key={candidate.id}><strong>{candidate.title}</strong>: {candidate.detail}</li>)}</ul>}
    </section>
  );
}
