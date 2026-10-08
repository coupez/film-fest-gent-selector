const PATHS: Record<string, string> = {
  heart:
    "M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 4.5 6.9 4.5c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3 3.9 0 5.9 3.9 4.5 7.2C19.5 16.4 12 21 12 21z",
  x: "M6 6l12 12M18 6L6 18",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11",
  info: "M12 16v-5M12 8h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  pin: "M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  ticket:
    "M4 7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V7zM14 5v12",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  cards: "M8 4h11a1 1 0 011 1v13M5 7h11a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  speech: "M4 5h16v11H9l-5 4V5z",
  cc: "M3 6a1 1 0 011-1h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM10.5 10.2A2.5 2.5 0 007 11v2a2.5 2.5 0 003.5.8M17.5 10.2A2.5 2.5 0 0014 11v2a2.5 2.5 0 003.5.8",
  logout: "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4",
  play: "M8 5.5v13l11-6.5-11-6.5z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
};

export function Icon({ name, size = 20, fill = false, stroke = 2, className }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Avatar({ name, color, size = 32, online }: { name: string; color: string; size?: number; online?: boolean }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, ["--c" as string]: color }}>
      {name[0]}
      {online !== undefined && <i className={`presence ${online ? "on" : ""}`} />}
    </span>
  );
}
