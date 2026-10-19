"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

/**
 * "More actions" disclosure menu. Native <details> keeps it keyboard operable;
 * Escape and outside clicks close it and return focus to the trigger.
 */
export function MoreMenu({ label = "More actions", children, iconOnly = false }: { label?: string; children: ReactNode; iconOnly?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const menu = ref.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  return (
    <details
      ref={ref}
      className="menu"
      onKeyDown={event => {
        if (event.key !== "Escape" || !ref.current?.open) return;
        event.preventDefault();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }}
      onClick={event => {
        // Close after choosing a link inside the panel.
        if (event.target instanceof HTMLElement && event.target.closest(".menu-panel a") && ref.current) ref.current.open = false;
      }}
    >
      <summary className={`button button-secondary${iconOnly ? " button-icon" : ""}`} aria-label={iconOnly ? label : undefined}>
        {iconOnly ? <Icon name="more" size={18} /> : <>{label}<Icon name="chevron-down" size={16} /></>}
      </summary>
      <div className="menu-panel">{children}</div>
    </details>
  );
}
