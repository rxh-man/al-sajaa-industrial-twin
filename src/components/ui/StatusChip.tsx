import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';

export type ChipTone = 'ok' | 'info' | 'warn' | 'alert' | 'muted';

const ICON = {
  ok: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
  alert: OctagonAlert,
  muted: Info,
};

export function StatusChip({ tone, children, icon = true, pulse = false }: { tone: ChipTone; children: React.ReactNode; icon?: boolean; pulse?: boolean }) {
  const Icon = ICON[tone];
  return (
    <span className={`chip chip-${tone} ${pulse ? 'chip-pulse' : ''}`}>
      {icon && <Icon size={11} strokeWidth={2.6} aria-hidden />}
      {children}
    </span>
  );
}
