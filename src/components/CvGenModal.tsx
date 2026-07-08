// GARY 🐾 — modal de carga para la regeneración del CV especializado de una oferta. Mismo lenguaje que
// el preflight de búsqueda, pero con la copy de generación de CV. Auto-cierra a los ~3s (stub hasta que
// el engine `generate-pdf` emita eventos reales, spec 07). Honra prefers-reduced-motion en el CSS.
import { useEffect, useRef } from "react";
import { Loader } from "../icons";
import { Avatar } from "./ui";

export function CvGenModal({ title, subtitle, onDone }: { title: string; subtitle?: string; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current(), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="genmodal" role="status" aria-live="polite">
      <div className="genmodal__card">
        <Avatar kind="brand" size={56} />
        <div className="genmodal__head">
          <Loader width={16} height={16} />
          <span>{title}</span>
        </div>
        {subtitle && <p className="genmodal__sub">{subtitle}</p>}
      </div>
    </div>
  );
}
