// client/src/types/jspdf-autotable.d.ts
declare module "jspdf-autotable" {
  import type jsPDF from "jspdf";
  type CellAlign = "left" | "center" | "right" | "justify";
  export interface ColumnStyle {
    cellWidth?: number | "auto";
    halign?: CellAlign;
    valign?: "top" | "middle" | "bottom";
    cellPadding?: number | { top?: number; right?: number; bottom?: number; left?: number };
    font?: string;
    fontStyle?: string;
    fontSize?: number;
    textColor?: number | string | [number, number, number];
    fillColor?: number | string | [number, number, number];
  }
  export interface Styles extends ColumnStyle {}
  export interface AutoTableOptions {
    head?: (string | number)[][];
    body?: (string | number)[][];
    startY?: number;
    styles?: Styles;
    headStyles?: Styles;
    columnStyles?: Record<number, ColumnStyle>;
    margin?: { left?: number; right?: number; top?: number; bottom?: number };
    didDrawPage?: (data: any) => void;
  }
  export default function autoTable(doc: jsPDF, options: AutoTableOptions): void;
}
