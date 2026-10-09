"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/springs";

export type NavItem = {
  label: string;
  href?: string;
  panelId?: string;
};

export type ProductCard = {
  title: string;
  description?: string;
  href?: string;
  mediaType?: "component" | "image";
  imageSrc?: string;
  imageAlt?: string;
  component?: ReactNode;
};

export type MenuPanel = {
  id: string;
  /** "feature": two media cards and two small ones (the original Product panel); otherwise three cards */
  layout?: "feature" | "grid";
  items: ProductCard[];
};

export type NavbarSectionTwoProps = {
  logo?: ReactNode;
  logoHref?: string;
  logoLabel?: string;
  items?: NavItem[];
  panels?: MenuPanel[];
  cta?: { label: string; href?: string };
  ctaClassName?: string;
  className?: string;
  /** The hero under the bar. Defaults to the original demo hero. */
  children?: ReactNode;
};

const defaultNavItems: NavItem[] = [
  { label: "Product", panelId: "product" },
  { label: "Solution", panelId: "solution" },
  { label: "Developers", href: "#" },
  { label: "Company", href: "#" },
  { label: "Pricing", panelId: "pricing" },
  { label: "News", href: "#" },
];

const defaultMenuPanels: MenuPanel[] = [
  {
    id: "product",
    layout: "feature",
    items: [
      { title: "Chat", mediaType: "component", component: <ChatPreview /> },
      { title: "Build", mediaType: "component", component: <BuildPreview /> },
      { title: "Imagine", description: "Generate and edit images and videos from text" },
      { title: "Voice", description: "Build voice agents with sub-second latency" },
    ],
  },
  {
    id: "solution",
    items: [
      { title: "Research", description: "Explore, compare, and synthesize complex work with long-context reasoning." },
      { title: "Engineering", description: "Move from issue to tested patch with agents that understand your codebase." },
      { title: "Operations", description: "Turn messy requests, documents, and workflows into structured execution." },
    ],
  },
  {
    id: "pricing",
    items: [
      { title: "Free", description: "Start experimenting with core models, chat, and lightweight automation." },
      { title: "Pro", description: "Higher limits, faster responses, and advanced tools for serious builders." },
      { title: "Enterprise", description: "Security, admin controls, dedicated support, and custom deployment paths." },
    ],
  },
];

function XaiLogo({ className = "" }: { className?: string }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M3.64241 13.8959L19.075 36.4167H25.9348L10.5004 13.8959H3.64241ZM10.4951 26.404L3.63362 36.4167H10.4986L13.9267 31.4113L10.4951 26.404ZM27.5039 1.58337L15.6434 18.8905L19.075 23.8995L34.3689 1.58337H27.5039ZM28.7462 12.2926V36.4167H34.3689V4.08789L28.7462 12.2926Z" fill="currentColor" />
    </svg>
  );
}

function ChatPreview() {
  return (
    <div className="relative z-10 flex w-full flex-col gap-2 rounded-lg border border-zinc-900/80 bg-zinc-950 p-2 shadow-sm">
      <div className="flex justify-start gap-1.5">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-bold text-zinc-400">U</span>
        <div className="max-w-[85%] rounded bg-white p-1.5 text-[8px] font-medium leading-normal text-black">
          I am building a block library featuring xai, what kind of ui blocks should i design
        </div>
      </div>
      <div className="flex justify-start gap-1.5">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">G</span>
        <div className="max-w-[85%] rounded bg-blue-600 p-1.5 text-[8px] font-medium leading-normal text-white">
          Design cosmic themes, Grok chat blocks, AI response cards, and sharp truth-seeking components.
        </div>
      </div>
    </div>
  );
}

