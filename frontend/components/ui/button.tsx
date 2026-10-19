import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Feedback lives on the press: scale responds on pointer-down, instantly.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.005em] transition-[transform,background-color,color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/45 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/14%),0_1px_2px_oklch(0_0_0/12%),0_6px_16px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)] hover:bg-primary/92',
        brand:
          'bg-brand text-brand-foreground shadow-[inset_0_1px_0_oklch(1_0_0/40%),0_1px_2px_oklch(0_0_0/10%),0_8px_20px_-10px_color-mix(in_oklch,var(--brand)_80%,transparent)] hover:brightness-[1.04]',
        destructive:
          'bg-destructive text-white shadow-[inset_0_1px_0_oklch(1_0_0/16%),0_1px_2px_oklch(0_0_0/12%)] hover:bg-destructive/90 focus-visible:ring-destructive/25',
        outline:
          'bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_oklch(0_0_0/4%)] hover:bg-accent hover:text-accent-foreground dark:bg-input/20 dark:hover:bg-input/40',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/75',
        ghost:
          'text-foreground/80 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-10 px-4 has-[>svg]:px-3.5',
        sm: 'h-8 rounded-[10px] gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5',
        lg: 'h-11 rounded-xl px-6 text-[15px] has-[>svg]:px-5',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-[10px]',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
