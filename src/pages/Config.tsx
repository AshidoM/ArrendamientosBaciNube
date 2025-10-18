// src/pages/Config.tsx
import AppShell from "../components/AppShell";

export default function Config() {
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-[18px] font-semibold mb-2">Configuraciones</h1>
        <div className="rounded-[2px] border border-[var(--baci-border)] p-4">Parámetros globales</div>
      </div>
    </AppShell>
  );
}
