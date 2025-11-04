// src/components/ImportLauncher.tsx
import { useState } from "react";
import ImportSelectSheets from "./ImportSelectSheets";
import { parseFile, type ParsedWorkbook } from "../services/import/xlsx.reader";
import { buildStaging } from "../services/import/staging";
import ImportWizardModal from "./ImportWizardModal";
import type { StageWorkbook } from "../services/import/contract";

export default function ImportLauncher() {
  const [staging, setStaging] = useState<StageWorkbook | null>(null);
  const [open, setOpen] = useState(false);

  async function handleParsed(pw: ParsedWorkbook) {
    const st = await buildStaging(pw);
    setStaging(st);
    setOpen(true);
  }

  return (
    <>
      <ImportSelectSheets onParsed={handleParsed} />
      {staging && (
        <ImportWizardModal
          open={open}
          onClose={()=>setOpen(false)}
          workbook={staging}
        />
      )}
    </>
  );
}
