import { NeedsShaneOutcomes } from "./DecisionsView";
import { useState, type FormEvent, type ReactNode } from "react";
import { FleetApiError, type AgentWorkSnapshot, type Evidence, type WorkRequest, type RequestTransition, type EndRequestInput, type ReturnRequestInput, type BlockRequestInput, type UnblockRequestInput } from "../api";

type CreateInput = { recipient_id: string; title: string; detail: string; artifact?: Evidence; expires_at?: string | null };
type TransitionInput = EndRequestInput | ReturnRequestInput | BlockRequestInput | UnblockRequestInput | Record<string, never>;
type Props = {
  work: AgentWorkSnapshot;
  actorId: string;
  requestDetails: Record<string, WorkRequest>;
  busy: boolean;
  onCreate: (input: CreateInput, key: string) => Promise<boolean>;
  onAccept: (request: WorkRequest, key: string) => Promise<boolean>;
  onFulfill: (request: WorkRequest, evidence: Evidence[], key: string) => Promise<boolean>;
  onTransition: (request: WorkRequest, transition: RequestTransition, input: TransitionInput, key: string) => Promise<boolean>;
  onView: (request: WorkRequest) => Promise<unknown>;
};

function RequestMutationForm({ label, busy, children, prepare }: {
  label: string; busy: boolean; children?: ReactNode; prepare: (data: FormData, key: string) => () => Promise<boolean>;
}) {
  const [attempt, setAttempt] = useState<(() => Promise<boolean>) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    try {
      const action = attempt ?? prepare(new FormData(form), crypto.randomUUID());
      setAttempt(() => action);
      if (await action()) { setAttempt(null); form.reset(); }
    } catch (caught) {
      const definite = caught instanceof FleetApiError && caught.status >= 400 && caught.status < 500;
      if (definite) setAttempt(null);
      // The parent keeps conflict guidance visible even if this form disappears.
      if (!(caught instanceof FleetApiError && caught.reportedGlobally)) setError(caught instanceof Error ? caught.message : "The action could not be confirmed.");
    }
  };
  return <form aria-label={label} onSubmit={(event) => void submit(event)}>
    {children ? <fieldset disabled={busy || attempt !== null}>{children}</fieldset> : null}
    {error ? <p role="alert">{error}</p> : null}
    {attempt && !busy ? <p>The outcome is unconfirmed. Use this action again to retry the original submission.</p> : null}
    <button type="submit" disabled={busy}>{label}</button>
  </form>;
}

export function MyWorkView(props: Props) {
  const { work, busy, onCreate } = props;
  return <section aria-labelledby="my-work-heading">
    <h1 id="my-work-heading">My Work</h1>
    <StandaloneReviewForm busy={busy} onCreate={onCreate} />
    <section aria-labelledby="obligations-heading">
      <h2 id="obligations-heading">Obligations</h2>
      {work.obligations.length === 0 ? <p>No obligations are owed now.</p> : <ul>{work.obligations.map((item) => <li key={`${item.source}-${item.request_id ?? item.project_id}`}><strong>{item.title ?? item.source}</strong>{item.detail ? `: ${item.detail}` : ""}</li>)}</ul>}
    </section>
    <RequestList {...props} heading="Outbound requests" requests={work.outbound_requests} inbound={false} empty="No outbound requests have been made." />
    <RequestList {...props} heading="Inbound requests" requests={work.inbound_requests} inbound empty="No inbound requests need attention." />
    {work.needs_shane?.length ? <section aria-label="Related Needs Shane records"><h2>Related Needs Shane records</h2><NeedsShaneOutcomes entries={work.needs_shane} /></section> : null}
    <PullCandidateList candidates={work.pull_candidates} headingId="work-pull-candidates-heading" />
  </section>;
}