function BuildPreview() {
  return (
    <div className="relative z-10 w-full space-y-1.5 overflow-hidden rounded-lg border border-zinc-900/80 bg-zinc-950 p-2 font-mono text-[7.5px] leading-normal text-zinc-400 shadow-sm">
      <div className="flex items-center justify-between text-zinc-500"><span>Find session references</span><span className="rounded bg-zinc-900 px-1 py-px text-[6.5px] text-zinc-400">explore</span></div>
      <div className="flex items-center gap-1 text-zinc-500"><span className="h-1 w-1 rounded-full bg-emerald-500" />Thought for 4.1s</div>
      <div className="overflow-hidden rounded border border-zinc-900 bg-[#09090b] text-[6.5px]">
        <div className="border-b border-zinc-900/60 bg-[#0c0c0e] px-2 py-0.5 text-zinc-500">Edit src/middleware/auth.ts</div>
        <div className="space-y-px p-1 font-mono text-zinc-400">
          <p><span className="mr-1 text-zinc-600">42</span> export async function handler(req) &#123;</p>
          <p className="bg-red-950/20 text-red-300"><span className="mr-1 text-zinc-600">43</span> - const token = extract(req);</p>
          <p className="bg-emerald-950/30 text-emerald-300"><span className="mr-1 text-zinc-600">44</span> + const token = extractRequest(req);</p>
          <p className="text-zinc-300"><span className="mr-1 text-zinc-600">45</span> if (!token) return unauthorized();</p>
        </div>
      </div>
    </div>
  );
}

/** Fluid Functionalism "weight without reflow": the bold copy reserves the width, so the label never shifts its neighbours. */
function WeightLabel({ children, heavy }: { children: ReactNode; heavy: boolean }) {
  return (
    <span className="inline-grid">
      <span className={cn("col-start-1 row-start-1 transition-[font-weight] duration-150", heavy ? "font-semibold" : "font-medium")}>{children}</span>
      <span className="invisible col-start-1 row-start-1 font-semibold" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

function PanelCard({ item, compact = false, onPick }: { item: ProductCard; compact?: boolean; onPick: () => void }) {
  if (item.component || item.imageSrc) {
    const body = (
      <>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_50%)] opacity-0 transition-opacity group-hover:opacity-100" />
        {item.mediaType === "image" && item.imageSrc ? (
          <img src={item.imageSrc} alt={item.imageAlt ?? ""} className="relative z-10 min-h-0 w-full flex-1 rounded-lg object-cover object-top" />
        ) : (
          item.component
        )}
        <span className="relative z-10 mt-auto block pt-2 text-center text-xs font-medium text-zinc-400 transition-colors group-hover:text-white">{item.title}</span>
      </>
    );
    const cls = "group relative flex h-[180px] flex-col justify-between overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/40 p-3 transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-900/15";
    return item.href ? (
      <a href={item.href} onClick={onPick} className={cls}>
        {body}
      </a>
    ) : (
      <div className={cls}>{body}</div>
    );
  }

  return (
    <a
      href={item.href ?? "#"}
      onClick={onPick}
      className={
        compact
          ? "group relative flex h-[86px] flex-col justify-center overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/40 p-3 transition-all hover:border-zinc-800 hover:bg-zinc-900/15"
          : "group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/40 p-4 transition-all hover:border-zinc-800 hover:bg-zinc-900/15"
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.04),transparent_50%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative z-10">
        <h4 className={compact ? "text-sm font-medium text-white" : "text-base font-medium text-white"}>{item.title}</h4>
        <p className="mt-1 text-[11px] leading-normal text-zinc-500 transition-colors group-hover:text-zinc-400">{item.description}</p>
      </div>
      {!compact && (
        <span className="relative z-10 mt-5 text-[11px] font-medium text-zinc-500">
          Explore <ArrowRight className="ml-1 inline size-3" />
        </span>
      )}
    </a>
  );
}

