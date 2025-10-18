// src/lib/creditPlans.ts
export type Sujeto = "CLIENTE" | "COORDINADORA";

export type Plan = {
  semanas: number;
  montos: number[];       // montos permitidos
  cuotas: number[];       // cuota semanal por índice paralelo a montos
};

type PlansBySujeto = Record<Sujeto, Plan[]>;

/**
 * Reglas que pediste:
 * - 14 semanas (cliente y coordinadora): patrón base: 1000→110, 1500→160, 2000→210 ... (salto de 500 monta +50 cuota)
 * - 13 semanas (ambos): montos hasta 4000 con cuotas exactas: 1000→120, 1500→180, 2000→230, 2500→280, 3000→340, 3500→390, 4000→450
 * - 10 semanas (solo COORDINADORA): "como 14" (mismo patrón que 14w)
 * - 9 semanas (ambos): usamos misma lógica que 13 (más agresivo), puedes ajustar si lo cambias después.
 */

const montosBase14 = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
const cuotasBase14 = [110, 160, 210, 260, 310, 360, 410, 460, 510]; // +50 por cada +500

const montos13 = [1000, 1500, 2000, 2500, 3000, 3500, 4000];
const cuotas13  = [120,  180,  230,  280,  340,  390,  450];

const plans: PlansBySujeto = {
  CLIENTE: [
    { semanas: 14, montos: montosBase14, cuotas: cuotasBase14 },
    { semanas: 13, montos: montos13,     cuotas: cuotas13 },
    { semanas: 9,  montos: montos13,     cuotas: cuotas13 }, // misma tabla que 13 (más agresivo)
  ],
  COORDINADORA: [
    { semanas: 14, montos: montosBase14, cuotas: cuotasBase14 },
    { semanas: 13, montos: montos13,     cuotas: cuotas13 },
    { semanas: 10, montos: montosBase14, cuotas: cuotasBase14 }, // "como 14"
    { semanas: 9,  montos: montos13,     cuotas: cuotas13 },
  ],
};

export function getPlansBySujeto(sujeto: Sujeto): Plan[] {
  return plans[sujeto];
}

export function getMontosFor(sujeto: Sujeto, semanas: number): number[] {
  const p = getPlansBySujeto(sujeto).find(pl => pl.semanas === semanas);
  return p ? p.montos : [];
}

export function getCuotaFor(sujeto: Sujeto, semanas: number, monto: number): number | null {
  const p = getPlansBySujeto(sujeto).find(pl => pl.semanas === semanas);
  if (!p) return null;
  const idx = p.montos.indexOf(monto);
  if (idx === -1) return null;
  return p.cuotas[idx] ?? null;
}

/** Genera fechas semanales a partir de la fecha inicial (ISO yyyy-mm-dd). */
export function generarFechasSemanas(inicioISO: string, semanas: number): string[] {
  const out: string[] = [];
  const start = new Date(inicioISO + "T00:00:00");
  for (let i = 0; i < semanas; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Utilidad: a partir de un "día de pago" (0=Dom..6=Sáb) obtener la próxima fecha desde hoy */
export function nextDateForWeekday(weekday: number, from?: Date): string {
  const base = from ? new Date(from) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const wd = d.getDay();
  const delta = (weekday - wd + 7) % 7 || 7; // próxima ocurrencia (si hoy es el mismo día, ir a la próxima semana)
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
