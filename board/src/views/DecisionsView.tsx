import { useState, type FormEvent, type ReactNode } from "react";
import { FleetApiError, type Decision, type CreateNeedsShane, type RecordDecision, type CompleteAction, type DelegateAction } from "../api";

type Props = {
  decisions: Decision[];
  actorId: string;
  onHistory: () => Promise<void>;
  onCreate: (input: CreateNeedsShane, key: string) => Promise<void>;
  onDecide: (id: string, version: number, input: RecordDecision, key: string) => Promise<void>;
  onComplete: (id: string, version: number, input: CompleteAction, key: string) => Promise<void>;
  onDelegate: (id: string, version: number, input: DelegateAction, key: string) => Promise<void>;
};

// An uncertain response keeps the exact submitted payload, version, and key.
function MutationForm({ label, children, prepare }: {
  label: string;
  children: ReactNode;
  prepare: (data: FormData, key: string) => () => Promise<void>;
}) {
  const [attempt, setAttempt] = useState<(() => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const action = attempt ?? prepare(new FormData(form), crypto.randomUUID());
    setAttempt(() => action);
    setBusy(true);
    setError(null);
    try {
      await action();
      setAttempt(null);
      form.reset();
    } catch (caught) {
      const definiteRejection = caught instanceof FleetApiError && caught.status >= 400 && caught.status < 500;
      if (definiteRejection) setAttempt(null);
      setError(caught instanceof Error ? caught.message : "The action could not be confirmed.");
    } finally {
      setBusy(false);
    }
  };
  return <form aria-label={label} onSubmit={(event) => void submit(event)}>
    <fieldset disabled={busy || attempt !== null}>{children}</fieldset>
    {error ? <p role="alert">{error}</p> : null}
    {attempt && !busy ? <p>The outcome is unconfirmed. Retry the submitted action before making changes.</p> : null}
    <button type="submit" disabled={busy}>{attempt && !busy ? `Retry ${label}` : label}</button>
  </form>;
}

function evidence(data: FormData) {
  const uri = String(data.get("evidence_uri") ?? "").trim();
  const summary = String(data.get("evidence_summary") ?? "").trim();
  return uri || summary ? [{ uri, summary }] : [];
}

function OutcomeFields({ prefix }: { prefix: string }) {
  const validatePair = (event: FormEvent<HTMLInputElement>) => {
    const fields = event.currentTarget.form?.elements;
    const uri = fields?.namedItem("evidence_uri");
    const summary = fields?.namedItem("evidence_summary");
    if (!(uri instanceof HTMLInputElement) || !(summary instanceof HTMLInputElement)) return;
    const hasEvidence = uri.value.trim().length > 0 || summary.value.trim().length > 0;
    uri.required = hasEvidence;
    summary.required = hasEvidence;
    uri.setCustomValidity(hasEvidence && !uri.value.trim() ? "Add a URL for this evidence." : "");
    summary.setCustomValidity(hasEvidence && !summary.value.trim() ? "Describe what this evidence supports." : "");
  };
  return <>
    <label>{prefix} summary<textarea name="summary" required /></label>
    <label>{prefix} evidence URL<input name="evidence_uri" type="url" onInput={validatePair} /></label>
    <label>{prefix} evidence summary<input name="evidence_summary" onInput={validatePair} /></label>
  </>;
}

export function NeedsShaneOutcomes({ entries }: { entries: Decision[] }) {
  return <ul>{entries.map((entry) => <li key={entry.id}>
    <strong>{entry.question}</strong>: {entry.state}
    {entry.decision ? <p>Decision {entry.decision.choice} by {entry.decision.actor.id}: {entry.decision.summary}</p> : null}
    {entry.action ? <p>Action completed by {entry.action.actor.id}: {entry.action.summary}</p> : null}
  </li>)}</ul>;
}

