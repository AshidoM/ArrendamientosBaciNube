// src/components/DocumentsTable.tsx
import React from "react";
import DataTable from "./DataTable"; // ⟵ default import (corrección)
import { Eye, ExternalLink, Trash2 } from "lucide-react";

export type DocItem = {
  name: string;
  path: string;
  url: string;
  size?: number;
  updated_at?: string;
};

type Props = {
  docs: DocItem[];
  onView: (d: DocItem) => void;
  onOpenTab: (d: DocItem) => void;
  onDelete: (d: DocItem) => void;
  searchPlaceholder?: string;
};

export default function DocumentsTable({
  docs,
  onView,
  onOpenTab,
  onDelete,
  searchPlaceholder = "Buscar documento…",
}: Props) {
  return (
    <div className="mt-2"> {/* leve ajuste para alinear con el botón */}
      <DataTable<DocItem>
        rows={docs}
        getRowId={(d) => d.path}
        enableSearch
        searchPlaceholder={searchPlaceholder}
        // 5 / 8 / 10 / 15 filas (usa el componente DataTable que ya trae esos estilos)
        autoRows={false}
        pageSize={10}
        columns={[
          {
            key: "name",
            header: "Documento",
            spanClass: "col-span-12 sm:col-span-6",
            render: (d) => (
              <div className="truncate">{d.name}</div>
            ),
          },
          {
            key: "updated_at",
            header: "Actualizado",
            spanClass: "col-span-6 sm:col-span-3",
            render: (d) =>
              d.updated_at
                ? new Date(d.updated_at).toLocaleString()
                : "—",
          },
          {
            key: "size",
            header: "Tamaño",
            spanClass: "col-span-6 sm:col-span-2",
            render: (d) => (d.size ? formatBytes(d.size) : "—"),
          },
        ]}
        primaryAction={{
          label: "Ver",
          icon: <Eye className="w-3.5 h-3.5" />,
          onClick: onView,
          buttonClassName: "btn-primary !h-8 !px-2 text-xs",
        }}
        menuActions={[
          {
            key: "tab",
            label: (
              <span className="inline-flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5" /> Pestaña
              </span>
            ) as unknown as string,
            onClick: onOpenTab,
          },
          {
            key: "del",
            label: (
              <span className="inline-flex items-center gap-2 text-red-700">
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </span>
            ) as unknown as string,
            onClick: onDelete,
          },
        ]}
      />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
