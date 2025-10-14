// app/loading.tsx
export default function GlobalLoadingOverlay() {
  return (
    <div
      className="
        fixed inset-0 z-[9999] flex items-center justify-center
        bg-gradient-to-br from-black/10 via-black/5 to-black/10
        dark:from-white/5 dark:via-white/4 dark:to-white/5
        backdrop-blur-xl
      "
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* soft vignette + micro pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]"
      >
        <div className="absolute inset-0 opacity-[0.06]">
          <div className="h-full w-full bg-[radial-gradient(circle_at_25%_15%,currentColor_1px,transparent_1px)] text-black/60 dark:text-white/70 bg-[size:18px_18px]" />
        </div>
      </div>

      {/* top sweep progress */}
      <div aria-hidden className="fixed top-0 left-0 right-0 h-[3px] overflow-hidden">
        <div
          className="
            h-full w-1/3 rounded-r
            bg-gradient-to-r from-neutral-300 via-neutral-200 to-neutral-400
            dark:from-neutral-500 dark:via-neutral-400 dark:to-neutral-600
            shadow-[0_0_12px_2px_rgba(0,0,0,0.15)]
            motion-safe:animate-loader-sweep
          "
        />
      </div>

      {/* card */}
      <div
        className="
          relative isolate rounded-2xl
          border border-black/10 dark:border-white/10
          bg-white/55 dark:bg-neutral-900/55
          shadow-xl backdrop-blur-2xl
          w-[min(90vw,520px)]
          px-5 py-4 sm:px-8 sm:py-6
        "
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* spinner */}
          <div className="flex justify-center sm:justify-start">
            <svg
              className="h-8 w-8 text-neutral-700 dark:text-neutral-300 motion-safe:animate-spin"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="opacity-80"
                strokeDasharray="60"
                strokeDashoffset="20"
              />
            </svg>
          </div>

          <div className="w-full">
            <p className="text-sm font-medium tracking-wide text-neutral-800/90 dark:text-neutral-200/90 text-center sm:text-left">
              Patience, Comrade
            </p>
            <div className="mt-2 flex items-center justify-center sm:justify-start gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-neutral-700/90 dark:bg-neutral-300/90 motion-safe:animate-bounce [animation-delay:-0.2s]" />
              <span className="block h-1.5 w-1.5 rounded-full bg-neutral-500/90 dark:bg-neutral-400/90 motion-safe:animate-bounce [animation-delay:-0.1s]" />
              <span className="block h-1.5 w-1.5 rounded-full bg-neutral-400/90 dark:bg-neutral-500/90 motion-safe:animate-bounce" />
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}
