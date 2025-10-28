// src/components/SelectAvalesModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, FileUp, ExternalLink, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import { useConfirm, useToast } from "../components/Confirm";

type PersonaTipo = "CLIENTE" | "COORDINADORA";

type Aval = {
  id: number;
  folio: string | null;
  nombre: string;
  estado: "ACTIVO" | "INACTIVO";
  ine: string | null;
  telefono: string | null;
  direccion: string | null;
  created_at?: string;
};

type DocRow = {
  id: number;
  tipo_doc: "INE" | "COMPROBANTE" | "OTRO";
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export default function SelectAvalesModal({
  personaTipo,
  personaId,
  onClose,
  onChanged,
}: {
  personaTipo: PersonaTipo;
  personaId: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  const [mode, setMode] = useState<"buscar" | "crear">("buscar");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Aval[]>([]);
  const [openDrop, setOpenDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searched, setSearched] = useState(false);

  const [asignados, setAsignados] = useState<Aval[]>([]);
  const [saving, setSaving] = useState(false);

  const [cNombre, setCNombre] = useState("");
  const [cINE, setCINE] = useState("");
  const [cTel, setCTel] = useState("");
  const [cDir, setCDir] = useState("");

  const [editAval, setEditAval] = useState<Aval | null>(null);

  useEffect(() => {
    loadAsignados();
    const onDocClick = (e: MouseEvent) => {
      if (!openDrop) return;
      const t = e.target as Node;
      if (
        dropRef.current &&
        !dropRef.current.contains(t) &&
        inputRef.current &&
        !inputRef.current.contains(t)
      ) {
        setOpenDrop(false);
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const run = async () => {
      const term = q.trim();
      if (term.length < 1) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoadingSearch(true);
      setSearched(true);
      try {
        let query = supabase
          .from("avales")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        query = query.or(
          `nombre.ilike.%${term}%,ine.ilike.%${term}%,folio.ilike.%${term}%`
        );
        const { data, error } = await query;
        if (!error) setResults((data || []) as Aval[]);
      } finally {
        setLoadingSearch(false);
      }
    };
    const t = setTimeout(run, 180);
    return () => clearTimeout(t);
  }, [q]);

  async function loadAsignados() {
    if (personaTipo === "CLIENTE") {
      const { data } = await supabase
        .from("cliente_avales")
        .select(
          "aval_id, avales:aval_id (id, folio, nombre, estado, ine, telefono, direccion)"
        )
        .eq("cliente_id", personaId);
      setAsignados(
        ((data || []) as any[]).map((d) => d.avales).filter(Boolean)
      );
    } else {
      const { data } = await supabase
        .from("coordinadora_avales")
        .select(
          "aval_id, avales:aval_id (id, folio, nombre, estado, ine, telefono, direccion)"
        )
        .eq("coordinadora_id", personaId);
      setAsignados(
        ((data || []) as any[]).map((d) => d.avales).filter(Boolean)
      );
    }
  }

  const ya = useMemo(() => new Set(asignados.map((a) => a.id)), [asignados]);

  async function attachAval(avalId: number) {
    const ok = await confirm({
      title: "Añadir aval",
      message: "¿Seguro que quieres añadir este aval?",
      confirmText: "Añadir",
      tone: "default",
    });
    if (!ok) return;
    setSaving(true);
    try {
      if (personaTipo === "CLIENTE") {
        const { error } = await supabase
          .from("cliente_avales")
          .insert({ cliente_id: personaId, aval_id: avalId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("coordinadora_avales")
          .insert({ coordinadora_id: personaId, aval_id: avalId });
        if (error) throw error;
      }
      await loadAsignados();
      onChanged?.();
      toast("Aval añadido correctamente.");
      setOpenDrop(false);
      setQ("");
    } catch (e: any) {
      toast(e?.message ?? "No se pudo añadir el aval.", "Error");
    } finally {
      setSaving(false);
    }
  }

  async function detachAval(avalId: number) {
    const ok = await confirm({
      title: "Quitar aval",
      message: "¿Quitar este aval? No elimina el registro, solo lo desasigna.",
      confirmText: "Quitar",
      tone: "warn",
    });
    if (!ok) return;
    setSaving(true);
    try {
      if (personaTipo === "CLIENTE") {
        const { error } = await supabase
          .from("cliente_avales")
          .delete()
          .eq("cliente_id", personaId)
          .eq("aval_id", avalId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("coordinadora_avales")
          .delete()
          .eq("coordinadora_id", personaId)
          .eq("aval_id", avalId);
        if (error) throw error;
      }
      await loadAsignados();
      onChanged?.();
      toast("Aval quitado.");
    } catch (e: any) {
      toast(e?.message ?? "No se pudo quitar el aval.", "Error");
    } finally {
      setSaving(false);
    }
  }

  async function createAvalAndAttach() {
    if (!cNombre.trim()) {
      toast("Nombre es requerido.", "Atención");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("avales")
        .insert({
          nombre: cNombre.trim(),
          ine: cINE || null,
          telefono: cTel || null,
          direccion: cDir || null,
          estado: "ACTIVO",
        })
        .select("id")
        .single();
      if (error) throw error;
      await attachAval(data!.id as number);
      setCNombre("");
      setCINE("");
      setCTel("");
      setCDir("");
      setMode("buscar");
    } catch (e: any) {
      toast(e?.message ?? "No se pudo crear el aval.", "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal">
      {/* SCOPING ROOT: todo el estilo nuevo está bajo este id */}
      <div id="select-avales" className="modal-card modal-card-md">
        {/* HEAD */}
        <div className="sa__headbar modal-head">
          <div className="sa__title">Avales ({personaTipo === "CLIENTE" ? "Cliente" : "Coordinadora"})</div>
          <button type="button" className="btn-outline btn--sm" onClick={onClose}>
            <X size={16} /> Cerrar
          </button>
        </div>

        {/* TABS */}
        <div className="sa__tabs">
          <button
            type="button"
            className={`sa__tab ${mode === "buscar" ? "nav-active" : ""}`}
            onClick={() => setMode("buscar")}
            aria-pressed={mode === "buscar"}
          >
            Buscar
          </button>
          <span className="sa__tab-sep">|</span>
          <button
            type="button"
            className={`sa__tab ${mode === "crear" ? "nav-active" : ""}`}
            onClick={() => setMode("crear")}
            aria-pressed={mode === "crear"}
          >
            Crear nuevo
          </button>
        </div>

        {/* BODY GRID: izquierda más angosta, derecha más ancha */}
        <div className="sa">
          {/* IZQUIERDA */}
          <div className="sa__left">
            {mode === "buscar" ? (
              <div className="sa__section">
                <label className="sa__label-block">
                  <div className="sa__label">Buscar aval (nombre, INE o folio)</div>
                  <input
                    ref={inputRef}
                    className="input input--sm"
                    placeholder="Ej. Juan, INE123, AV-10..."
                    value={q}
                    onFocus={() => setOpenDrop(true)}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setOpenDrop(true);
                    }}
                  />
                </label>

                {openDrop && (
                  <div ref={dropRef} className="sa__dropdown" role="listbox" aria-label="Resultados de búsqueda">
                    {loadingSearch ? (
                      <div className="sa__dropmsg">Buscando…</div>
                    ) : !searched ? (
                      <div className="sa__dropmsg">Escribe para buscar.</div>
                    ) : results.length === 0 ? (
                      <div className="sa__dropmsg">Sin resultados.</div>
                    ) : (
                      <ul className="sa__droplist">
                        {results.map((a) => (
                          <li key={a.id} className="sa__dropitem">
                            <div className="sa__iteminfo">
                              <div className="sa__itemtitle">{a.nombre}</div>
                              <div className="sa__itemsub">
                                Folio: {a.folio ?? "—"} {a.ine ? `• INE: ${a.ine}` : ""}{" "}
                                {a.telefono ? `• Tel: ${a.telefono}` : ""}
                              </div>
                            </div>
                            <div className="sa__row-actions">
                              <DocsAvalButton avalId={a.id} />
                              {ya.has(a.id) ? (
                                <button type="button" className="btn-outline btn--sm" disabled title="Ya asignado">
                                  Ya asignado
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-primary btn--sm"
                                  onClick={() => attachAval(a.id)}
                                  disabled={saving}
                                >
                                  <Plus size={16} /> Añadir
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="sa__section">
                <div className="sa__label">Crear y asignar</div>
                <div className="sa__formgrid">
                  <label className="sa__label-block">
                    <div className="sa__label">Nombre*</div>
                    <input className="input input--sm" value={cNombre} onChange={(e) => setCNombre(e.target.value)} />
                  </label>
                  <label className="sa__label-block">
                    <div className="sa__label">INE</div>
                    <input className="input input--sm" value={cINE} onChange={(e) => setCINE(e.target.value)} />
                  </label>
                  <label className="sa__label-block">
                    <div className="sa__label">Teléfono</div>
                    <input className="input input--sm" value={cTel} onChange={(e) => setCTel(e.target.value)} />
                  </label>
                  <label className="sa__label-block sa__colspan2">
                    <div className="sa__label">Dirección</div>
                    <input className="input input--sm" value={cDir} onChange={(e) => setCDir(e.target.value)} />
                  </label>
                </div>
                <div className="sa__create-actions">
                  <button type="button" className="btn-primary btn--sm" disabled={saving} onClick={createAvalAndAttach}>
                    <Plus size={16} /> Crear y añadir
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DERECHA */}
          <div className="sa__right">
            <div className="sa__righthead">Avales asignados</div>
            {asignados.length === 0 ? (
              <div className="sa__empty">Ninguno asignado.</div>
            ) : (
              <div className="sa__tablewrap">
                <table className="sa__table">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Nombre</th>
                      <th>INE</th>
                      <th>Teléfono</th>
                      <th className="sa__th-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asignados.map((a) => (
                      <tr key={a.id}>
                        <td>{a.folio ?? "—"}</td>
                        <td>{a.nombre}</td>
                        <td>{a.ine ?? "—"}</td>
                        <td>{a.telefono ?? "—"}</td>
                        <td className="sa__td-right">
                          <div className="sa__table-actions">
                            <button type="button" className="btn-outline btn--sm" onClick={() => setEditAval(a)}>
                              <Pencil size={16} /> Editar
                            </button>
                            <DocsAvalButton avalId={a.id} />
                            <button
                              type="button"
                              className="btn-outline btn--sm"
                              onClick={() => detachAval(a.id)}
                              disabled={saving}
                            >
                              <Trash2 size={16} /> Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {editAval && (
          <AvalEditModal
            aval={editAval}
            onClose={() => setEditAval(null)}
            onSaved={async () => {
              setEditAval(null);
              await loadAsignados();
              toast("Aval actualizado.");
            }}
          />
        )}

        {ConfirmUI}
        {ToastUI}
      </div>
    </div>
  );
}

/* ---------- Botón + modal de Documentos ---------- */
function DocsAvalButton({ avalId }: { avalId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-outline btn--sm" onClick={() => setOpen(true)} title="Documentos del aval">
        <FileUp size={16} /> Docs
      </button>
      {open && <DocsAvalModal avalId={avalId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocsAvalModal({ avalId, onClose }: { avalId: number; onClose: () => void }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast] = useToast();
  const [confirm, ConfirmUI] = useConfirm();

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDocs() {
    const { data } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "AVAL")
      .eq("persona_id", avalId)
      .order("created_at", { ascending: false });
    setDocs((data || []) as any);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") {
      return toast("Sólo PDF.", "Atención");
    }
    setFile(f);
    setName(f.name.replace(/\.pdf$/i, ""));
  }

  async function upload() {
    if (!file) return;
    const clean = (name || "documento")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const final = `${clean}.pdf`;
    const path = `Personas/AVAL/${avalId}/${final}`;
    try {
      setSaving(true);
      setPct(10);
      const { error } = await supabase.storage
        .from("Personas")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      setPct(90);
      const url = getPublicUrl(path);
      await supabase.from("docs_personas").insert({
        persona_tipo: "AVAL",
        persona_id: avalId,
        tipo_doc: "OTRO",
        url,
        mime_type: "application/pdf",
        size_bytes: file.size,
      });
      setPct(100);
      await loadDocs();
      setTimeout(() => {
        setFile(null);
        setName("");
        setPct(null);
      }, 250);
      toast("Documento subido.");
    } catch (e: any) {
      toast(e?.message ?? "No se pudo subir.", "Error");
    } finally {
      setSaving(false);
    }
  }

  async function delDoc(d: DocRow) {
    const ok = await confirm({
      title: "Eliminar documento",
      message: "¿Eliminar este documento?",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const key = new URL(d.url).pathname.replace(
        /^\/storage\/v1\/object\/public\//,
        ""
      );
      await supabase.storage.from("Personas").remove([key]);
    } catch {
      /* ignore */
    }
    await supabase.from("docs_personas").delete().eq("id", d.id);
    await loadDocs();
    toast("Documento eliminado.");
  }

  return (
    <div className="modal">
      {ConfirmUI}
      <div className="modal-card modal-card-md" id="select-avales-docs">
        <div className="sa__headbar modal-head">
          <div className="sa__title">Documentos del aval</div>
          <button type="button" className="btn-outline btn--sm" onClick={onClose}>
            <X size={16} /> Cerrar
          </button>
        </div>
        <div className="sa__section">
          <div className="sa__docsbar">
            <label className="btn-outline btn--sm">
              Elegir PDF
              <input type="file" hidden accept="application/pdf" onChange={onPick} />
            </label>
            <input
              className="input input--sm"
              placeholder="Nombre del documento"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="button" className="btn-primary btn--sm" disabled={!file || saving} onClick={upload}>
              <FileUp size={16} /> Subir
            </button>
          </div>
          {pct !== null && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="sa__tablewrap">
            {docs.length === 0 ? (
              <div className="sa__empty">Sin documentos.</div>
            ) : (
              <ul className="sa__docslist">
                {docs.map((d) => (
                  <li key={d.id} className="sa__docitem">
                    <div className="sa__iteminfo">
                      <div className="sa__itemtitle">{d.url.split("/").pop()}</div>
                      <div className="sa__itemsub">{d.tipo_doc}</div>
                    </div>
                    <div className="sa__row-actions">
                      <a className="btn-outline btn--sm" href={d.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} /> Abrir
                      </a>
                      <button type="button" className="btn-outline btn--sm" onClick={() => delDoc(d)}>
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Edición Exprés ---------- */
function AvalEditModal({
  aval,
  onClose,
  onSaved,
}: {
  aval: Aval;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Aval>(aval);
  const [saving, setSaving] = useState(false);
  const [confirm] = useConfirm();
  const [toast] = useToast();

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("avales")
        .update({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado,
        })
        .eq("id", form.id);
      if (error) throw error;
      onSaved();
    } catch (e: any) {
      toast(e?.message ?? "No se pudo guardar el aval.", "Error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEstado() {
    const want = form.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO",
      message: `¿Seguro que quieres marcar a ${form.nombre} como ${want}?`,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    setForm((s) => ({ ...s, estado: want as any }));
  }

  return (
    <div className="modal">
      <div className="modal-card modal-card-md" id="select-avales-edit">
        <div className="sa__headbar modal-head">
          <div className="sa__title">Editar aval</div>
          <button type="button" className="btn-outline btn--sm" onClick={onClose}>
            <X size={16} /> Cerrar
          </button>
        </div>
        <div className="sa__section">
          <div className="sa__formgrid">
            <label className="sa__label-block">
              <div className="sa__label">Nombre</div>
              <input
                className="input input--sm"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </label>
            <label className="sa__label-block">
              <div className="sa__label">INE</div>
              <input
                className="input input--sm"
                value={form.ine ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ine: e.target.value }))}
              />
            </label>
            <label className="sa__label-block">
              <div className="sa__label">Teléfono</div>
              <input
                className="input input--sm"
                value={form.telefono ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </label>
            <label className="sa__label-block sa__colspan2">
              <div className="sa__label">Dirección</div>
              <input
                className="input input--sm"
                value={form.direccion ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              />
            </label>
            <label className="sa__label-block">
              <div className="sa__label">Estado</div>
              <div className="sa__inline">
                <select
                  className="input input--sm"
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as any }))}
                >
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
                <button type="button" className="btn-outline btn--sm" onClick={toggleEstado}>
                  Cambiar
                </button>
              </div>
            </label>
          </div>
          <div className="sa__footer-right">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primary btn--sm" onClick={save} disabled={saving}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
