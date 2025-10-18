// src/components/Brand.tsx
import React from "react";

function BrandCmp({ size = 28, stacked = false }: { size?: number; stacked?: boolean }) {
  return (
    <div className={stacked ? "flex flex-col items-center gap-2" : "flex items-center gap-3"}>
      {/* Ícono fintech */}
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <defs>
          <linearGradient id="baciGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#007acc" />
          </linearGradient>
        </defs>
        <path d="M24 4l14 6v10c0 10-6.5 16.6-14 18-7.5-1.4-14-8-14-18V10l14-6z" fill="url(#baciGrad)"/>
        <path d="M34 18l-10 10-4-4" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      <div className={stacked ? "text-center" : ""}>
        <div className="text-[17px] sm:text-lg font-bold tracking-tight" style={{ color: "var(--baci-ink)" }}>
          Arrendamientos <span style={{ color: "var(--baci-blue)" }}>BACI</span>
        </div>
        <div className="text-[11px] sm:text-xs" style={{ color: "var(--baci-muted)" }}>
          Soluciones financieras ágiles
        </div>
      </div>
    </div>
  );
}

export { BrandCmp as Brand };   // named export
export default BrandCmp;        // default export (por si importas sin llaves)
