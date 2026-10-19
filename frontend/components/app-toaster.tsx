"use client"

import { useTheme } from "next-themes"
import { Toaster } from "sonner"

export function AppToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      position="top-center"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border-0 !bg-glass-strong !backdrop-blur-2xl !backdrop-saturate-150 !text-foreground !shadow-float !px-4 !py-3.5 !font-sans",
          title: "!text-[13.5px] !font-semibold !tracking-[-0.005em]",
          description: "!text-[12.5px] !text-muted-foreground",
          success: "[&_[data-icon]]:!text-status-growing",
          error: "[&_[data-icon]]:!text-destructive",
          info: "[&_[data-icon]]:!text-status-sown",
          warning: "[&_[data-icon]]:!text-status-harvested",
        },
      }}
    />
  )
}
