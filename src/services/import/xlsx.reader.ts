// src/services/import/xlsx.reader.ts
import * as XLSX from "xlsx";
import type { EncabezadoHoja, EncabezadoTabla } from "./contract";
import { DEFAULT_COLS, MES_A_NUM, colToIndex } from "./contract";

export type RawCell = any;

export type ParsedSheet = {
  name: string;
  header: EncabezadoHoja;
  columns: EncabezadoTabla;
  // Matriz completa (incluye filas de encabezado)
  matrix: RawCell[][];
  // índice de columna a partir del cual empiezan fechas de pagos (Q por defecto, 0-based)
  paymentsStartColIndex: number;
  // fila base de encabezados de tabla (0-based). Por default: 2 (fila 3 humana)
  headerRowIndex: number;
};

export type ParsedWorkbook = {
  fileName: string;
  sheets: ParsedSheet[];
};

/* =============================
   Helpers de lectura de celdas
============================= */
function getCell(ws: XLSX.WorkSheet, addr: string) {
  return (ws as any)[addr]?.v ?? null;
}

function sheetToMatrix(ws: XLSX.WorkSheet): RawCell[][] {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  const rows: RawCell[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: RawCell[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push((ws as any)[addr]?.v ?? null);
    }
    rows.push(row);
  }
  return rows;
}

/* ===========================================
   Normalizadores de textos y fecha cumpleaños
=========================================== */
function cleanStr(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function stripLabelPrefix(s: string | null, ...labels: string[]): string | null {
  if (!s) return s;
  let out = s;
  for (const lb of labels) {
    const re = new RegExp(`^\\s*${lb}\\s*:\\s*`, "i");
    out = out.replace(re, "");
  }
  return out.trim();
}

/** Acepta: "16 Jul", "16/jul", "16 de Julio", "DD/MM", "DD-MM", "DD/MM/YYYY", "YYYY-MM-DD" */
function parseCumpleToDayMonthYear(v: any): { dia?: number | null; mes?: number | null; year?: number | null } {
  const nowY = new Date().getFullYear();

  // Date nativo
  if (v instanceof Date && !isNaN(v.getTime())) {
    return { dia: v.getUTCDate(), mes: v.getUTCMonth() + 1, year: v.getUTCFullYear() };
  }

  // Serial Excel
  if (typeof v === "number") {
    try {
      const d = XLSX.SSF?.parse_date_code?.(v);
      if (d && isFinite(d.y) && isFinite(d.m) && isFinite(d.d)) {
        return { dia: d.d, mes: d.m, year: d.y || nowY };
      }
    } catch {}
  }

  const s0 = cleanStr(v);
  if (!s0) return {};
  const s = s0
    .toLowerCase()
    .replaceAll(".", "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  // YYYY-MM-DD
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) return { year: +mIso[1], mes: +mIso[2], dia: +mIso[3] };

  // DD/MM/YYYY o DD-MM-YYYY
  const mFull = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mFull) {
    const d = +mFull[1], mo = +mFull[2];
    const y = mFull[3].length === 2 ? +(Number("20" + mFull[3])) : +mFull[3];
    return { dia: d, mes: mo, year: y };
  }

  // DD/MM o DD-MM  (sin año)
  const mNoYear = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (mNoYear) return { dia: +mNoYear[1], mes: +mNoYear[2], year: nowY };

  // "16 jul" / "16 de julio"
  const mTxt = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})$/);
  if (mTxt) {
    const d = +mTxt[1];
    const monKey = mTxt[2];
    const map: Record<string, number> = {
      ene:1, enero:1, feb:2, febrero:2, mar:3, marzo:3, abr:4, abril:4, may:5, mayo:5, jun:6, junio:6,
      jul:7, julio:7, ago:8, agosto:8, sep:9, set:9, sept:9, septiembre:9, oct:10, octubre:10,
      nov:11, noviembre:11, dic:12, diciembre:12,
    };
    const mo = map[monKey] ?? null;
    if (mo) return { dia: d, mes: mo, year: nowY };
  }

  return {};
}

