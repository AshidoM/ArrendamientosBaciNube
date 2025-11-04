// src/services/import/transformers.ts
import {
  type ColumnsSpec,
  type RegistroCreditoRow,
  type StageWorkbook,
  type EncabezadoHoja,
} from "./contract";
import {
  type ParsedWorkbook,
  type ParsedSheet,
  colToIndex,
} from "./xlsx.reader";

/**
 * Toma el ParsedWorkbook (matriz raw por hoja) y lo convierte en StageWorkbook
 * con filas tipadas (`RegistroCreditoRow`), preservando encabezados, y
 * extrayendo pagos desde la columna Q en adelante (encabezado=fecha, celda=monto).
 */
export function toStageWorkbook(pw: ParsedWorkbook): StageWorkbook {
  return {
    fileName: pw.fileName,
    sheets: pw.sheets.map(transformSheet),
  };
}

function transformSheet(ps: ParsedSheet) {
  const rows = matrixToRows(ps);
  const header = inferHeader(ps.header, rows);
  return {
    sheetName: ps.name,
    header,
    rows,
  };
}

/* ====================== Helpers de normalización ====================== */

function normStr(v: any): string {
  return String(v ?? "").trim();
}

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** 
 * Extrae el nombre de coordinadora desde un token libre que puede traer:
 * "COORDINADORA: Ana", "Coord. Ana", "COORD: ANA", "Coordinadora Ana", etc.
 * Si no matchea prefijos, devuelve el string limpio.
 */
function extractCoordinatorName(raw: any): string | null {
  if (raw == null) return null;
  const s0 = normStr(raw);
  if (!s0) return null;

  // Normalizamos para parseo (pero conservamos el texto sin acentos para robustez)
  const s = stripDiacritics(s0).toLowerCase();

  // Patrones típicos con prefijo y separador opcional
  const re = /^(?:\s*(?:coor(?:dinador(?:a)?)?|coord\.?|coordinadora)\s*[:\-–]?\s*)(.+)$/i;
  const m = s.match(re);
  if (m && m[1]) {
    return normStr(m[1]);
  }

  // Si trae "algo: nombre" y no reconocimos prefijo, probar dividir por ":" última ocurrencia
  const idx = s0.lastIndexOf(":");
  if (idx >= 0 && idx < s0.length - 1) {
    return normStr(s0.slice(idx + 1));
  }

  return s0;
}

/** Regla por plazo: 9/10 => Coordinadora; 13/14 => Cliente */
function isCoordinadoraByPlazo(plazo?: number | null): boolean | null {
  if (plazo == null) return null;
  if (plazo === 9 || plazo === 10) return true;
  if (plazo === 13 || plazo === 14) return false;
  return null; // indeterminado para otros valores
}

/* ====================== Core de transformación matricial ====================== */

/**
 * Convierte la matriz a arreglo de RegistroCreditoRow usando el mapeo A..P → campo.
 * Los datos empiezan en la fila 4 (index 3). El encabezado de pagos está en `headerRowIndex`
 * y las fechas de pagos empiezan en `paymentsStartColIndex`.
 */
function matrixToRows(ps: ParsedSheet): RegistroCreditoRow[] {
  const { matrix, columns, headerRowIndex, paymentsStartColIndex, header } = ps;

  // Datos desde fila 4 (index 3)
  const dataStartRow = 3;
  if (matrix.length <= dataStartRow) return [];

  // Mapeo inverso: ColLetter -> index
  const letterToIndex = buildLetterIndex(columns);

  // Lee encabezados de pagos (fila headerRowIndex): Q.. son fechas
  const paymentDates = readPaymentDates(matrix, headerRowIndex, paymentsStartColIndex);

  const out: RegistroCreditoRow[] = [];
  const coordName = (extractCoordinatorName(header?.coordinadora_nombre) || "").toLowerCase();

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r];

    // si toda la fila viene vacía, continúa
    if (!row || row.every((v) => v == null || String(v).trim?.() === "")) {
      continue;
    }

    const rec: RegistroCreditoRow = {
      folio_credito: readCell(row, letterToIndex, "A"),
      cliente_nombre: safeStr(readCell(row, letterToIndex, "B")),
      cliente_ine: safeStr(readCell(row, letterToIndex, "C")),
      cliente_dom: safeStr(readCell(row, letterToIndex, "D")),
      aval_nombre: safeStr(readCell(row, letterToIndex, "E")),
      aval_ine: safeStr(readCell(row, letterToIndex, "F")),
      aval_dom: safeStr(readCell(row, letterToIndex, "G")),
      cuota: toNum(readCell(row, letterToIndex, "H")),
      m15_texto: toNullableStr(readCell(row, letterToIndex, "I")),
      adeudo_total: toNumOrNull(readCell(row, letterToIndex, "J")),
      plazo: toIntOrNull(readCell(row, letterToIndex, "K")),
      vencidos: toIntOrNull(readCell(row, letterToIndex, "L")),
      cartera_vencida: toNumOrNull(readCell(row, letterToIndex, "M")),
      cobro_semana: toNumOrNull(readCell(row, letterToIndex, "N")),
      observaciones: toNullableStr(readCell(row, letterToIndex, "O")),
      fecha_disposicion: normalizeDateCell(readCell(row, letterToIndex, "P")),
      pagos: [],
      es_credito_de_coordinadora: false,
    };

    // Pagos: desde Q en adelante; header=fecha, celda=monto
    const pagos = [];
    for (let c = paymentsStartColIndex; c < (matrix[headerRowIndex]?.length ?? 0); c++) {
      const fechaHeader = paymentDates[c];
      if (!fechaHeader) continue;
      const monto = toNumOrNull(row[c]);
      if (monto && monto > 0) {
        pagos.push({ fecha: fechaHeader, monto });
      }
    }
    if (pagos.length) rec.pagos = pagos;

    // ======= Detección de tipo (COORDINADORA vs CLIENTE) =======
    let esCoord = false;

    // a) Por nombre = nombre en B2 (coincidencia exacta normalizada)
    const nombre = (rec.cliente_nombre || "").trim().toLowerCase();
    if (coordName && nombre && nombre === coordName) {
      esCoord = true;
    }

    // b) Por regla de plazo (K): 9/10 → Coordinadora; 13/14 → Cliente
    if (!esCoord) {
      const byPlazo = isCoordinadoraByPlazo(rec.plazo);
      if (byPlazo === true) esCoord = true;
      // si byPlazo === false, lo dejamos en false explícito
    }

    rec.es_credito_de_coordinadora = esCoord;

    out.push(rec);
  }

  return out;
}

