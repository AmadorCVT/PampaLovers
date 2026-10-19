import { cn } from "@/lib/utils"

/**
 * EvoAgro mark: a leaf whose veins read as crop rows, inside a satellite orbit.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-brand text-brand-foreground shadow-[inset_0_1px_0_oklch(1_0_0/45%),0_6px_16px_-6px_color-mix(in_oklch,var(--brand)_70%,transparent)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <ellipse
          cx="12"
          cy="12"
          rx="10.2"
          ry="4.6"
          transform="rotate(-28 12 12)"
          stroke="currentColor"
          strokeOpacity="0.38"
          strokeWidth="1.3"
        />
        <path
          d="M6.2 17.8C5.6 11.4 9.4 6.4 17.8 6.2c.3 8.2-4.9 12.2-11.6 11.6Z"
          fill="currentColor"
        />
        <path
          d="M7.4 16.6 15.2 8.8M9.9 15.9l-.5-3.4M12.6 13.2l-.4-3.1M10.5 13.6l3.3.3"
          stroke="var(--brand)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="20.4" cy="7.6" r="1.35" fill="currentColor" />
      </svg>
    </span>
  )
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[17px] font-semibold tracking-[-0.025em]", className)}>
      Evo<span className="font-display text-[20px] font-normal italic tracking-[-0.01em]">Agro</span>
    </span>
  )
}
