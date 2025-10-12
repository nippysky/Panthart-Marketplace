"use client";

import React from "react";

interface Tab {
  label: string;
  content: React.ReactNode;
}

interface TabViewProps {
  tabs: Tab[];
  initialIndex?: number;
}

const TabView: React.FC<TabViewProps> = ({ tabs, initialIndex = 0 }) => {
  const [active, setActive] = React.useState(initialIndex);

  const listRef = React.useRef<HTMLDivElement>(null);
  const btnRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  // underline works only on md+ (single row)
  const updateIndicator = React.useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIndicator({ left: 0, width: 0 });
      return;
    }
    const el = btnRefs.current[active];
    const list = listRef.current;
    if (!el || !list) return;
    const listBox = list.getBoundingClientRect();
    const btnBox = el.getBoundingClientRect();
    const left = btnBox.left - listBox.left + list.scrollLeft;
    setIndicator({ left, width: btnBox.width });
  }, [active]);

  React.useLayoutEffect(() => {
    updateIndicator();
    const onResize = () => updateIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateIndicator]);

  // Keyboard navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "ArrowRight") setActive((i) => (i + 1) % tabs.length);
    if (e.key === "ArrowLeft") setActive((i) => (i - 1 + tabs.length) % tabs.length);
    if (e.key === "Home") setActive(0);
    if (e.key === "End") setActive(tabs.length - 1);
  };

  return (
    <div className="w-full">
      {/* Tab headers */}
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={[
          "relative flex flex-wrap md:flex-nowrap gap-2 md:gap-3",
          "border-b border-black/10 dark:border-white/10",
        ].join(" ")}
      >
        {tabs.map((tab, i) => {
          const isActive = i === active;
          return (
            <button
              key={tab.label}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${i}`}
              id={`tab-${i}`}
              onClick={() => setActive(i)}
              className={[
                "px-3 py-2 text-sm md:text-[1rem] rounded-md transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50",
                isActive
                  ? "bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}

        {/* animated underline for md+ only */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 hidden md:block h-[2px] rounded-full bg-gradient-to-r from-green-900 to-brand transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>

      {/* Panels */}
      <div className="mt-5">
        {tabs.map((tab, i) => (
          <div
            key={`panel-${i}`}
            id={`panel-${i}`}
            role="tabpanel"
            aria-labelledby={`tab-${i}`}
            className={i === active ? "block" : "hidden"}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabView;
