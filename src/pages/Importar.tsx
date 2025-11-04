// src/pages/Importar.tsx
import React, { useState } from "react";
import ImportSelectSheets from "../components/ImportSelectSheets";
import ImportWizardModal from "../components/ImportWizardModal";
import type { StageWorkbook } from "../services/import/contract";

export default function Importar() {
  const [open, setOpen] = useState(false);
  const [wb, setWb] = useState<StageWorkbook | null>(null);

  function handleParsed(workbook: StageWorkbook) {
    setWb(workbook);
    setOpen(true);
  }

  return (
    <div className="p-4">
      <ImportSelectSheets onParsed={handleParsed} />
      {open && wb && (
        <ImportWizardModal
          open={open}
          onClose={() => setOpen(false)}
          workbook={wb}
          onCommitted={(p) => console.log("Resumen commit:", p)}
        />
      )}
    </div>
  );
}