export function DecisionsView({ decisions, actorId, onHistory, onCreate, onDecide, onComplete, onDelegate }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const refresh = async () => {
    try { await onHistory(); setReadError(null); } catch (caught) { setReadError(caught instanceof Error ? caught.message : "Needs Shane could not be refreshed."); }
  };
  const visible = decisions.filter((entry) => showHistory || entry.state === "Pending");
  return <section aria-labelledby="decisions-heading">
    <h1 id="decisions-heading">Needs Shane</h1>
    <p>Specific decisions and actions. Resolving Shane’s part leaves the original work with its owner.</p>
    <details className="needs-shane-create">
    <summary>Request Shane’s involvement</summary>
    <MutationForm label="Request Shane’s involvement" prepare={(data, key) => {
      const sourceType = String(data.get("source_type"));
      const sourceId = String(data.get("source_id")).trim();
      const input: CreateNeedsShane = {
        ...(sourceType === "project" ? { project_id: sourceId } : { work_request_id: sourceId }),
        kind: String(data.get("kind")) as CreateNeedsShane["kind"],
        question: String(data.get("question")).trim(),
        resolution_condition: String(data.get("resolution_condition")).trim(),
      };
      return () => onCreate(input, key);
    }}>
      <label>Source type<select name="source_type"><option value="request">Work Request</option><option value="project">Fleet Project</option></select></label>
      <label>Source ID<input name="source_id" required /></label>
      <label>What is needed<select name="kind"><option value="decision">Decision</option><option value="action">Action</option><option value="decision_and_action">Decision and action</option></select></label>
      <label>Specific ask<textarea name="question" required /></label>
      <label>What resolves Shane’s part<textarea name="resolution_condition" required /></label>
    </MutationForm>
    </details>
    <div className="needs-shane-controls">
    <label className="checkbox-label"><input type="checkbox" checked={showHistory} onChange={(event) => { setShowHistory(event.target.checked); if (event.target.checked) void refresh(); }} />Include resolved history</label>
    <button type="button" onClick={() => void refresh()}>Refresh Needs Shane</button>
    </div>
    {readError ? <p role="alert">{readError}</p> : null}
    {visible.length === 0 ? <p>{showHistory ? "No Needs Shane records yet." : "No decisions or actions need Shane’s attention."}</p> : <ul className="card-list">
      {visible.map((entry) => <li key={entry.id}>
        <h2>{entry.question}</h2>
        <p>State: {entry.state}. Action: {entry.action_status?.replaceAll("_", " ") ?? "not recorded"}.</p>
        <p>Resolves when: {entry.resolution_condition ?? "Not recorded in this earlier request."}</p>
        <p>{entry.work_request_id ? `Work Request: ${entry.work_request_id}` : `Fleet Project: ${entry.project_id}`}</p>
        <p>Requested by: {entry.requester?.id ?? "not recorded"}</p>
        {entry.delegation ? <p>Action delegated to {entry.delegation.delegate.id} by {entry.delegation.actor.id}: {entry.delegation.summary}</p> : null}
        {entry.decision ? <p>Decision {entry.decision.choice} by {entry.decision.actor.id} at {entry.decision.at}: {entry.decision.summary}</p> : null}
        {entry.action ? <p>Action completed by {entry.action.actor.id} at {entry.action.at}: {entry.action.summary}</p> : null}
        {[...(entry.decision?.evidence ?? []), ...(entry.action?.evidence ?? [])].map((link, index) => <p key={`${link.uri}-${index}`}><a href={link.uri}>{link.summary}</a></p>)}
        {entry.state === "Pending" && actorId === "shane" && entry.kind !== "action" && !entry.decision ? <MutationForm label={`Record decision for ${entry.question}`} prepare={(data, key) => {
          const input: RecordDecision = { choice: String(data.get("choice")) as RecordDecision["choice"], summary: String(data.get("summary")), evidence: evidence(data) };
          const { id, version } = entry;
          return () => onDecide(id, version, input, key);
        }}><label>Decision choice<select name="choice"><option value="approved">Approve</option><option value="declined">Decline</option></select></label><OutcomeFields prefix="Decision" /></MutationForm> : null}
        {entry.state === "Pending" && entry.action_status === "pending" && (actorId === "shane" || actorId === entry.delegation?.delegate.id) ? <MutationForm label={`Complete action for ${entry.question}`} prepare={(data, key) => {
          const input = { summary: String(data.get("summary")), evidence: evidence(data) };
          const { id, version } = entry;
          return () => onComplete(id, version, input, key);
        }}><OutcomeFields prefix="Action completion" /></MutationForm> : null}
        {entry.state === "Pending" && entry.action_status === "pending" && actorId === "shane" ? <MutationForm label={`Delegate action for ${entry.question}`} prepare={(data, key) => {
          const input = { delegate_id: String(data.get("delegate_id")).trim(), summary: String(data.get("summary")) };
          const { id, version } = entry;
          return () => onDelegate(id, version, input, key);
        }}><label>Delegate actor ID<input name="delegate_id" required /></label><label>Delegation scope<textarea name="summary" required /></label><p>This permits the named actor to record its action. It creates no accepted obligation.</p></MutationForm> : null}
      </li>)}
    </ul>}
  </section>;
}
