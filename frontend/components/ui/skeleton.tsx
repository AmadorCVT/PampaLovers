import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-foreground/[0.07] animate-pulse rounded-lg', className)}
      {...props}
    />
  )
}

export { Skeleton }
