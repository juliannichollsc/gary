// GARY 🐾 — placeholder EmptyState for views built in later stages (spec 02–04). Real screens replace these.
import type { ReactNode } from "react";
import { Avatar, Button } from "../components/ui";

export function Placeholder({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="view">
      <header className="viewhead"><h1 className="viewhead__title">{title}</h1></header>
      <div className="empty">
        <Avatar kind="paw" size={64} />
        <div className="empty__title">{title}</div>
        <div className="empty__body">{subtitle}</div>
        {action ?? <Button variant="primary">Próximamente</Button>}
      </div>
    </div>
  );
}