function StandaloneReviewForm({ busy, onCreate }: Pick<Props, "busy" | "onCreate">) {
  return <section aria-labelledby="standalone-review-heading">
    <h2 id="standalone-review-heading">Request a standalone review</h2>
    <p>Share a bounded artifact link without creating a Fleet Project. Pending requests create no obligation.</p>
    <RequestMutationForm label="Send standalone review" busy={busy} prepare={(data, key) => {
      const artifactUri = String(data.get("artifact_uri") ?? "").trim();
      const artifactSummary = String(data.get("artifact_summary") ?? "").trim();
      const deadline = String(data.get("expires_at") ?? "").trim();
      const input: CreateInput = {
        recipient_id: String(data.get("recipient_id") ?? ""), title: String(data.get("title") ?? ""), detail: String(data.get("detail") ?? ""),
        ...(artifactUri === "" && artifactSummary === "" ? {} : { artifact: { uri: artifactUri, summary: artifactSummary } }),
        ...(deadline ? { expires_at: new Date(deadline).toISOString() } : {}),
      };
      return () => onCreate(input, key);
    }}>
      <label>Recipient ID<input name="recipient_id" required /></label>
      <label>Review title<input name="title" required /></label>
      <label>Review scope<textarea name="detail" required /></label>
      <label>Artifact URL<input name="artifact_uri" type="url" /></label>
      <label>Artifact summary<input name="artifact_summary" /></label>
      <label>Accept before (optional, your local time)<input name="expires_at" type="datetime-local" max="9999-12-31T23:59" /></label>
      <p>This is an invitation deadline. It never expires an accepted obligation.</p>
    </RequestMutationForm>
  </section>;
}

function RequestList(props: Props & { heading: string; requests: WorkRequest[]; inbound: boolean; empty: string }) {
  const { heading, requests, requestDetails, empty, busy, onView } = props;
  return <section aria-labelledby={`${heading}-heading`}>
    <h2 id={`${heading}-heading`}>{heading}</h2>
    {requests.length === 0 ? <p>{empty}</p> : <ul>{requests.map((request) => {
      const cached = requestDetails[request.id];
      // expiry_due is time-sensitive even without a version change; the new snapshot owns it.
      const current = cached && cached.version >= request.version ? { ...cached, ...(cached.version === request.version && request.expiry_due !== undefined ? { expiry_due: Boolean(cached.expiry_due || request.expiry_due) } : {}) } : request;
      return <li key={request.id}>
        <strong>{current.title}</strong> ({current.state}): {current.detail}
        <p>{current.project_id === null ? "Standalone review" : `Fleet Project ${current.project_id}`}</p>
        {current.artifact ? <p>Artifact: <a href={current.artifact.uri}>{current.artifact.summary}</a></p> : null}
        {current.accepted_scope ? <p>Accepted scope: {current.accepted_scope.detail}</p> : null}
        {current.expires_at ? <p>Invitation acceptance deadline: <time dateTime={current.expires_at}>{current.expires_at}</time>. Accepted work does not expire.</p> : null}
        {current.expiry_due && current.state === "Pending" ? <p>The invitation deadline has passed. Acceptance is unavailable; record its expiry to close the pending request.</p> : null}
        {current.blocker ? <div><p>Blocked: {current.blocker.reason}</p><p>Unblocks when: {current.blocker.resolution_condition}</p><p>Recorded by {current.blocker.actor.id} at {current.blocker.at}. The accepted obligation remains owed.</p></div> : null}
        {current.resolution ? <div><p>{current.resolution.state} recorded by {current.resolution.actor.id} at {current.resolution.at}.</p>{current.resolution.reason ? <p>Reason: {current.resolution.reason}</p> : null}{current.resolution.unfinished_work ? <p>Unfinished work: {current.resolution.unfinished_work}</p> : null}</div> : null}
        {current.evidence?.length ? <ul>{current.evidence.map((entry) => <li key={`${entry.uri}-${entry.summary}`}><a href={entry.uri}>{entry.summary}</a></li>)}</ul> : null}
        {current.resolution?.evidence.filter((entry) => !current.evidence?.some((known) => known.uri === entry.uri && known.summary === entry.summary)).map((entry) => <p key={`${entry.uri}-${entry.summary}`}><a href={entry.uri}>{entry.summary}</a></p>)}
        {current.needs_shane?.length ? <NeedsShaneOutcomes entries={current.needs_shane} /> : null}
        <button type="button" disabled={busy} onClick={() => void onView(current)}>View {current.title}</button>
        <RequestActions {...props} request={current} />
      </li>;
    })}</ul>}
  </section>;
}

function ReturnEvidenceFields({ title }: { title: string }) {
  const validatePair = (event: FormEvent<HTMLInputElement>) => {
    const fields = event.currentTarget.form?.elements;
    const uri = fields?.namedItem("return_evidence_uri");
    const summary = fields?.namedItem("return_evidence_summary");
    if (!(uri instanceof HTMLInputElement) || !(summary instanceof HTMLInputElement)) return;
    const supplied = Boolean(uri.value.trim() || summary.value.trim());
    uri.required = supplied;
    summary.required = supplied;
    uri.setCustomValidity(supplied && !uri.value.trim() ? "Add a URL for this evidence." : "");
    summary.setCustomValidity(supplied && !summary.value.trim() ? "Describe what this evidence supports." : "");
  };
  return <><label>Return evidence URL for {title}<input name="return_evidence_uri" type="url" onInput={validatePair} /></label><label>Return evidence summary for {title}<input name="return_evidence_summary" onInput={validatePair} /></label></>;
}