function buildLetterIndex(columns: ColumnsSpec): Record<keyof ColumnsSpec, number> & Record<string, number> {
  const map: Record<string, number> = {};
  // solo A..P afectan a campos; pagos Q.. adelante se manejan aparte
  Object.keys(columns).forEach((letter) => {
    map[letter] = colToIndex(letter);
  });
  return map as any;
}

function readPaymentDates(matrix: any[][], headerRowIndex: number, startCol: number): Record<number, string> {
  const hdr = matrix[headerRowIndex] || [];
  const out: Record<number, string> = {};
  for (let c = startCol; c < hdr.length; c++) {
    const v = hdr[c];
    const iso = normalizeDateCell(v);
    if (iso) out[c] = iso;
  }
  return out;
}

function readCell(row: any[], letterToIndex: Record<string, number>, letter: string): any {
  const idx = letterToIndex[letter];
  return idx == null ? null : row[idx];
}

function safeStr(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNullableStr(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNum(v: any): number | null {
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function toNumOrNull(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function toIntOrNull(v: any): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return isFinite(n) ? n : null;
}

/** Normaliza una celda que puede ser Date, número Excel, string “16/07/2025”, etc. */
function normalizeDateCell(v: any): string | null {
  if (v == null || v === "") return null;

  // Date nativo
  if (v instanceof Date && !isNaN(v.getTime())) {
    return toISODate(v);
  }

  // Excel date serial
  if (typeof v === "number") {
    try {
      // @ts-ignore - XLSX.SSF puede no estar tipado aquí
      const d = XLSX.SSF?.parse_date_code?.(v);
      if (d && isFinite(d.y) && isFinite(d.m) && isFinite(d.d)) {
        const dt = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
        return toISODate(dt);
      }
    } catch {}
  }

  // String tipo “YYYY-MM-DD”, “DD/MM/YYYY”, “16 Jul”, etc.
  const s = String(v).trim();

  // ISO directo
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    const y = parseInt(m1[3].length === 2 ? "20" + m1[3] : m1[3], 10);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return toISODate(dt);
  }

  // “16 Jul” (sin año) -> asumimos año actual
  const m2 = s.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚÑáéíóúñ\.]{3,})$/);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const mon = monthNameToNumber(m2[2]);
    const y = new Date().getUTCFullYear();
    if (mon != null) {
      const dt = new Date(Date.UTC(y, mon - 1, d));
      return toISODate(dt);
    }
  }

  return null;
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthNameToNumber(token: string): number | null {
  const t = token
    .toLowerCase()
    .replaceAll(".", "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const map: Record<string, number> = {
    ene: 1, enero: 1,
    feb: 2, febrero: 2,
    mar: 3, marzo: 3,
    abr: 4, abril: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6,
    jul: 7, julio: 7,
    ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9,
    oct: 10, octubre: 10,
    nov: 11, noviembre: 11,
    dic: 12, diciembre: 12,
  };
  return map[t] ?? null;
}

/** Completa o ajusta flags del encabezado (es_coordinadora_hoja) */
function inferHeader(h: EncabezadoHoja, rows: RegistroCreditoRow[]): EncabezadoHoja {
  const out: EncabezadoHoja = { ...h };

  const coordNorm = (extractCoordinatorName(h.coordinadora_nombre) || "").toLowerCase();

  // Señal por nombre
  const someByName = coordNorm
    ? rows.some((r) => (r.cliente_nombre ?? "").trim().toLowerCase() === coordNorm)
    : false;

  // Señal por plazo (mayoría en 9/10)
  const coordByPlazoCount = rows.filter((r) => isCoordinadoraByPlazo(r.plazo) === true).length;

  out.es_coordinadora_hoja = !!(someByName || (coordByPlazoCount > rows.length / 2));

  // Normaliza el nombre extraído en el header para futuras comparaciones
  out.coordinadora_nombre = coordNorm ? extractCoordinatorName(h.coordinadora_nombre) : h.coordinadora_nombre;

  return out;
}
