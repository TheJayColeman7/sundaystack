export const ROSTER_CHANGED_EVENT = "sundaystack:roster-changed";

export function dispatchRosterChanged(): void {
  window.dispatchEvent(new Event(ROSTER_CHANGED_EVENT));
}
