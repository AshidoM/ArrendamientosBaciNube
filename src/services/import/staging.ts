// src/services/import/staging.ts
import * as XLSX from "xlsx";
import {
  DEFAULT_COLS,
  DEFAULT_HEADER_ROW_INDEX,
  DEFAULT_PAYMENTS_START_COL_INDEX,
  type ColumnsSpec,
  type EncabezadoHoja,
  type RegistroCreditoRow,
  type SheetParsed,
  type StageWorkbook,
} from "./contract";

type SelectedSheet = { name: string; ws: XLSX.WorkSheet };

export type BuildStagingInput = {
  fileName: string;
  sheets: SelectedSheet[];
  cols?: ColumnsSpec;
  headerRowIndex1?: number;          // 1-based humano (default 3 -> fila A3.. encabezados)
  paymentsStartColIndex1?: number;   // 1-based humano (default 17 -> Q)
  onProgress?: (percent: number, label?: string) => void;
};

/* ====================== Utils ====================== */

function cell(ws: XLSX.WorkSheet, r: number, c: number): any {
  const addr = XLSX.utils.encode_cell({ r, c });
  return (ws as any)[addr]?.v ?? null;
}

function rowIsEmpty(ws: XLSX.WorkSheet, r: number, maxC: number): boolean {
  for (let c = 0; c <= maxC; c++) {
    const v = cell(ws, r, c);
    if (v !== null && v !== "" && String(v).trim() !== "") return false;
  }
  return true;
}

