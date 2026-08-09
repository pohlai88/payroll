// PREVIEW — NOT ISSUED watermark shown for DRAFT_PREVIEW documents.
import type { Lang } from "@/domain/derive/i18n/render";

interface DocumentStatusMarkProps {
  readonly documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  readonly lang: Lang;
}

const WATERMARK: Record<Lang, string> = {
  en: "PREVIEW \u2014 NOT ISSUED",
  ms: "PRATONTON \u2014 TIDAK DIKELUARKAN",
};

function DocumentStatusMark({ documentStatus, lang }: DocumentStatusMarkProps) {
  if (documentStatus === "APPROVED" || documentStatus === "CLOSED") {
    return null;
  }
  return (
    <div
      aria-label={WATERMARK[lang]}
      role="img"
      style={{
        position: "fixed",
        top: "40%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-30deg)",
        fontSize: "3rem",
        fontWeight: 700,
        color: "var(--doc-ink-disabled)",
        opacity: 0.35,
        pointerEvents: "none",
        zIndex: 50,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {WATERMARK[lang]}
    </div>
  );
}

export { DocumentStatusMark };
