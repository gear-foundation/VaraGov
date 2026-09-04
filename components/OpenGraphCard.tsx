import type { ReferendumShareData } from "@/lib/server/share-metadata";

const colors = {
  paper: "#f8fbf8",
  ink: "#101612",
  muted: "#5d6c65",
  accent: "#00e6ad",
  accentInk: "#007a61",
  line: "#cbd9d2",
  soft: "#e2f8f0",
};

export function OpenGraphCard({
  title,
  description,
  eyebrow,
  badge,
  number,
}: ReferendumShareData) {
  const titleSize = title.length > 72 ? 48 : title.length > 42 ? 56 : 66;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        background: colors.paper,
        color: colors.ink,
        padding: "58px 68px 48px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 590,
          height: 590,
          right: -105,
          top: -250,
          border: `2px solid ${colors.line}`,
          borderRadius: "50%",
          opacity: 0.55,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 430,
          height: 430,
          right: -25,
          top: -170,
          border: `2px solid ${colors.line}`,
          borderRadius: "44% 56% 48% 52%",
          opacity: 0.55,
          transform: "rotate(18deg)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          right: 50,
          top: -95,
          border: `2px solid ${colors.accentInk}`,
          borderRadius: "52% 48% 58% 42%",
          opacity: 0.13,
          transform: "rotate(-15deg)",
          display: "flex",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: `3px solid ${colors.accent}`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "white",
              fontSize: 29,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ display: "flex", fontSize: 31, fontWeight: 700 }}>
            Vara<span style={{ color: colors.accentInk }}>Gov</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: "9px 17px",
            border: `1px solid ${colors.line}`,
            borderRadius: 999,
            background: "rgba(255,255,255,0.78)",
            color: colors.accentInk,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {badge}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: "88%" }}>
        <div
          style={{
            display: "flex",
            color: colors.accentInk,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 17,
            fontSize: titleSize,
            lineHeight: 1.04,
            fontWeight: 700,
            letterSpacing: "-0.035em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            color: colors.muted,
            fontSize: 25,
            lineHeight: 1.35,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${colors.line}`,
          paddingTop: 20,
          color: colors.muted,
          fontSize: 18,
        }}
      >
        <div style={{ display: "flex" }}>opengov.vara.network</div>
        {number !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              color: colors.accentInk,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "flex",
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: colors.accent,
              }}
            />
            No. {number}
          </div>
        )}
      </div>
    </div>
  );
}
