import Image from "next/image";

// Compact VaraGov mark. Its dimensions stay stable across the header and dialogs.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="18" cy="18" r="16.5" stroke="var(--accent)" strokeWidth="1.6" />
      <circle
        cx="18"
        cy="18"
        r="13.4"
        stroke="var(--accent)"
        strokeWidth="0.7"
        opacity="0.75"
      />
      <path
        d="M11.4 11.5 L18 25.5 L24.6 11.5"
        stroke="var(--ink)"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="8.6" r="1.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="relative block h-10 w-[102px] overflow-hidden" aria-hidden="true">
      <Image
        src="/brand/varagov-wordmark-light.jpg"
        alt=""
        width={1150}
        height={450}
        priority
        className="h-10 w-[102px] object-contain dark:hidden"
      />
      <Image
        src="/brand/varagov-wordmark-dark.png"
        alt=""
        width={920}
        height={360}
        priority
        className="hidden h-10 w-[102px] object-contain dark:block"
      />
    </span>
  );
}
