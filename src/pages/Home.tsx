// src/pages/Home.tsx
import { useEffect, useState } from "react";
import { getUser, type AppUser } from "../auth";

export default function Home() {
  const [me, setMe] = useState<AppUser | null>(null);
  useEffect(() => { setMe(getUser()); }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-[18px] font-semibold mb-2">Inicio</h1>
      <p className="text-[13px]" style={{ color: "var(--baci-muted)" }}>
        {me ? `Bienvenido, ${me.username}` : "Sesión no detectada"}
      </p>
    </div>
  );
}
