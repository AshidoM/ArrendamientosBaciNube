import { useEffect, useState, useMemo, useCallback } from "react";
import { loginLocal, saveRememberCreds, getRememberCreds, clearRememberCreds } from "../auth";
import { useNavigate } from "react-router-dom";

/* =========================
   Tipos de Changelog (con secciones por pestañas)
========================= */
type ChangeLogTabs = {
  rutasPoblaciones?: string[];   // Rutas & Poblaciones
  clientesAvales?: string[];     // Clientes & Avales
  coordinadoras?: string[];      // Coordinadoras (sección propia)
  operadores?: string[];         // Operadores
  creditos?: string[];           // Créditos
  historial?: string[];          // Historial crediticio
  pagosMultas?: string[];        // Pagos & Multas
  perfil?: string[];             // Perfil (Admin y Capturista)
  admin?: string[];              // Admin (opciones adicionales solo Admin)
};

type ChangeLogEntry = {
  version: string;     // e.g. "0.8"
  date: string;        // "YYYY-MM-DD"
  tabs: ChangeLogTabs; // contenido por pestañas
  fixes?: string[];    // correcciones generales
  notes?: string[];    // notas generales
};

/* =========================
   Changelog embebido (Versión 0.8 — 2025-10-25)
   Puedes reemplazar por /public/changelog.json
========================= */
const EMBEDDED_CHANGELOG: ChangeLogEntry[] = [
  {
    version: "0.11",
    date: "2025-10-25",
    tabs: {
      rutasPoblaciones: [
        "Crear, editar, eliminar y marcar como INACTIVO tanto rutas como poblaciones.",
        "Asignar poblaciones a rutas.",
        "Asignar clientes o coordinadoras a poblaciones."
      ],
      clientesAvales: [
        "Crear y editar clientes.",
        "Vincular avales a cada cliente.",
        "Cargar documentación del cliente y de sus avales.",
        "Marcar clientes como INACTIVO o eliminarlos."
      ],
      coordinadoras: [
        "Crear y editar coordinadoras.",
        "Vincular avales a la coordinadora.",
        "Cargar documentación de coordinadoras.",
        "Marcar como INACTIVO o eliminar."
      ],
      operadores: [
        "Crear, editar y eliminar operadores.",
        "Cargar documentación de operadores.",
        "Asignar operadores a una población.",
        "Marcar operadores como INACTIVO."
      ],
      creditos: [
        "Crear créditos para CLIENTE o COORDINADORA.",
        "Configurar semanas y montos permitidos.",
        "Calcular cuota semanal automáticamente.",
        "Registrar papelería (descontable en el crédito).",
        "Elegir la fecha del primer pago.",
        "Folio automático o manual (personalizable)."
      ],
      historial: [
        "Consultar créditos finalizados (búsqueda por folio, nombre o número de crédito).",
        "Créditos liquidados: panel en modo solo lectura.",
        "Para CAPTURISTA: créditos ajenos en solo lectura."
      ],
      pagosMultas: [
        "Registrar cuotas semanales y cuotas vencidas.",
        "Registrar abonos.",
        "Registrar y gestionar M15 (multas).",
        "Visualización en tiempo real de cuotas, pagos y multas."
      ],
      perfil: [
        "Disponible para Admin y Capturista.",
        "Editar datos generales del usuario.",
        "Subir/actualizar fotografía.",
        "Cargar y gestionar documentos personales."
      ],
      admin: [
        "Usuarios: crear ADMIN o CAPTURISTA.",
        "Asignar rutas y poblaciones a usuarios.",
        "Ver documentos de usuarios y actualizar contraseña."
      ]
    },
    fixes: [
      "Mensajes de error de autenticación más claros.",
      "Pequeños ajustes visuales de consistencia en inputs y botones."
    ],
    notes: [
      "Indicadores de conexión a BD y API en la fase de arranque.",
      "Acceso a notas desde el ícono (ⓘ) del header o con clic en la versión del footer."
    ]
  }
];

/* =========================
   Icono ojo
========================= */
function EyeIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 2l20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10.58 10.74a3 3 0 0 0 2.68 2.68M6.4 6.62C3.9 8.07 2 10.5 2 12c0 1.5 3.6 6 10 6 2.05 0 3.85-.47 5.3-1.26M13.42 13.26A3 3 0 0 0 12 9c-1.66 0-3 1.34-3 3 0 .49.12.95.34 1.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M21.2 16.2C22.33 14.96 23 13.67 23 12c0-1.5-3.6-6-10-6-1.09 0-2.12.12-3.06.33" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.6-6 10-6 10 4.5 10 6-3.6 6-10 6-10-4.5-10-6Z" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

