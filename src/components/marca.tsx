"use client";

import { useId, type ReactNode } from "react";

// Marca tomada de DEMP: la franja va en las proporciones de la bandera (2:1:1)
// y el trazo hereda el color del texto. Aquí identifica al CNE, no al pasaporte.
export function MarcaEstado({ size = 44 }: { size?: number }) {
  const clip = useId().replace(/:/g, "");
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none">
      <defs><clipPath id={clip}><rect x="9" y="4" width="30" height="40" rx="5" /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="9" y="4" width="15" height="7" fill="#f2b705" />
        <rect x="24" y="4" width="7.5" height="7" fill="#0a3d8f" />
        <rect x="31.5" y="4" width="7.5" height="7" fill="#c8102e" />
      </g>
      <rect x="10.5" y="5.5" width="27" height="37" rx="3.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="24" cy="25" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M17 25h14M24 18c-2.6 2-2.6 12 0 14M24 18c2.6 2 2.6 12 0 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="17" y="35.5" width="14" height="2.6" rx="1.3" fill="currentColor" />
    </svg>
  );
}

export function Tricolor() {
  return <div className="tricolor" aria-hidden="true"><span /><span /><span /></div>;
}

export function Masthead({ titulo, detalle, acciones }: { titulo: string; detalle?: string; acciones?: ReactNode }) {
  return (
    <header className="mast">
      <Tricolor />
      <div className="masthead">
        <div className="identity">
          <MarcaEstado size={40} />
          <div>
            <p className="eyebrow">República del Ecuador</p>
            <p className="service">{titulo}</p>
            {detalle && <small>{detalle}</small>}
          </div>
        </div>
        {acciones && <div className="actions">{acciones}</div>}
      </div>
    </header>
  );
}
