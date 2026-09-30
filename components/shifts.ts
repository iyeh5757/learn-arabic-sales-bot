export const SHIFTS_EVENT = "desk-shifts";

export function notifyShiftsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHIFTS_EVENT));
}
