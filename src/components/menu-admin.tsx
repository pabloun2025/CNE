"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ENLACES_ADMIN, ETIQUETA_ROL, INICIO_DE_ROL, type RolAdmin } from "@/domain/roles";
import { salirAdmin } from "@/server/acceso-actions";
import { MarcaEstado, Tricolor } from "./marca";

// Las hijas de Finanzas se eligen en pestañas, no como otra sección del menú.
const EN_PESTANA = new Set(["/admin/finanzas/pagar", "/admin/finanzas/caja"]);

const GRUPOS: { id: string; etiqueta: string; hrefs: string[] }[] = [
  { id: "preparacion", etiqueta: "Preparación", hrefs: ["/admin/mjrv", "/admin/credenciales", "/admin/revocar", "/admin/operadores"] },
  { id: "jornada", etiqueta: "Jornada", hrefs: ["/admin/documentos", "/admin/finanzas", "/admin/mando"] },
  { id: "cierre", etiqueta: "Cierre", hrefs: ["/admin/informes"] },
];

const ICONO: Record<string, ReactNode> = {
  "/admin": <Icono d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />,
  "/admin/mjrv": <Icono d="M8 7h8M8 12h8M8 17h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />,
  "/admin/credenciales": <Icono d="M3 7h18v10H3zM7 12h4" />,
  "/admin/revocar": <Icono d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8 8l8 8" />,
  "/admin/operadores": <Icono d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 19c.5-3 2.6-4.5 5-4.5S12.5 16 13 19M14 14.6c1.6-.2 3.2.4 4 1.6.6 1 1 1.8 1.2 2.8" />,
  "/admin/documentos": <Icono d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5" />,
  "/admin/finanzas": <Icono d="M4 7h16v10H4zM4 11h16M8 15h3" />,
  "/admin/mando": <Icono d="M4 5h7v7H4zM13 5h7v4h-7zM13 12h7v7h-7zM4 15h7v4H4z" />,
  "/admin/informes": <Icono d="M5 19V9M12 19V5M19 19v-7" />,
};

function Icono({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letras = partes.map((p) => p[0] ?? "").join("").toUpperCase();
  return letras || "·";
}

function activo(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}

// Armazón del personal, como el de DEMP: lista agrupada en escritorio y accesos en el móvil.
// El rol sigue decidiendo qué enlaces existen; el servidor vuelve a comprobar cada pantalla.
export function CascaronAdmin({ nombre, rol, children }: { nombre: string; rol: RolAdmin; children: ReactNode }) {
  const path = usePathname();
  const visibles = ENLACES_ADMIN.filter((e) => e.roles.includes(rol) && !EN_PESTANA.has(e.href));
  const porHref = new Map(visibles.map((e) => [e.href, e]));
  const inicio = porHref.get("/admin");
  const grupos = GRUPOS.map((g) => ({ ...g, enlaces: g.hrefs.flatMap((href) => { const e = porHref.get(href); return e ? [e] : []; }) })).filter((g) => g.enlaces.length > 0);
  const tiles = [...(inicio ? [inicio] : []), ...grupos.flatMap((g) => g.enlaces)];
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    const leer = () => setEnLinea(navigator.onLine);
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => { window.removeEventListener("online", leer); window.removeEventListener("offline", leer); };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const cerrar = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        setMenu(false);
        avatarRef.current?.focus();
      } else if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", cerrar);
    return () => { window.removeEventListener("mousedown", cerrar); window.removeEventListener("keydown", cerrar); };
  }, [menu]);

  const enlace = (href: string, texto: string, escritorio: boolean) => (
    <Link key={href} href={href} className="nav-link" aria-current={activo(path, href) ? "page" : undefined}>
      {ICONO[href]}
      <span className={escritorio ? "nav-label" : "nav-short"}>{texto}</span>
    </Link>
  );

  return (
    <div className="funcionario shell">
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="mbar">
        <Tricolor />
        <div className="mbar-row">
          <Link className="mbar-brand" href={inicio?.href ?? INICIO_DE_ROL[rol]} aria-label="CNE 2026. Ir al inicio">
            <MarcaEstado size={30} />
            <span className="mbar-name"><small>CNE 2026</small><span>Madrid</span></span>
          </Link>
          <span className={enLinea ? "dot" : "dot off"} role="img" aria-label={enLinea ? "Conectado" : "Sin conexión"} />
          <div className="mbar-person" ref={menuRef}>
            <button ref={avatarRef} type="button" className="avatar" aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu((abierto) => !abierto)}>
              <span aria-hidden="true">{iniciales(nombre)}</span><span className="sr-only">Menú de {nombre}</span>
            </button>
            {menu && (
              <div className="mbar-menu" id={menuId}>
                <p><strong>{nombre}</strong><small>{ETIQUETA_ROL[rol]}</small></p>
                <form action={salirAdmin}><button className="secondary" type="submit">Salir</button></form>
              </div>
            )}
          </div>
        </div>
      </header>
      <aside className="side">
        <Tricolor />
        <div className="side-brand">
          <MarcaEstado size={40} />
          <span>
            <span className="eyebrow">CNE 2026</span>
            <span className="side-office">Madrid</span>
          </span>
        </div>
        <nav aria-label="Secciones" className="side-nav desk-nav">
          {inicio && <div className="nav-list">{enlace(inicio.href, inicio.texto, true)}</div>}
          {grupos.map((g) => (
            <div key={g.id} className="nav-list" role="group" aria-labelledby={`nav-${g.id}`}>
              <span id={`nav-${g.id}`} className="nav-group">{g.etiqueta}</span>
              {g.enlaces.map((e) => enlace(e.href, e.texto, true))}
            </div>
          ))}
        </nav>
        <nav aria-label="Secciones" className="side-nav mob-nav">
          <div className="nav-main" style={{ ["--cols" as string]: String(Math.max(1, Math.min(4, tiles.length))) }}>
            {tiles.map((e) => enlace(e.href, e.texto, false))}
          </div>
        </nav>
        <div className="side-spacer" />
        <div className="side-person">
          <span className="avatar" aria-hidden="true">{iniciales(nombre)}</span>
          <span className="side-person-text"><strong>{nombre}</strong><small>{ETIQUETA_ROL[rol]}</small></span>
          <form action={salirAdmin}><button className="quiet" type="submit">Salir</button></form>
        </div>
      </aside>
      <div className="content">
        <div id="contenido" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