function RequestActions({ request, actorId, inbound, busy, onAccept, onFulfill, onTransition }: Props & { request: WorkRequest; inbound: boolean }) {
  const recipient = inbound && request.recipient.id === actorId;
  const requester = !inbound && request.requester.id === actorId;
  const pending = request.state === "Pending";
  const accepted = request.state === "Accepted";
  const act = (label: string, transition: RequestTransition, fields: ReactNode, input: (data: FormData) => TransitionInput) => <details key={transition}><summary>{label}</summary><RequestMutationForm label={label} busy={busy} prepare={(data, key) => {
    const frozen = { ...request };
    const body = input(data);
    return () => onTransition(frozen, transition, body, key);
  }}>{fields}</RequestMutationForm></details>;
  return <div className="request-actions">
    {recipient && pending && !request.expiry_due ? <RequestMutationForm label={`Accept ${request.title}`} busy={busy} prepare={(_data, key) => { const frozen = { ...request }; return () => onAccept(frozen, key); }} /> : null}
    {pending && request.expiry_due && (recipient || requester) ? <RequestMutationForm label={`Record expiry for ${request.title}`} busy={busy} prepare={(_data, key) => { const frozen = { ...request }; return () => onTransition(frozen, "expire", {}, key); }} /> : null}
    {recipient && pending && !request.expiry_due ? act(`Decline ${request.title}`, "decline", <label>Decline reason for {request.title}<textarea name="reason" required /></label>, (data) => ({ reason: String(data.get("reason")) })) : null}
    {requester && pending && !request.expiry_due ? act(`Withdraw ${request.title}`, "withdraw", <label>Withdrawal reason for {request.title}<textarea name="reason" required /></label>, (data) => ({ reason: String(data.get("reason")) })) : null}
    {recipient && accepted ? <>
      <RequestMutationForm label={`Fulfill ${request.title}`} busy={busy} prepare={(data, key) => {
        const frozen = { ...request };
        const evidence = [{ uri: String(data.get("evidence_uri")), summary: String(data.get("evidence_summary")) }];
        return () => onFulfill(frozen, evidence, key);
      }}><label>Evidence URL for {request.title}<input name="evidence_uri" type="url" required /></label><label>Evidence summary for {request.title}<input name="evidence_summary" required /></label></RequestMutationForm>
      {act(`Return ${request.title}`, "return", <><label>Return reason for {request.title}<textarea name="reason" required /></label><label>Unfinished work for {request.title}<textarea name="unfinished_work" required /></label><ReturnEvidenceFields title={request.title} /></>, (data) => {
        const uri = String(data.get("return_evidence_uri") ?? "").trim();
        const summary = String(data.get("return_evidence_summary") ?? "").trim();
        return { reason: String(data.get("reason")), unfinished_work: String(data.get("unfinished_work")), ...(uri || summary ? { evidence: [{ uri, summary }] } : {}) };
      })}
      {request.blocker ? act(`Clear blocker for ${request.title}`, "unblock", <label>Unblocking summary for {request.title}<textarea name="summary" required /></label>, (data) => ({ summary: String(data.get("summary")) }))
        : act(`Record blocker for ${request.title}`, "block", <><label>Blocker reason for {request.title}<textarea name="reason" required /></label><label>Unblocking condition for {request.title}<textarea name="resolution_condition" required /></label></>, (data) => ({ reason: String(data.get("reason")), resolution_condition: String(data.get("resolution_condition")) }))}
    </> : null}
  </div>;
}

export function PullCandidateList({ candidates, headingId = "pull-candidates-heading" }: { candidates: AgentWorkSnapshot["pull_candidates"]; headingId?: string }) {
  return <section aria-labelledby={headingId}><h2 id={headingId}>Pull Candidates</h2>
    {candidates.length === 0 ? <p>No Pull Candidates have been published. Published Pulls remain voluntary and create no obligation.</p> : <ul>{candidates.map((candidate) => <li key={candidate.id}><strong>{candidate.title}</strong>: {candidate.detail}</li>)}</ul>}
  </section>;
}
