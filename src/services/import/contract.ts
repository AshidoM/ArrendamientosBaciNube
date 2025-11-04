// src/services/import/contract.ts

export type ID = string | number;

/* ===========================
   Encabezado por hoja (población)
   =========================== */
export interface EncabezadoHoja {
  // Encabezados principales (flexibles por variantes)
  poblacionNumero?: string | number | null;   // A1 (si existe)
  poblacionNombre?: string | null;            // B1
  poblacionMunicipio?: string | null;         // opcional (si viene en alguna hoja)
  estadoMx?: string | null;                   // P1 (variante A) o ausente

  // Ruta y frecuencia (dos variantes soportadas)
  rutaNombre?: string | null;                 // O1 (variante nueva) o M2 (variante anterior)
  frecuencia?: string | null;                 // O2 u O1 (según variante)

  // Coordinadora
  coordinadoraNombre?: string | null;         // B2 (puede venir como "CORD: Nombre" o "Coordinadora: Nombre")
  coordinadoraDomicilio?: string | null;      // D2 (nuevo) o I2 (anterior)
  coordTelefono?: string | null;              // F2 (nuevo) o I1 (anterior)

  // Cumpleaños/fecha nacimiento (si sólo viene día y mes, se completa con año actual)
  cumpleISO?: string | null;                  // YYYY-MM-DD (normalizado)

  // Flags inferidos
  esCoordinadoraHoja?: boolean | null;
}

/* ===========================
   Fila de crédito (A..P base, Q.. pagos)
   =========================== */
export interface RegistroCreditoRow {
  folio_credito?: string | number | null;  // A
  cliente_nombre?: string | null;          // B
  cliente_ine?: string | null;             // C
  cliente_dom?: string | null;             // D
  aval_nombre?: string | null;             // E
  aval_ine?: string | null;                // F
  aval_dom?: string | null;                // G
  cuota?: number | null;                   // H
  m15_texto?: string | null;               // I
  adeudo_total?: number | null;            // J
  plazo?: number | null;                   // K
  vencidos?: number | null;                // L
  cartera_vencida?: number | null;         // M
  cobro_semana?: number | null;            // N
  observaciones?: string | null;           // O
  fecha_disposicion?: string | null;       // P (ISO preferido)
  pagos?: Array<{ fecha: string; monto: number }>; // Q..: header=fecha, value=monto
  es_credito_de_coordinadora?: boolean;
}

/* ===========================
   Resultado por hoja y global
   =========================== */
export interface SheetParsed {
  sheetName: string;
  header: EncabezadoHoja;
  rows: RegistroCreditoRow[];
}

export interface StageWorkbook {
  fileName: string;
  sheets: SheetParsed[];
}

/* ===========================
   Totales / Commit
   =========================== */
export type CommitPhase =
  | "Poblaciones"
  | "Coordinadoras"
  | "Clientes"
  | "Avales"
  | "Créditos"
  | "Pagos";

export type StepReport = {
  phase: CommitPhase;
  total: number;
  done: number;
  ok: number;
  warn: number;
  error: number;
};

export type CommitReport = {
  byPhase: Record<CommitPhase, StepReport>;
  errorsByPhase: Record<CommitPhase, string[]>;
  warningsByPhase: Record<CommitPhase, string[]>;
  globalOk: boolean;
};

/* ===========================
   Reader options
   =========================== */
export interface ReaderOptions {
  /** Fila de encabezados de la tabla (1-based). Default 3 (=A3..). */
  headerRowIndex?: number;
  /** Columna inicial de pagos (1-based). Default 17 (=Q). */
  paymentsStartColIndex?: number;
}

/* ===========================
   Especificación de columnas de la tabla base A..P
   =========================== */
export type ColumnKey =
  | "folio_credito"
  | "cliente_nombre"
  | "cliente_ine"
  | "cliente_dom"
  | "aval_nombre"
  | "aval_ine"
  | "aval_dom"
  | "cuota"
  | "m15_texto"
  | "adeudo_total"
  | "plazo"
  | "vencidos"
  | "cartera_vencida"
  | "cobro_semana"
  | "observaciones"
  | "fecha_disposicion";

/** Mapa A..P -> campo. `colPagosDesde` indica desde qué letra empiezan los pagos (típicamente Q). */
export interface EncabezadoTabla {
  A: ColumnKey; B: ColumnKey; C: ColumnKey; D: ColumnKey;
  E: ColumnKey; F: ColumnKey; G: ColumnKey; H: ColumnKey;
  I: ColumnKey; J: ColumnKey; K: ColumnKey; L: ColumnKey;
  M: ColumnKey; N: ColumnKey; O: ColumnKey; P: ColumnKey;
  colPagosDesde: string; // "Q" por defecto
}

/** Defaults según tu layout */
export const DEFAULT_COLS: EncabezadoTabla = {
  A: "folio_credito",
  B: "cliente_nombre",
  C: "cliente_ine",
  D: "cliente_dom",
  E: "aval_nombre",
  F: "aval_ine",
  G: "aval_dom",
  H: "cuota",
  I: "m15_texto",
  J: "adeudo_total",
  K: "plazo",
  L: "vencidos",
  M: "cartera_vencida",
  N: "cobro_semana",
  O: "observaciones",
  P: "fecha_disposicion",
  colPagosDesde: "Q",
};

export const DEFAULT_HEADER_ROW_INDEX = 3;     // 1-based humano
export const DEFAULT_PAYMENTS_START_COL_INDEX = 17; // Q

/* ===========================
   Mes → número (acepta abreviaturas ES)
   =========================== */
export const MES_A_NUM: Record<string, number> = {
  ENE: 1, ENERO: 1,
  FEB: 2, FEBRERO: 2,
  MAR: 3, MARZO: 3,
  ABR: 4, ABRIL: 4,
  MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6,
  JUL: 7, JULIO: 7,
  AGO: 8, AGOSTO: 8,
  SEP: 9, SET: 9, SEPT: 9, SEPTIEMBRE: 9,
  OCT: 10, OCTUBRE: 10,
  NOV: 11, NOVIEMBRE: 11,
  DIC: 12, DICIEMBRE: 12,
};

/* ===========================
   Utilidades de columnas
   =========================== */
export function colToIndex(col: string): number {
  // A=0, B=1, ..., Z=25, AA=26, etc.
  let n = 0;
  const s = (col || "A").toUpperCase().trim();
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}
