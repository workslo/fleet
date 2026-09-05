import type { Evidence } from "../api";

/**
 * Evidence kind inferred from the URI. This is the core value-add over the
 * flat list: each evidence link gets a type badge so you can scan the panel
 * and understand the evidence story at a glance.
 *
 * The panel never fetches or copies review bodies — it only makes the
 * existing `Evidence[]` pointers more legible.
 */
type EvidenceKind =
  | "pull-request"
  | "issue"
  | "commit"
  | "repository"
  | "linear"
  | "link";

interface ClassifiedEvidence extends Evidence {
  kind: EvidenceKind;
  badge: string;
}

const KIND_LABELS: Record<EvidenceKind, string> = {
  "pull-request": "Pull Request",
  "issue": "Issue",
  "commit": "Commit",
  "repository": "Repository",
  "linear": "Linear",
  "link": "Link",
};

/** Display order — code evidence first, then process, then untyped. */
const KIND_ORDER: EvidenceKind[] = [
  "pull-request",
  "issue",
  "commit",
  "repository",
  "linear",
  "link",
];

function classify(evidence: Evidence): ClassifiedEvidence {
  const { uri } = evidence;

  const prMatch = uri.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (prMatch) {
    return { ...evidence, kind: "pull-request", badge: `PR #${prMatch[1]}` };
  }

  const issueMatch = uri.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
  if (issueMatch) {
    return { ...evidence, kind: "issue", badge: `Issue #${issueMatch[1]}` };
  }

  if (/github\.com\/[^/]+\/[^/]+\/commit\//.test(uri)) {
    return { ...evidence, kind: "commit", badge: "Commit" };
  }

  if (/github\.com\/[^/]+\/[^/]+\/?$/.test(uri)) {
    return { ...evidence, kind: "repository", badge: "Repository" };
  }

  if (/linear\.app\//.test(uri)) {
    return { ...evidence, kind: "linear", badge: "Linear" };
  }

  return { ...evidence, kind: "link", badge: "Link" };
}

function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 0) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function ProjectEvidencePanel({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">Evidence</h2>
        <p>No evidence links have been recorded.</p>
      </section>
    );
  }

  const classified = evidence.map(classify);

  const groups = new Map<EvidenceKind, ClassifiedEvidence[]>();
  for (const item of classified) {
    const bucket = groups.get(item.kind) ?? [];
    bucket.push(item);
    groups.set(item.kind, bucket);
  }

  for (const items of groups.values()) {
    items.sort((a, b) => {
      if (!a.created_at && !b.created_at) return 0;
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return (
    <section aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      {KIND_ORDER.filter((kind) => groups.has(kind)).map((kind) => {
        const items = groups.get(kind)!;
        return (
          <div key={kind} className="evidence-group">
            <h3>{KIND_LABELS[kind]} ({items.length})</h3>
            <ul>
              {items.map((item, index) => (
                <li key={`${item.uri}-${item.summary}-${index}`}>
                  <span className="evidence-badge" data-evidence-kind={item.kind}>{item.badge}</span>{" "}
                  <a href={item.uri}>{item.summary}</a>
                  {item.created_at ? (
                    <time dateTime={item.created_at}> · {formatRelative(item.created_at)}</time>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
