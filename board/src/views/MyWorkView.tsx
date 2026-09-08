import { useState, type FormEvent } from "react";
import type { AgentWorkSnapshot, Evidence, WorkRequest } from "../api";

type CreateInput = {
  recipient_id: string;
  title: string;
  detail: string;
  artifact?: Evidence;
};

type Props = {
  work: AgentWorkSnapshot;
  requestDetails: Record<string, WorkRequest>;
  busy: boolean;
  onCreate: (input: CreateInput, idempotencyKey: string) => Promise<boolean>;
  onAccept: (request: WorkRequest, idempotencyKey: string) => Promise<boolean>;
  onFulfill: (request: WorkRequest, evidence: Evidence[], idempotencyKey: string) => Promise<boolean>;
  onView: (request: WorkRequest) => Promise<unknown>;
};

function Empty({ children }: { children: string }) {
  return <p>{children}</p>;
}

function useRetrySafeMutation() {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  return async (mutation: (key: string) => Promise<boolean>) => {
    const succeeded = await mutation(idempotencyKey);
    if (succeeded) setIdempotencyKey(crypto.randomUUID());
    return succeeded;
  };
}

export function MyWorkView({ work, requestDetails, busy, onCreate, onAccept, onFulfill, onView }: Props) {
  return (
    <section aria-labelledby="my-work-heading">
      <h1 id="my-work-heading">My Work</h1>
      <StandaloneReviewForm busy={busy} onCreate={onCreate} />
      <section aria-labelledby="obligations-heading">
        <h2 id="obligations-heading">Obligations</h2>
        {work.obligations.length === 0 ? <Empty>No obligations are owed now.</Empty> : <ul>{work.obligations.map((item) => <li key={`${item.source}-${item.request_id ?? item.project_id}`}><strong>{item.title ?? item.source}</strong>{item.detail ? `: ${item.detail}` : ""}</li>)}</ul>}
      </section>
      <RequestList heading="Outbound requests" requests={work.outbound_requests} requestDetails={requestDetails} empty="No outbound requests have been made." busy={busy} onView={onView} />
      <RequestList heading="Inbound requests" requests={work.inbound_requests} requestDetails={requestDetails} empty="No inbound requests need attention." busy={busy} onAccept={onAccept} onFulfill={onFulfill} onView={onView} />
      <PullCandidateList candidates={work.pull_candidates} />
    </section>
  );
}

function StandaloneReviewForm({ busy, onCreate }: { busy: boolean; onCreate: Props["onCreate"] }) {
  const runMutation = useRetrySafeMutation();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const artifactUri = String(data.get("artifact_uri") ?? "").trim();
    const artifactSummary = String(data.get("artifact_summary") ?? "").trim();
    const input = {
      recipient_id: String(data.get("recipient_id") ?? ""),
      title: String(data.get("title") ?? ""),
      detail: String(data.get("detail") ?? ""),
      ...(artifactUri === "" && artifactSummary === "" ? {} : {
        artifact: { uri: artifactUri, summary: artifactSummary },
      }),
    };
    void runMutation((key) => onCreate(input, key)).then((created) => {
      if (created) form.reset();
    });
  };

  return (
    <section aria-labelledby="standalone-review-heading">
      <h2 id="standalone-review-heading">Request a standalone review</h2>
      <p>Share a bounded artifact link without creating a Fleet Project. Pending requests create no obligation.</p>
      <form onSubmit={submit}>
        <label>Recipient ID<input name="recipient_id" required /></label>
        <label>Review title<input name="title" required /></label>
        <label>Review scope<textarea name="detail" required /></label>
        <label>Artifact URL<input name="artifact_uri" type="url" /></label>
        <label>Artifact summary<input name="artifact_summary" /></label>
        <button type="submit" disabled={busy}>Send standalone review</button>
      </form>
    </section>
  );
}

function RequestList({ heading, requests, requestDetails, empty, busy, onAccept, onFulfill, onView }: {
  heading: string;
  requests: WorkRequest[];
  requestDetails: Record<string, WorkRequest>;
  empty: string;
  busy: boolean;
  onAccept?: Props["onAccept"];
  onFulfill?: Props["onFulfill"];
  onView: Props["onView"];
}) {
  return (
    <section aria-labelledby={`${heading}-heading`}>
      <h2 id={`${heading}-heading`}>{heading}</h2>
      {requests.length === 0 ? <Empty>{empty}</Empty> : (
        <ul>{requests.map((request) => {
          const cachedRequest = requestDetails[request.id];
          const resolvedRequest = cachedRequest && cachedRequest.version >= request.version ? cachedRequest : request;
          return (
          <li key={request.id}>
            <strong>{resolvedRequest.title}</strong> ({resolvedRequest.state}): {resolvedRequest.detail}
            <p>{resolvedRequest.project_id === null ? "Standalone review" : `Fleet Project ${resolvedRequest.project_id}`}</p>
            {resolvedRequest.artifact ? <p>Artifact: <a href={resolvedRequest.artifact.uri}>{resolvedRequest.artifact.summary}</a></p> : null}
            {resolvedRequest.accepted_scope ? <p>Accepted scope: {resolvedRequest.accepted_scope.detail}</p> : null}
            {resolvedRequest.evidence?.length ? <ul>{resolvedRequest.evidence.map((entry) => <li key={`${entry.uri}-${entry.summary}`}><a href={entry.uri}>{entry.summary}</a></li>)}</ul> : null}
            <button type="button" disabled={busy} onClick={() => void onView(resolvedRequest)}>View {resolvedRequest.title}</button>
            {onAccept && resolvedRequest.state === "Pending" ? <AcceptButton request={resolvedRequest} busy={busy} onAccept={onAccept} /> : null}
            {onFulfill && resolvedRequest.state === "Accepted" ? <FulfillForm request={resolvedRequest} busy={busy} onFulfill={onFulfill} /> : null}
          </li>
        );})}</ul>
      )}
    </section>
  );
}

function AcceptButton({ request, busy, onAccept }: { request: WorkRequest; busy: boolean; onAccept: Props["onAccept"] }) {
  const runMutation = useRetrySafeMutation();
  const accept = () => {
    void runMutation((key) => onAccept(request, key));
  };
  return <button type="button" disabled={busy} onClick={accept}>Accept {request.title}</button>;
}

function FulfillForm({ request, busy, onFulfill }: { request: WorkRequest; busy: boolean; onFulfill: Props["onFulfill"] }) {
  const runMutation = useRetrySafeMutation();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const evidence = [{
      uri: String(data.get("evidence_uri") ?? ""),
      summary: String(data.get("evidence_summary") ?? ""),
    }];
    void runMutation((key) => onFulfill(request, evidence, key));
  };
  return (
    <form onSubmit={submit}>
      <label>
        Evidence URL for {request.title}
        <input name="evidence_uri" type="url" required />
      </label>
      <label>
        Evidence summary for {request.title}
        <input name="evidence_summary" required />
      </label>
      <button type="submit" disabled={busy}>Fulfill {request.title}</button>
    </form>
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