function normStr(v: any): string {
  return String(v ?? "").trim();
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function extractCoordinatorName(raw: any): string | null {
  if (raw == null) return null;
  const s0 = normStr(raw);
  if (!s0) return null;

  const s = stripDiacritics(s0).toLowerCase();
  const re = /^(?:\s*(?:coor(?:dinador(?:a)?)?|coord\.?|coordinadora)\s*[:\-–]?\s*)(.+)$/i;
  const m = s.match(re);
  if (m && m[1]) {
    return normStr(m[1]);
  }

  const idx = s0.lastIndexOf(":");
  if (idx >= 0 && idx < s0.length - 1) {
    return normStr(s0.slice(idx + 1));
  }

  return s0;
}

function isCoordinadoraByPlazo(plazo?: number | null): boolean | null {
  if (plazo == null) return null;
  if (plazo === 9 || plazo === 10) return true;
  if (plazo === 13 || plazo === 14) return false;
  return null;
}

/* ====================== Encabezado ====================== */

function readHeader(ws: XLSX.WorkSheet): EncabezadoHoja {
  // Coordenadas 1-based del usuario:
  // A1, B1, D1, I1, P1  y  B2, I2, M2, O2
  const A1 = (ws as any)["A1"]?.v ?? null;
  const B1 = (ws as any)["B1"]?.v ?? null;
  const D1 = (ws as any)["D1"]?.v ?? null;
  const I1 = (ws as any)["I1"]?.v ?? null;
  const P1 = (ws as any)["P1"]?.v ?? null;

  const rawB2 = (ws as any)["B2"]?.v ?? null;
  const I2 = (ws as any)["I2"]?.v ?? null;
  const M2 = (ws as any)["M2"]?.v ?? null;
  const O2 = (ws as any)["O2"]?.v ?? null;

  const norm = (v: any) => (v == null ? null : String(v).trim());
  let coordinadoraNombre = extractCoordinatorName(rawB2);

  return {
    poblacion_numero: A1 ?? null,
    poblacion_nombre: norm(B1),
    coordinadora_cumple: norm(D1),
    coordinadora_tel: norm(I1),
    poblacion_estado: norm(P1),
    coordinadora_nombre: coordinadoraNombre,
    coordinadora_domicilio: norm(I2),
    ruta_nombre: norm(M2),
    frecuencia_dias: norm(O2),
    es_coordinadora_hoja: false, // se ajusta por filas si aplica
  };
}

/* ====================== Filas ====================== */

function buildRowsFromSheet(
  ws: XLSX.WorkSheet,
  colsMap: ColumnsSpec,
  headerRowIndex1: number,
  paymentsStartColIndex1: number,
  coordNameFromHeader?: string | null
): RegistroCreditoRow[] {
  const ref = ((ws as any)["!ref"] as string) || "A1:A1";
  const rng = XLSX.utils.decode_range(ref);
  const maxR = rng.e.r;
  const maxC = rng.e.c;

  // Datos empiezan en fila (headerRowIndex1 + 1). Con default 3 → datos desde la fila 4 (0-based r=3)
  const dataStartR = Math.max(0, headerRowIndex1);

  const paymentsStartC0 = Math.max(0, paymentsStartColIndex1 - 1);

  const colLetterToIndex = (letter: string): number => {
    const { c } = XLSX.utils.decode_cell(letter + "1");
    return c;
  };

  const mapColToIndex: Array<[number, keyof RegistroCreditoRow]> = [];
  Object.entries(colsMap).forEach(([letter, key]) => {
    const idx = colLetterToIndex(letter);
    mapColToIndex.push([idx, key as keyof RegistroCreditoRow]);
  });

  const rows: RegistroCreditoRow[] = [];
  const coordNorm = (extractCoordinatorName(coordNameFromHeader) || "").toLowerCase();

  for (let r = dataStartR; r <= maxR; r++) {
    const empty = rowIsEmpty(ws, r, Math.min(maxC, paymentsStartC0 - 1));
    if (empty) continue;

    const row: RegistroCreditoRow = {};

    // A..P
    for (const [c, key] of mapColToIndex) {
      const v = cell(ws, r, c);
      if (v == null || String(v).trim() === "") continue;
      if (key === "cuota" || key === "adeudo_total" || key === "plazo" || key === "vencidos" || key === "cartera_vencida" || key === "cobro_semana") {
        const n = Number(v);
        (row as any)[key] = Number.isFinite(n) ? n : null;
      } else if (key === "fecha_disposicion") {
        if (v instanceof Date) (row as any)[key] = v.toISOString().slice(0, 10);
        else (row as any)[key] = String(v).trim();
      } else {
        (row as any)[key] = String(v).trim();
      }
    }

    // Pagos: desde Q..: encabezado=fecha, celda=monto
    const pagos: Array<{ fecha: string; monto: number }> = [];
    for (let c = paymentsStartC0; c <= maxC; c++) {
      const headerCell = cell(ws, headerRowIndex1 - 1, c);
      const monto = cell(ws, r, c);
      if (headerCell == null) continue;
      const fechaTxt = headerCell instanceof Date
        ? headerCell.toISOString().slice(0, 10)
        : String(headerCell).trim();
      const montoNum = Number(monto);
      if (!fechaTxt || !Number.isFinite(montoNum) || montoNum === 0) continue;
      pagos.push({ fecha: fechaTxt, monto: montoNum });
    }
    if (pagos.length) row.pagos = pagos;

    // Tipo por nombre (B == B2 coordinadora) y por plazo (K)
    const nombre = (row.cliente_nombre || "").trim().toLowerCase();
    let esCoord = false;
    if (coordNorm && nombre && nombre === coordNorm) {
      esCoord = true;
    }
    if (!esCoord) {
      const byPlazo = isCoordinadoraByPlazo(row.plazo as number | undefined);
      if (byPlazo === true) esCoord = true;
    }
    (row as any).es_credito_de_coordinadora = esCoord;

    rows.push(row as RegistroCreditoRow);
  }

  return rows;
}

/* ====================== Builder principal ====================== */

export async function buildStaging(input: BuildStagingInput): Promise<StageWorkbook> {
  const {
    fileName,
    sheets,
    cols = DEFAULT_COLS,
    headerRowIndex1 = DEFAULT_HEADER_ROW_INDEX,
    paymentsStartColIndex1 = DEFAULT_PAYMENTS_START_COL_INDEX,
    onProgress,
  } = input;

  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("No se recibieron hojas seleccionadas.");
  }

  const total = sheets.length;
  const resultSheets: SheetParsed[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const { name, ws } = sheets[i];
    onProgress?.(Math.round((i * 100) / total), `Leyendo hoja: ${name}`);

    const header = readHeader(ws);
    const rows = buildRowsFromSheet(ws, cols, headerRowIndex1, paymentsStartColIndex1, header.coordinadora_nombre);

    // Ajuste de flag es_coordinadora_hoja (mayoría por plazo o coincidencias por nombre)
    const coordByPlazo = rows.filter((r) => isCoordinadoraByPlazo(r.plazo) === true).length;
    const coordName = (extractCoordinatorName(header.coordinadora_nombre) || "").toLowerCase();
    const someByName = coordName ? rows.some(r => (r.cliente_nombre ?? "").trim().toLowerCase() === coordName) : false;

    const es_coordinadora_hoja = !!(someByName || (coordByPlazo > rows.length / 2));

    resultSheets.push({
      sheetName: name,
      header: { ...header, es_coordinadora_hoja },
      rows,
    });
  }

  onProgress?.(100, "Estructura de staging lista");

  const sw: StageWorkbook = { fileName, sheets: resultSheets };
  return sw;
}
