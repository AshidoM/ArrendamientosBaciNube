// src/components/ImportSelectSheets.tsx
import { useMemo, useRef, useState } from "react";
import { parseFileToStage } from "../services/import/xlsx.reader";
import type { StageWorkbook } from "../services/import/contract";

type Props = {
  onParsed: (workbook: StageWorkbook) => void;
};

export default function ImportSelectSheets({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<StageWorkbook | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      const pwb = await parseFileToStage(f);
      setParsed(pwb);
      setFileName(f.name);
      setSelectedNames(pwb.sheets.map(s => s.sheetName)); // por defecto todas
    } finally {
      setLoading(false);
    }
  }

  const allChecked = useMemo(() => {
    const total = parsed?.sheets.length ?? 0;
    if (!total) return false;
    return selectedNames.length === total;
  }, [parsed, selectedNames]);

  function toggleAll(val: boolean) {
    if (!parsed) return;
    setSelectedNames(val ? parsed.sheets.map(s => s.sheetName) : []);
  }

  function toggle(name: string, val: boolean) {
    setSelectedNames(prev => {
      const set = new Set(prev);
      if (val) set.add(name); else set.delete(name);
      return Array.from(set);
    });
  }

  function continueClick() {
    if (!parsed) return;
    const filtered: StageWorkbook = {
      ...parsed,
      sheets: parsed.sheets.filter(s => selectedNames.includes(s.sheetName)),
    };
    onParsed(filtered);
  }

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFile}
        />
        {fileName && <span className="text-[13px]">Archivo: <b>{fileName}</b></span>}
      </div>

      {!parsed && !loading && (
        <div className="text-[13px] mt-3 text-gray-600">Selecciona un XLSX/CSV para empezar.</div>
      )}

      {loading && <div className="mt-4 text-[13px]">Leyendo archivo…</div>}

      {parsed && (
        <>
          <div className="mt-4 text-[13px] font-medium">Hojas detectadas: {parsed.sheets.length}</div>
          <div className="mt-2 border rounded-[2px] overflow-hidden">
            {parsed.sheets.map((s) => (
              <label key={s.sheetName} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedNames.includes(s.sheetName)}
                    onChange={(e) => toggle(s.sheetName, e.target.checked)}
                  />
                  <span className="text-[13px]">{s.sheetName}</span>
                </span>
                <span className="text-[12px] opacity-70">{s.rows.length} filas</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3 text-[13px]">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => toggleAll(true)}>Marcar todas</button>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => toggleAll(false)}>Desmarcar</button>
            </div>
            <button
              className="btn-primary !h-8 !px-3 text-xs"
              disabled={!parsed.sheets.length || !selectedNames.length}
              onClick={continueClick}
            >
              Continuar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