/* ===========================================
   Detección de encabezado (dos variantes)
=========================================== */
/**
 * Variante A (original):
 *   B1: Población
 *   D1: Cumple (texto día/mes)
 *   I1: Tel. coord.
 *   P1: Estado
 *   B2: Coordinadora (puede venir con "Coordinadora: Nombre")
 *   I2: Domicilio coord.
 *   M2: Ruta
 *   O2: Frecuencia
 *
 * Variante B (tu alterna):
 *   B1: Población
 *   O1: Ruta
 *   B2: "CORD: Nombre" | "COORD: Nombre"
 *   D2: Domicilio coord.
 *   F2: Tel. coord.
 *   H2: Cumple (día/mes sin año → año actual)
 *   O2: Frecuencia
 *   P1: Estado (si existe)
 */
function readSmartHeader(ws: XLSX.WorkSheet): EncabezadoHoja {
  // Primero intentamos leer con A (original)
  const A = {
    poblacionNombre: cleanStr(getCell(ws, "B1")),
    cumpleRaw: getCell(ws, "D1"),
    telRaw: getCell(ws, "I1"),
    estado: cleanStr(getCell(ws, "P1")),
    coordRaw: cleanStr(getCell(ws, "B2")),
    domRaw: cleanStr(getCell(ws, "I2")),
    ruta: cleanStr(getCell(ws, "M2")),
    frecuencia: cleanStr(getCell(ws, "O2")),
  };

  // Si B1 y/o M2 faltan, revisamos variante B
  const B = {
    poblacionNombre: cleanStr(getCell(ws, "B1")),
    ruta: cleanStr(getCell(ws, "O1")),                 // Ruta en O1
    coordRaw: cleanStr(getCell(ws, "B2")),             // "CORD: Nombre" o "COORD: Nombre"
    domRaw: cleanStr(getCell(ws, "D2")),
    telRaw: cleanStr(getCell(ws, "F2")),
    cumpleRaw: getCell(ws, "H2"),
    frecuencia: cleanStr(getCell(ws, "O2")),
    estado: cleanStr(getCell(ws, "P1")),
  };

  // Elegimos esquema: si hay ruta en M2 usamos A; si no, si hay ruta en O1 usamos B.
  const useB = (!A.ruta && !!B.ruta) || (!A.poblacionNombre && !!B.poblacionNombre);

  const src = useB ? B : A;

  const coordNombre = stripLabelPrefix(src.coordRaw, "coordinadora", "coord", "cord", "coordinador(a)?");

  const cumple = parseCumpleToDayMonthYear(src.cumpleRaw);
  const { dia, mes, year } = cumple;
  // Representación de cumpleaños editable: si tenemos y, devolvemos YYYY-MM-DD; si no, dejamos null y UI arma texto.
  const cumpleISO = (dia && mes)
    ? `${String(year || new Date().getFullYear()).padStart(4,"0")}-${String(mes).padStart(2,"0")}-${String(dia).padStart(2,"0")}`
    : null;

  const header: EncabezadoHoja = {
    poblacionNumero: cleanStr(getCell(ws, "A1")) ?? null,
    poblacionNombre: src.poblacionNombre ?? null,
    dia: dia ?? null,
    mes: mes ?? null,
    coordTelefono: src.telRaw ? String(src.telRaw).trim() : null,
    estadoMx: src.estado ?? null,
    coordinadoraNombre: coordNombre ?? null,
    coordinadoraDomicilio: src.domRaw ?? null,
    rutaNombre: src.ruta ?? null,
    frecuencia: src.frecuencia ?? null,
    esCoordinadoraHoja: false, // lo ajusta transformer si hace falta
  };

  // Si queremos además una cadena legible del cumple en UI, ya la UI puede formatear (día/mes/año actual).
  // Aquí solo devolvemos dia/mes (y year se infiere al registrar si hiciera falta).

  return header;
}

/* ===========================================
   API principal: parseFile
=========================================== */
export async function parseFile(
  file: File,
  cols: EncabezadoTabla = DEFAULT_COLS
): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
  const sheets: ParsedSheet[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const matrix = sheetToMatrix(ws);
    const header = readSmartHeader(ws);

    const paymentsStartColIndex = colToIndex(cols.colPagosDesde); // Q → 16 (0-based)
    const headerRowIndex = 2; // fila 3 (0-based)

    sheets.push({
      name,
      header,
      columns: cols,
      matrix,
      paymentsStartColIndex,
      headerRowIndex,
    });
  }

  return { fileName: file.name, sheets };
}
