/** Preset profile pictures, drawn inline. Index 0 is "no picture": the username's first letter. */
const PRESETS = [
  {
    bg: "#209dd7",
    skin: "#f2c9a0",
    hair: "#3b2a20",
    shirt: "#032147",
    style: "short",
  },
  {
    bg: "#753991",
    skin: "#e8b48a",
    hair: "#1f1a17",
    shirt: "#ecad0a",
    style: "long",
  },
  {
    bg: "#ecad0a",
    skin: "#c68b5e",
    hair: "#2b1d14",
    shirt: "#209dd7",
    style: "curly",
  },
  {
    bg: "#032147",
    skin: "#f5d6b8",
    hair: "#b5652b",
    shirt: "#753991",
    style: "bun",
  },
  {
    bg: "#2f9e6e",
    skin: "#8d5a3b",
    hair: "#111111",
    shirt: "#f5f5f5",
    style: "short",
  },
  {
    bg: "#e5674b",
    skin: "#f2c9a0",
    hair: "#d9a441",
    shirt: "#032147",
    style: "long",
  },
  {
    bg: "#5b6ee1",
    skin: "#e0a87c",
    hair: "#5a3a22",
    shirt: "#ecad0a",
    style: "bun",
  },
  {
    bg: "#888888",
    skin: "#f5d6b8",
    hair: "#e8e8e8",
    shirt: "#209dd7",
    style: "curly",
  },
] as const;

export const AVATAR_COUNT = PRESETS.length;

function Hair({ style, color }: { style: string; color: string }) {
  if (style === "long") return <path d="M11 18a9 9 0 0118 0v9h-3.5v-9a5.5 5.5 0 00-11 0v9H11z" fill={color} />;
  if (style === "bun")
    return (
      <>
        <circle cx="20" cy="7.5" r="3.5" fill={color} />
        <path d="M12 17a8 8 0 0116 0c-2.5-3-5-4-8-4s-5.5 1-8 4z" fill={color} />
      </>
    );
  if (style === "curly")
    return (
      <g fill={color}>
        {[13, 16.5, 20, 23.5, 27].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 9.5 : 11} r="3.2" />
        ))}
      </g>
    );
  return <path d="M12 16.5a8 8 0 0116 0c-2-2.5-5-3.5-8-3.5s-6 1-8 3.5z" fill={color} />;
}

export function Avatar({ avatar = 0, username, size = 24 }: { avatar?: number; username: string; size?: number }) {
  const p = PRESETS[avatar - 1];
  if (!p)
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        className="grid shrink-0 place-items-center rounded-full bg-navy font-bold text-white uppercase"
      >
        {username[0]}
      </span>
    );
  return (
    <svg aria-hidden viewBox="0 0 40 40" width={size} height={size} className="shrink-0 rounded-full">
      <rect width="40" height="40" fill={p.bg} />
      <path d="M6 40c1-8 7-12 14-12s13 4 14 12z" fill={p.shirt} />
      <rect x="17.5" y="22" width="5" height="6" fill={p.skin} />
      <circle cx="20" cy="18" r="8" fill={p.skin} />
      <Hair style={p.style} color={p.hair} />
      <circle cx="17" cy="18.5" r="1" fill="#032147" />
      <circle cx="23" cy="18.5" r="1" fill="#032147" />
      <path d="M17.5 21.5q2.5 2 5 0" stroke="#032147" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
