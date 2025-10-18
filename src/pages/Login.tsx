import { useEffect, useState } from "react";
import { loginLocal, saveRememberCreds, getRememberCreds, clearRememberCreds } from "../auth";
import { useNavigate } from "react-router-dom";

/* icono ojo */
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

/* insignia */
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

/* Componente de animación de agua */
function WaterAuthAnimation({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const stages = [0, 1, 2, 3];
    stages.forEach((s, i) => {
      setTimeout(() => setStage(s), i * 800);
    });
    setTimeout(onComplete, 3200);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        {/* Contenedor de olas */}
        <div className="relative w-32 h-32 mx-auto mb-6">
          {/* Onda base */}
          <div className="absolute inset-0 rounded-full border-4 border-blue-200/30"></div>
          
          {/* Olas animadas */}
          <div className={`absolute inset-0 rounded-full border-4 border-[var(--baci-blue)] transition-all duration-1000 ${
            stage >= 1 ? 'scale-110 opacity-40' : 'scale-100 opacity-0'
          }`}></div>
          
          <div className={`absolute inset-0 rounded-full border-4 border-[var(--baci-blue)] transition-all duration-1000 ${
            stage >= 2 ? 'scale-125 opacity-20' : 'scale-100 opacity-0'
          }`}></div>
          
          <div className={`absolute inset-0 rounded-full border-4 border-[var(--baci-blue)] transition-all duration-1000 ${
            stage >= 3 ? 'scale-140 opacity-10' : 'scale-100 opacity-0'
          }`}></div>
          
          {/* Icono central */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`transition-all duration-500 ${
              stage >= 3 ? 'scale-110' : 'scale-100'
            }`}>
              <CreditBadgeSmall />
            </div>
          </div>
        </div>

        {/* Texto animado */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-800">
            <span className={`inline-block transition-all duration-500 ${
              stage >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}>Arrendamientos</span>{' '}
            <span className={`inline-block transition-all duration-500 delay-200 ${
              stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`} style={{ color: "var(--baci-blue)" }}>BACI</span>
          </h3>
          <p className={`text-sm text-gray-600 transition-all duration-500 delay-400 ${
            stage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}>
            Autenticación correcta
          </p>
        </div>

        {/* Puntos de carga */}
        <div className="flex justify-center mt-4 space-x-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full bg-[var(--baci-blue)] transition-all duration-300 ${
                stage > i ? 'opacity-100' : 'opacity-30'
              }`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    const creds = getRememberCreds();
    if (creds) { setUsername(creds.username); setPassword(creds.password); setRemember(true); }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username.trim() || !password.trim()) { setErr("Ingresa usuario y contraseña."); return; }
    setLoading(true);
    try {
      await loginLocal(username.trim(), password, remember);
      if (remember) saveRememberCreds(username.trim(), password); else clearRememberCreds();
      
      // Mostrar animación antes de navegar
      setShowAnimation(true);
    } catch (error: any) {
      setErr(error?.message ?? "Error al iniciar sesión");
      setLoading(false);
    }
  }

  const handleAnimationComplete = () => {
    nav("/", { replace: true });
  };

  return (
    <>
      {showAnimation && <WaterAuthAnimation onComplete={handleAnimationComplete} />}
      
      <div className="min-h-dvh grid place-items-center px-4">
        <div className="auth-card">
          <div className="card-header">
            <CreditBadgeSmall />
            <h1 className="card-title">Arrendamientos <span className="t-blue">BACI</span></h1>
            <p className="card-sub">Inicia sesión para continuar</p>
          </div>

          <form onSubmit={onSubmit} className="auth-form">
            <div className="field">
              <label className="label">Usuario111</label>
              <div className="control">
                <span className="left-icon" aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.33 0-8 2.17-8 4.5V21h16v-2.5C20 16.17 16.33 14 12 14Z" /></svg>
                </span>
                <input className="input" placeholder="tu.usuario" autoFocus value={username} onChange={(e)=>setUsername(e.target.value)}/>
              </div>
            </div>

            <div className="field">
              <label className="label">Contraseña</label>
              <div className="control">
                <span className="left-icon" aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8V7a5 5 0 0 0-10 0v1H5v13h14V8Zm-8 0V7a3 3 0 0 1 6 0v1Z"/></svg>
                </span>
                <input className="input pr-24" placeholder="••••••••" type={show ? "text" : "password"} value={password} onChange={(e)=>setPassword(e.target.value)}/>
                <button type="button" onClick={()=>setShow(s=>!s)} className="btn-ghost reveal" tabIndex={-1} aria-label={show?"Ocultar contraseña":"Mostrar contraseña"} title={show?"Ocultar contraseña":"Mostrar contraseña"}>
                  <EyeIcon on={show}/>
                </button>
              </div>
            </div>

            <div className="opts">
              <label className="remember">
                <input type="checkbox" checked={remember} onChange={(e)=>{ setRemember(e.target.checked); if(!e.target.checked) clearRememberCreds(); }}/>
                Recordarme
              </label>
              <span className="spacer"/>
            </div>

            {err && <div className="alert alert--error">{err}</div>}

            {/* botón compacto estándar */}
            <button type="submit" disabled={loading} className="btn-primary btn--sm w-full justify-center">
              {loading ? "Entrando…" : "Entrar"}
            </button>

            <div className="copy">© {new Date().getFullYear()} Arrendamientos BACI</div>
          </form>
        </div>
      </div>
    </>
  );
}