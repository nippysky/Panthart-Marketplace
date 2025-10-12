"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CalendarClock } from "lucide-react";

/* ---------- props ---------- */
type DateTimePickerProps = {
  label: string;
  value: string; // "YYYY-MM-DDTHH:mm"
  onChange: (val: string) => void;
  disabled?: boolean;
  minNow?: boolean;
  zIndex?: number;
};

/* ---------- helpers ---------- */
function toLocalYMDHM(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
function fromLocalYMDHM(s: string): Date | null {
  if (!s) return null;
  const [datePart, timePart] = s.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (!y || !m || !d || hh === undefined || mm === undefined) return null;
  const dt = new Date();
  dt.setFullYear(y); dt.setMonth(m - 1); dt.setDate(d); dt.setHours(hh); dt.setMinutes(mm);
  dt.setSeconds(0); dt.setMilliseconds(0);
  return dt;
}
function formatDisplayLocal(s: string): string {
  const tzn = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = fromLocalYMDHM(s);
  if (!date) return `Select ${tzn}`;
  const fmtDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "2-digit" }).format(date);
  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const offH = String(Math.floor(absMin / 60)).padStart(2, "0");
  const offM = String(absMin % 60).padStart(2, "0");
  return `${fmtDate} • ${fmtTime} (${tzn}, UTC${sign}${offH}:${offM})`;
}
function clampToLead(d: Date, leadMin: number) {
  if (!leadMin) return d;
  const t = new Date();
  t.setMinutes(t.getMinutes() + leadMin);
  t.setSeconds(0); t.setMilliseconds(0);
  return d < t ? t : d;
}

/* ---------- component ---------- */
export default function DateTimePicker({
  label,
  value,
  onChange,
  disabled,
  minNow,
  zIndex = 1_000_002,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const lead = minNow ? 7 : 0;

  const initial = React.useMemo(() => {
    if (value) {
      const d = fromLocalYMDHM(value);
      if (d) return clampToLead(d, lead);
    }
    const now = clampToLead(new Date(), lead);
    now.setSeconds(0); now.setMilliseconds(0);
    return now;
  }, [value, lead]);

  const [datePart, setDatePart] = React.useState<string>(() => toLocalYMDHM(initial).slice(0, 10));
  const [timePart, setTimePart] = React.useState<string>(() => toLocalYMDHM(initial).slice(11));

  React.useEffect(() => {
    const d = value ? fromLocalYMDHM(value) : null;
    if (!d) return;
    const ymdhm = toLocalYMDHM(clampToLead(d, lead));
    setDatePart(ymdhm.slice(0, 10));
    setTimePart(ymdhm.slice(11));
  }, [value, lead]);

  function apply(valDate: string, valTime: string) {
    if (!valDate || !valTime) return;
    const d = fromLocalYMDHM(`${valDate}T${valTime}`);
    if (!d) return;
    onChange(toLocalYMDHM(clampToLead(d, lead)));
  }

  function setNow() {
    const t = clampToLead(new Date(), lead);
    const ymdhm = toLocalYMDHM(t);
    setDatePart(ymdhm.slice(0, 10));
    setTimePart(ymdhm.slice(11));
  }
  function addHours(h: number) {
    const d = new Date();
    d.setHours(d.getHours() + h, d.getMinutes(), 0, 0);
    const t = clampToLead(d, lead);
    const ymdhm = toLocalYMDHM(t);
    setDatePart(ymdhm.slice(0, 10));
    setTimePart(ymdhm.slice(11));
  }
  function tomorrowAt(hh: number, mm = 0) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hh, mm, 0, 0);
    const t = clampToLead(d, lead);
    const ymdhm = toLocalYMDHM(t);
    setDatePart(ymdhm.slice(0, 10));
    setTimePart(ymdhm.slice(11));
  }
  function nextWeekSameTime() {
    const d = fromLocalYMDHM(`${datePart}T${timePart}`) ?? new Date();
    d.setDate(d.getDate() + 7);
    const t = clampToLead(d, lead);
    const ymdhm = toLocalYMDHM(t);
    setDatePart(ymdhm.slice(0, 10));
    setTimePart(ymdhm.slice(11));
  }

  const display = value ? formatDisplayLocal(value) : "Select date & time";

  return (
    <div className="w-full">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full justify-between bg-white dark:bg-background border border-input shadow-sm"
      >
        <span className="truncate text-left">{display}</span>
        <CalendarClock className="h-4 w-4 opacity-70" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
        <DialogContent
          className="sm:max-w-md rounded-2xl bg-white dark:bg-background text-foreground border border-border"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          style={{ zIndex }}
        >
          <DialogHeader>
            <DialogTitle>Pick date & time</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Date</div>
              <Input
                type="date"
                value={datePart}
                onChange={(e) => setDatePart(e.target.value)}
                className="bg-white dark:bg-background border border-input shadow-sm"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Time</div>
              <Input
                type="time"
                step={60}
                value={timePart}
                onChange={(e) => setTimePart(e.target.value)}
                className="bg-white dark:bg-background border border-input shadow-sm"
              />
            </div>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Times shown in <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={setNow}>5 Mins</Button>
            <Button type="button" variant="secondary" onClick={() => addHours(1)}>+1 hour</Button>
            <Button type="button" variant="secondary" onClick={() => tomorrowAt(10, 0)}>Tomorrow 10:00</Button>
            <Button type="button" variant="secondary" onClick={nextWeekSameTime}>Next week</Button>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => { apply(datePart, timePart); setOpen(false); }}>
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
