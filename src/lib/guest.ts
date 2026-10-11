// Guest mode: try Money without an account. The API runs in this browser and the data stays here.
// The database code (sql.js and the API itself) only downloads once someone starts a guest session.

const FLAG_KEY = "lifeboard.guest";

function readFlag() {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

let guest = readFlag();

export const isGuest = () => guest;

export function enterGuest() {
  guest = true;
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    // Storage is blocked: guest mode still works until the tab closes.
  }
}

/** Leaves guest mode. The local data stays for next time unless `wipe` is set. */
export async function leaveGuest({ wipe = false } = {}) {
  guest = false;
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch {
    // Nothing stored to remove.
  }
  if (wipe) (await import("@/lib/guest-db")).wipeGuestData();
}

/** Answers an `/api` request from the local database, like `fetch` would from the server. */
export async function guestFetch(path: string, init?: RequestInit): Promise<Response> {
  const { guestHandler } = await import("@/lib/guest-db");
  return guestHandler(new Request(`${window.location.origin}/api${path}`, init));
}
