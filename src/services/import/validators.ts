// src/services/import/validators.ts
import { StageSheet, StageStatus, StageWorkbook } from "./staging";
import { normalizeINE, normalizeName } from "./contract";

export type ValidationIssue = {
  entity: "RUTA" | "POBLACION" | "COORDINADORA" | "CLIENTE" | "AVAL" | "CREDITO" | "PAGO" | "MULTA";
  key: string;
  status: StageStatus;
  message: string;
};

export function validateWorkbook(sw: StageWorkbook): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const sh of sw.sheets) {
    if (!sh.header.poblacionNombre) {
      issues.push({ entity: "POBLACION", key: sh.name, status: "INCOMPLETO", message: "Falta nombre de población (B1)" });
    }
    if (!sh.header.rutaNombre) {
      issues.push({ entity: "RUTA", key: sh.name, status: "INCOMPLETO", message: "Falta nombre de ruta (M2)" });
    }

    for (const c of sh.creditos) {
      if (!c.titular_nombre) {
        issues.push({ entity: "CREDITO", key: c.key, status: "INCOMPLETO", message: "Crédito sin titular" });
      }
      if (!c.cuota) {
        issues.push({ entity: "CREDITO", key: c.key, status: "INCOMPLETO", message: "Crédito sin cuota semanal (H3)" });
      }
      if (!c.semanas) {
        issues.push({ entity: "CREDITO", key: c.key, status: "INCOMPLETO", message: "Crédito sin plazo/semanas (K3)" });
      }
      // Deduplicación por INE y luego por nombre normalizado
      const ine = normalizeINE(c.titular_ine ?? null);
      if (!ine) {
        const nn = normalizeName(c.titular_nombre);
        if (!nn) {
          issues.push({ entity: "CREDITO", key: c.key, status: "INCOMPLETO", message: "Titular sin INE ni nombre válido" });
        }
      }
    }
  }

  return issues;
}
