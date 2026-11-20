// GARY 🐾 — global states (spec 06, components.md §H). Every screen uses these instead of ad-hoc blocks so
// empty / loading / error read the same everywhere (offline/CDP state lives in the Chat status bar). Rules: an empty screen invites the next
// action; an error says what happened and offers a way out (never a dead end); status is never color-only.
import { Avatar, Button } from "./ui";
import { AlertTriangle, RotateCcw } from "../icons";
import { useT } from "../i18n";

export function EmptyState({ title, body, action }: {
  title: string; body: string; action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <Avatar kind="brand" size={64} />
      <div className="empty__title">{title}</div>
      <div className="empty__body">{body}</div>
      {action && <Button variant="primary" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="empty errorstate" role="alert">
      <span className="errorstate__icon" aria-hidden><AlertTriangle width={26} height={26} /></span>
      <div className="empty__title">{title}</div>
      {detail && <code className="errorstate__detail">{detail}</code>}
      {onRetry && (
        <Button variant="secondary" iconLeft={<RotateCcw width={15} height={15} />} onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

// Skeleton rows for list/table loads (>300ms). Purely decorative → aria-hidden; the region announces busy.
export function SkeletonRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row" aria-hidden>
          <span className="skeleton__bar skeleton__bar--lg" />
          <span className="skeleton__bar skeleton__bar--sm" />
          <span className="skeleton__bar skeleton__bar--sm" />
          <span className="skeleton__bar skeleton__bar--md" />
        </div>
      ))}
    </div>
  );
}
