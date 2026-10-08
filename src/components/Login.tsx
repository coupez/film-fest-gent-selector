import { motion } from "motion/react";
import { useState } from "react";
import { USERS, type UserId } from "../../shared/users";
import { Avatar } from "./Icon";

export function Login({ onLogin, posters }: { onLogin: (u: UserId) => Promise<void>; posters: string[] }) {
  const [busy, setBusy] = useState<UserId | null>(null);
  return (
    <div className="login">
      <div className="login-wall" aria-hidden>
        {posters.slice(0, 18).map((p, i) => (
          <motion.img
            key={p}
            src={p}
            alt=""
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.55, scale: 1 }}
            transition={{ delay: 0.04 * i, duration: 0.8 }}
          />
        ))}
      </div>
      <div className="login-shade" />
      <motion.div className="login-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.15 }}>
        <p className="eyebrow">Film Fest Gent · 2026</p>
        <h1 className="brand">
          Reel<em>Match</em>
        </h1>
        <p className="muted">Swipe the festival programme together. When you both like a film, it's a date.</p>
        <h2>Who's swiping?</h2>
        <div className="people">
          {USERS.map((u, i) => (
            <motion.button
              key={u.id}
              className="person"
              style={{ ["--c" as string]: u.color }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
              disabled={!!busy}
              onClick={async () => {
                setBusy(u.id);
                try {
                  await onLogin(u.id);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Avatar name={u.name} color={u.color} size={56} />
              <b>{u.name}</b>
              <small>{u.langs.join(" · ")}</small>
              {busy === u.id && <span className="spinner" />}
            </motion.button>
          ))}
        </div>
        <p className="muted-sm">Email sign-in links coming soon — for now, just tap your name.</p>
      </motion.div>
    </div>
  );
}