/* =========================
   Insignia / logo
========================= */
function CreditBadgeSmall() {
  return (
    <span className="hero-icon hero-icon--sm" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 6h18a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 20.5 19h-17A2.5 2.5 0 0 1 1 16.5V8a2 2 0 0 1 2-2Zm0 4h18v6.5a.5.5 0 0 1-.5.5h-17a.5.5 0 0 1-.5-.5V10Z"/>
        <rect x="5.5" y="12.25" width="4.5" height="2.5" rx="0.5" fill="white" />
      </svg>
    </span>
  );
}

/* =========================
   Animación de carga inicial
========================= */
function InitialLoadingAnimation({ onComplete }: { onComplete: () => void }) {
  const [dbProgress, setDbProgress] = useState(0);
  const [apiProgress, setApiProgress] = useState(0);
  const [stage, setStage] = useState<'db' | 'api' | 'complete'>('db');

  useEffect(() => {
    const dbInterval = setInterval(() => {
      setDbProgress(prev => {
        if (prev >= 100) {
          clearInterval(dbInterval);
          setStage('api');
          return 100;
        }
        return prev + 10;
      });
    }, 100);
    return () => clearInterval(dbInterval);
  }, []);

  useEffect(() => {
    if (stage === 'api') {
      const apiInterval = setInterval(() => {
        setApiProgress(prev => {
          if (prev >= 100) {
            clearInterval(apiInterval);
            setStage('complete');
            setTimeout(onComplete, 500);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
      return () => clearInterval(apiInterval);
    }
  }, [stage, onComplete]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-white z-50 flex items-center justify-center">
      <div className="text-center max-w-md w-full px-6">
        <div className="mb-8 relative">
          <div className="w-20 h-20 mx-auto bg-white rounded-full shadow-lg flex items-center justify-center transform transition-transform duration-500 hover:scale-110">
            <CreditBadgeSmall />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 border-4 border-blue-200 rounded-full animate-ping opacity-20"></div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Arrendamientos <span style={{ color: "var(--baci-blue)" }}>BACI</span>
        </h2>
        <p className="text-sm text-gray-500 mb-8">Inicializando sistema...</p>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* DB icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-600">
                <path d="M12 2C8 2 4 3.37 4 6v12c0 2.63 4 4 8 4s8-1.37 8-4V6c0-2.63-4-4-8-4Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M4 12c0 2.63 4 4 8 4s8-1.37 8-4M4 6v6M20 6v6" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">Base de Datos</span>
            </div>
            <span className={`text-xs font-semibold ${dbProgress === 100 ? 'text-green-600' : 'text-blue-600'}`}>
              {dbProgress === 100 ? '✓ Conectado' : `${dbProgress}%`}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${dbProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${dbProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* API icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-600">
                <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">API Rest</span>
            </div>
            <span className={`text-xs font-semibold ${apiProgress === 100 ? 'text-green-600' : stage === 'api' ? 'text-blue-600' : 'text-gray-400'}`}>
              {apiProgress === 100 ? '✓ Conectado' : stage === 'api' ? `${apiProgress}%` : 'Esperando...'}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${apiProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${apiProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span>
            {stage === 'db' && 'Conectando a base de datos...'}
            {stage === 'api' && 'Verificando API...'}
            {stage === 'complete' && 'Sistema listo'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Animación post-login
========================= */
function WaterAuthAnimation({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const audio = new Audio('https://oulwsfzfdoxtfhhqcwkq.supabase.co/storage/v1/object/public/Usuarios/SonidoInicio.mp3');
    audio.volume = 0.6;
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration * 1000;
      const timings = [
        { stage: 1, delay: 0 },
        { stage: 2, delay: duration * 0.25 },
        { stage: 3, delay: duration * 0.5 },
        { stage: 4, delay: duration * 0.75 },
        { stage: 5, delay: duration * 0.95 },
      ];
      timings.forEach(({ stage: s, delay }) => setTimeout(() => setStage(s), delay));
      setTimeout(onComplete, duration);
    });
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.currentTime = 0; };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center justify-center gap-12">
        <div className={`relative transition-all duration-700 ${stage >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-500 rounded-full flex items-center justify-center shadow-2xl">
            <div className="scale-150">
              <CreditBadgeSmall />
            </div>
          </div>
          {stage >= 2 && (
            <>
              <div className="absolute inset-0 border-2 border-blue-400 rounded-full animate-ping opacity-40"></div>
              <div className="absolute inset-0 border-2 border-blue-300 rounded-full animate-ping opacity-30" style={{ animationDelay: '300ms' }}></div>
            </>
          )}
        </div>

        <div className={`transition-all duration-700 ${stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className={`w-28 bg-gradient-to-t from-blue-700 via-blue-600 to-blue-500 rounded-t-md shadow-xl relative overflow-hidden transition-all duration-700 ${stage >= 3 ? 'h-32' : 'h-0'}`} style={{ transformOrigin: 'bottom' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
            <div className="grid grid-cols-4 gap-1.5 p-2.5 h-full">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="rounded-sm"
                  style={{
                    backgroundColor: Math.random() > 0.3 ? '#FEF3C7' : '#1E40AF',
                    opacity: Math.random() > 0.2 ? 0.85 : 0.35,
                  }}
                />
              ))}
            </div>
          </div>
          <div className={`w-32 h-1.5 bg-slate-400 rounded-sm mx-auto transition-all duration-500 ${stage >= 3 ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />
        </div>

        <div className={`text-center transition-all duration-700 ${stage >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h3 className="text-3xl font-bold mb-3">
            <span className="text-gray-800">Arrendamientos</span>{' '}
            <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">BACI</span>
          </h3>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-green-500">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Acceso concedido</span>
          </div>
        </div>
      </div>

      <div className={`absolute inset-0 bg-white transition-opacity duration-500 pointer-events-none ${stage >= 5 ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

/* =========================
   Panel lateral de Notas de Versión (con pestañas)
========================= */
function ReleaseNotesPanel({
  open,
  onClose,
  changelog,
}: {
  open: boolean;
  onClose: () => void;
  changelog: ChangeLogEntry[];
}) {
  const [tab, setTab] = useState<keyof ChangeLogTabs>('rutasPoblaciones');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const entry = changelog[0];
  const tabs: { key: keyof ChangeLogTabs; label: string }[] = [
    { key: 'rutasPoblaciones', label: 'Rutas & Poblaciones' },
    { key: 'clientesAvales',   label: 'Clientes & Avales' },
    { key: 'coordinadoras',    label: 'Coordinadoras' },
    { key: 'operadores',       label: 'Operadores' },
    { key: 'creditos',         label: 'Créditos' },
    { key: 'historial',        label: 'Historial crediticio' },
    { key: 'pagosMultas',      label: 'Pagos & Multas' },
    { key: 'perfil',           label: 'Perfil' },
    { key: 'admin',            label: 'Admin (adicionales)' },
  ];

  const items = (entry.tabs[tab] ?? []) as string[];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 h-full w-[min(440px,92vw)] bg-white z-50 shadow-xl border-l border-gray-200 flex flex-col"
        role="dialog"
        aria-label="Notas de versión"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-semibold">i</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">¿Qué hay de nuevo? — v{entry.version}</div>
              <div className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString("es-MX")}</div>
            </div>
          </div>
          <button className="btn-ghost" aria-label="Cerrar" onClick={onClose} title="Cerrar">✕</button>
        </div>

        {/* Tabs */}
        <div className="px-3 pt-3">
          <div role="tablist" aria-label="Secciones de cambios" className="flex flex-wrap gap-2">
            {tabs.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={`px-2.5 py-1.5 text-[12px] rounded border ${tab === t.key ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setTab(t.key)}
                title={t.label}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">
          {items.length ? (
            <ul className="list-disc list-inside text-[13px] text-gray-700 space-y-1">
              {items.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : (
            <p className="text-[13px] text-gray-500">Sin información en esta pestaña.</p>
          )}

          {/* Extras: fixes / notes */}
          {(entry.fixes?.length || entry.notes?.length) && (
            <div className="mt-4 space-y-3">
              {entry.fixes?.length ? (
                <section>
                  <div className="text-xs font-medium text-gray-700">Correcciones</div>
                  <ul className="list-disc list-inside text-[13px] text-gray-700">
                    {entry.fixes.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </section>
              ) : null}
              {entry.notes?.length ? (
                <section>
                  <div className="text-xs font-medium text-gray-700">Notas</div>
                  <ul className="list-disc list-inside text-[13px] text-gray-700">
                    {entry.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>

      </aside>
    </>
  );
}

/* =========================
   Componente principal Login
========================= */
export default function Login() {
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [showAnimation, setShowAnimation] = useState(false);
  const [showInitialLoading, setShowInitialLoading] = useState(true);

  // Notas de versión
  const [notesOpen, setNotesOpen] = useState(false);
  const [changelog, setChangelog] = useState<ChangeLogEntry[]>(EMBEDDED_CHANGELOG);

  // Versión actual
  const currentVersion = useMemo(
    () => (changelog[0]?.version ? changelog[0].version : "0.0.0"),
    [changelog]
  );

  // Cargar credenciales recordadas
  useEffect(() => {
    const creds = getRememberCreds();
    if (creds) {
      setUsername(creds.username);
      setPassword(creds.password);
      setRemember(true);
    }
  }, []);

  // Cargar /changelog.json si existe
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/changelog.json", { cache: "no-store" });
        if (!res.ok) return; // si no existe, se queda el embebido
        const data = (await res.json()) as ChangeLogEntry[] | { entries: ChangeLogEntry[] };
        const entries = Array.isArray(data) ? data : (data as any).entries;
        if (entries?.length && !cancelled) setChangelog(entries);
      } catch {
        // silencio
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleInitialLoadComplete = useCallback(() => {
    setShowInitialLoading(false);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username.trim() || !password.trim()) { setErr("Ingresa usuario y contraseña."); return; }
    setLoading(true);
    try {
      await loginLocal(username.trim(), password, remember);
      if (remember) saveRememberCreds(username.trim(), password);
      else clearRememberCreds();
      setShowAnimation(true);
    } catch (error: any) {
      setErr(error?.message ?? "Error al iniciar sesión");
      setLoading(false);
    }
  }

  const handleAnimationComplete = () => { nav("/", { replace: true }); };

  // Abrir/cerrar notas
  const openNotes = useCallback(() => setNotesOpen(true), []);
  const closeNotes = useCallback(() => setNotesOpen(false), []);

  return (
    <>
      {showInitialLoading && <InitialLoadingAnimation onComplete={handleInitialLoadComplete} />}
      {showAnimation && <WaterAuthAnimation onComplete={handleAnimationComplete} />}

      <div className="min-h-dvh grid place-items-center px-4">
        <div className="auth-card relative">
          {/* Botón flotante esquina superior derecha (ⓘ) */}
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Notas de versión"
            title="¿Qué hay de nuevo?"
            onClick={openNotes}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 17v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="7" r="1" fill="currentColor"/>
            </svg>
          </button>

          <div className="card-header">
            <CreditBadgeSmall />
            <h1 className="card-title">
              Arrendamientos <span className="t-blue">BACI</span>
            </h1>
            <p className="card-sub">Inicia sesión para continuar</p>
          </div>

          <form onSubmit={onSubmit} className="auth-form">
            <div className="field">
              <label className="label">Usuario</label>
              <div className="control">
                <span className="left-icon" aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.33 0-8 2.17-8 4.5V21h16v-2.5C20 16.17 16.33 14 12 14Z" />
                  </svg>
                </span>
                <input
                  className="input"
                  placeholder="tu.usuario"
                  autoFocus
                  value={username}
                  onChange={(e)=>setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Contraseña</label>
              <div className="control">
                <span className="left-icon" aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 8V7a5 5 0 0 0-10 0v1H5v13h14V8Zm-8 0V7a3 3 0 0 1 6 0v1Z"/>
                  </svg>
                </span>
                <input
                  className="input pr-24"
                  placeholder="••••••••"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={()=>setShow(s=>!s)}
                  className="btn-ghost reveal"
                  tabIndex={-1}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <EyeIcon on={show}/>
                </button>
              </div>
            </div>

            <div className="opts">
              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e)=>{
                    setRemember(e.target.checked);
                    if(!e.target.checked) clearRememberCreds();
                  }}
                />
                Recordarme
              </label>
              <span className="spacer"/>
            </div>

            {err && <div className="alert alert--error">{err}</div>}

            <button type="submit" disabled={loading} className="btn-primary btn--sm w-full justify-center">
              {loading ? "Entrando…" : "Entrar"}
            </button>

            <div className="copy">
              <span>© {new Date().getFullYear()} Arrendamientos BACI</span>
              {/* Versión clicable (abre notas) */}
              <span
                role="button"
                tabIndex={0}
                onClick={openNotes}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openNotes()}
                className="text-xs text-gray-500 ml-2 underline underline-offset-2 cursor-pointer"
                title="Ver novedades — 25/10/2025"
                aria-label="Ver novedades de la versión"
              >
                v{currentVersion}
              </span>
            </div>
          </form>

          {/* Panel de Notas de Versión */}
          <ReleaseNotesPanel
            open={notesOpen}
            onClose={closeNotes}
            changelog={changelog}
          />
        </div>
      </div>
    </>
  );
}
