// Bookable-slot math shared by the client booking sheet and the master's
// manual "add to queue" sheet, so both offer the same free times.

// JS getDay(): 0=Sun..6=Sat. Backend weekday: 0=Mon..6=Sun.
export const jsToBackendWeekday = (d) => (d + 6) % 7;

export const labelOf = (t) => {
  const m = ((t % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Granularity of the round-time grid (minutes). Slots land on :00 / :30.
export const SLOT_STEP = 30;

// Returns bookable start times as [{ t: minutes-of-day, label: "HH:MM" }].
//
// Candidate start times come from a fixed round-time grid anchored at the
// opening hour, plus smart anchors around each existing booking (start right
// after one ends; finish exactly when the next begins). A candidate is kept
// only if it sits inside working hours, isn't in the past, and the whole visit
// fits without overlapping any booking — i.e. only free times from now onward.
export function buildSlots(hours, date, durationMin, busy = [], leadMin = 10) {
  if (!hours) return [];
  const wd = jsToBackendWeekday(date.getDay());
  const h = hours.find((x) => x.weekday === wd);
  if (!h || h.is_day_off) return [];
  const dur = durationMin || 30;
  const [sh, sm] = h.start_time.split(":").map(Number);
  const [eh, em] = h.end_time.split(":").map(Number);
  const open = sh * 60 + sm;
  let close = eh * 60 + em;
  // A close time <= open means the shift runs past midnight.
  if (close <= open) close += 24 * 60;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const intervals = busy
    .map((b) => ({
      s: Math.round((b.start - dayStart) / 60000),
      e: Math.round((b.end - dayStart) / 60000),
    }))
    .filter((b) => b.e > open && b.s < close);

  const candidates = new Set();
  for (let t = open; t + dur <= close; t += SLOT_STEP) candidates.add(t);
  for (const b of intervals) {
    candidates.add(b.e); // start as soon as the previous visit ends
    candidates.add(b.s - dur); // finish exactly when the next visit starts
  }

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const fits = (t) =>
    t >= open &&
    t + dur <= close &&
    !(isToday && t < nowMin + leadMin) &&
    !intervals.some((b) => t < b.e && b.s < t + dur);

  return [...candidates]
    .filter(fits)
    .sort((a, b) => a - b)
    .map((t) => ({ t, label: labelOf(t) }));
}