function DropdownPanel({ panel, onPick }: { panel: MenuPanel; onPick: () => void }) {
  if (panel.layout === "feature" && panel.items.length >= 4) {
    const [a, b, c, d] = panel.items;
    return (
      <div className="grid grid-cols-[1.2fr_1.2fr_1fr] gap-4 bg-[var(--panel-solid)] p-4">
        <PanelCard item={a} onPick={onPick} />
        <PanelCard item={b} onPick={onPick} />
        <div className="flex flex-col gap-2">
          <PanelCard item={c} compact onPick={onPick} />
          <PanelCard item={d} compact onPick={onPick} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 bg-[var(--panel-solid)] p-4">
      {panel.items.map((item) => (
        <PanelCard key={item.title} item={item} onPick={onPick} />
      ))}
    </div>
  );
}

function DemoHero() {
  return (
    <div className="relative z-10 mt-14 w-full max-w-[700px] bg-white text-center lg:mt-14">
      <div className="flex flex-col items-center px-6 pt-10">
        <a href="#" className="group mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-2 py-1 text-sm text-neutral-400 transition-colors hover:text-black md:px-3"><span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-500 transition-colors group-hover:bg-neutral-900 group-hover:text-white">Hiring</span>Apply for Design Engineers<ArrowRight className="size-3 text-neutral-400 transition-transform group-hover:translate-x-1 group-hover:text-black" /></a>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tighter text-black md:text-5xl">Frontier AI models for <br className="hidden md:block" />everything you build</h1>
        <p className="mt-4 max-w-lg text-center text-sm leading-relaxed text-black/60 md:text-lg">Autonomous agents that debug, refactor, and ship features while you focus on architecture and strategy</p>
        <div className="mb-10 mt-6 flex flex-row gap-4"><a href="#" className="flex min-w-[100px] items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 md:min-w-[190px] md:text-lg">Get API Access</a><a href="#" className="flex min-w-[100px] items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-50 md:min-w-[190px] md:text-lg">View Documentation</a></div>
      </div>
      <div className="relative overflow-hidden rounded-b-[16px] bg-gray-50"><img src="https://res.cloudinary.com/harshitproject/image/upload/v1774017120/hero-light.png" alt="Dashboard Preview" className="h-auto w-full object-cover object-top" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white via-white/80 to-transparent" /></div>
    </div>
  );
}

export default function NavbarTwo({
  logo = <XaiLogo />,
  logoHref = "#",
  logoLabel = "Home",
  items = defaultNavItems,
  panels = defaultMenuPanels,
  cta = { label: "Try it now", href: "#" },
  ctaClassName = "bg-blue-600 hover:bg-blue-700",
  className,
  children,
}: NavbarSectionTwoProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileActiveMenu, setMobileActiveMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^\w-]/g, "");
  const getPanel = (panelId: string | null) => panels.find((panel) => panel.id === panelId);
  const activePanel = getPanel(activeMenu);

  const toggleMenu = (menuName: string) => setActiveMenu(activeMenu === menuName ? null : menuName);
  const close = () => {
    setActiveMenu(null);
    setMobileOpen(false);
  };

  // Escape or a click outside closes an open panel
  useEffect(() => {
    if (!activeMenu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveMenu(null);
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setActiveMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [activeMenu]);

  const highlight = (key: string) =>
    hovered === key || (!hovered && activeMenu === key) ? (
      <motion.span layoutId={`${uid}-nav-hl`} className="absolute inset-0 -z-10 rounded-md bg-[#18181b]" transition={spring.fast} aria-hidden="true" />
    ) : null;

  return (
    <div className={cn("relative flex min-h-[720px] w-full flex-col items-center overflow-hidden bg-white px-6 pb-6 pt-0 font-sans text-zinc-900 transition-colors duration-300", className)}>
      <div className="relative z-30 hidden h-12 w-full max-w-7xl select-none items-center justify-between lg:flex">
        <a href={logoHref} aria-label={logoLabel} className="flex items-center text-foreground">
          {logo}
        </a>

        <div ref={barRef} className="absolute left-1/2 top-0 hidden w-[700px] -translate-x-1/2 lg:block" style={{ filter: "drop-shadow(0 12px 20px rgba(0, 0, 0, 0.18))" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute -left-[18px] top-0 z-10 text-[var(--panel-solid)]" aria-hidden="true"><path d="M 20 20 L 20 0 L 0 0 C 11.046 0 20 11.046 20 20 Z" fill="currentColor" /></svg>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute -right-[18px] top-0 z-10 text-[var(--panel-solid)]" aria-hidden="true"><path d="M 0 0 L 20 0 C 8.954 0 0 8.954 0 20 Z" fill="currentColor" /></svg>

          <motion.div animate={{ height: activePanel ? 260 : 48 }} transition={spring.slow} className="relative flex w-full flex-col justify-start overflow-hidden bg-[var(--panel-solid)]" style={{ borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px" }}>
            <div className="z-20 flex h-12 items-center justify-center px-6">
              <nav className="flex w-full items-center justify-center gap-2 text-xs text-zinc-400" aria-label="Main" onMouseLeave={() => setHovered(null)}>
                {items.map((item) =>
                  item.panelId ? (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => toggleMenu(item.panelId!)}
                      onMouseEnter={() => setHovered(item.label)}
                      onFocus={() => setHovered(item.label)}
                      onBlur={() => setHovered(null)}
                      aria-expanded={activeMenu === item.panelId}
                      aria-controls={`${uid}-panel`}
                      className={`relative isolate flex cursor-pointer items-center gap-1 rounded-md px-3 py-1 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 ${activeMenu === item.panelId ? "text-white" : "text-zinc-400"}`}
                    >
                      {highlight(item.label)}
                      <WeightLabel heavy={activeMenu === item.panelId}>{item.label}</WeightLabel>
                      <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition-transform duration-300 ${activeMenu === item.panelId ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={close}
                      onMouseEnter={() => setHovered(item.label)}
                      onFocus={() => setHovered(item.label)}
                      onBlur={() => setHovered(null)}
                      className="relative isolate rounded-md px-3 py-1 text-zinc-400 outline-none transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      {highlight(item.label)}
                      <WeightLabel heavy={false}>{item.label}</WeightLabel>
                    </a>
                  ),
                )}
              </nav>
            </div>

            <AnimatePresence mode="wait">
              {activePanel && (
                <motion.div
                  id={`${uid}-panel`}
                  key={activePanel.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: spring.moderate.exit }}
                  transition={spring.moderate}
                  className="overflow-hidden border-t border-white/5 bg-[var(--panel-solid)]"
                >
                  <DropdownPanel panel={activePanel} onPick={close} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <a href={cta.href ?? "#"} className={cn("group flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors", ctaClassName)}>
          {cta.label}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      </div>

      <div className="relative z-30 flex h-14 w-full items-center justify-between lg:hidden">
        <a href={logoHref} aria-label={logoLabel} className="text-foreground">
          {logo}
        </a>
        <div className="flex items-center gap-2">
          <a href={cta.href ?? "#"} className={cn("group flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm", ctaClassName)}>
            {cta.label}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-lg border border-border text-foreground"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0, transition: spring.moderate.exit }} transition={spring.moderate} className="relative z-20 w-full overflow-hidden rounded-xl border border-border bg-[var(--panel-solid)] text-white shadow-xl lg:hidden">
            <div className="grid gap-1 p-4">
              {items.map((item) => {
                const panel = item.panelId ? getPanel(item.panelId) : null;
                const isOpen = mobileActiveMenu === item.panelId;

                if (!item.panelId) {
                  return (
                    <a key={item.label} href={item.href || "#"} onClick={close} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white">
                      {item.label}
                    </a>
                  );
                }

                return (
                  <div key={item.label}>
                    <button type="button" onClick={() => setMobileActiveMenu(isOpen ? null : item.panelId!)} aria-expanded={isOpen} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10 hover:text-white">
                      {item.label}
                      <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && panel && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0, transition: spring.fast.exit }} transition={spring.moderate} className="overflow-hidden">
                          <div className="mx-3 mb-2 grid gap-2 border-l border-white/10 pl-3 pt-1">
                            {panel.items.map((panelItem) => (
                              <a key={panelItem.title} href={panelItem.href ?? "#"} onClick={close} className="rounded-md px-3 py-2 hover:bg-white/5">
                                <span className="block text-sm font-medium text-white">{panelItem.title}</span>
                                {panelItem.description && <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{panelItem.description}</span>}
                              </a>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children ?? <DemoHero />}
    </div>
  );
}
