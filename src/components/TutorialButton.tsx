// GARY 🐾 — "? Tutorial" button (spec 08). Vive en el header (viewhead) de TODAS las vistas, arriba a la
// derecha. Mismo borde/estilo que los botones de Conexiones (btn btn--ghost btn--sm). Abre el tutorial guiado.
import { HelpCircle } from "../icons";
import { useT } from "../i18n";
import { useTutorial } from "../tutorial";

export function TutorialButton() {
  const t = useT();
  const { start } = useTutorial();
  return (
    <button className="btn btn--ghost btn--sm viewhead__tutorial" onClick={start}
            title={t("tut.button")} aria-label={t("tut.button")}>
      <HelpCircle width={15} height={15} />
      {t("tut.button")}
    </button>
  );
}
