// Put a Discord player's progress back, and keep a copy safe (GitHub #251).
//
// The Discord mobile app drops the Activity's storage when the app is quit, so
// the streak, the archive and "already seen the walkthrough" all went with it.
// For a player who authorizes, the Worker hands back an opaque id (a keyed hash
// of their Discord id, worker/playerid.ts) and a signed proof of it. This module
// adopts that id as the device id, pulls the saved copy and folds it into
// localStorage BEFORE the board mounts, then saves the local copy back whenever
// one of the game's keys is written. Once authorized it also reads Discord's
// language setting and hands it to src/i18n/store.ts.
//
// Best-effort end to end, like the rest of src/discord/: a player who declines,
// a deployment with no PLAYER_ID_SECRET, a slow or failing Worker all leave the
// game on its own localStorage exactly as before. Nothing here may hold the
// board up for longer than RESTORE_TIMEOUT_MS or throw.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import { PROGRESS_KEYS, mergeProgress, normalizeProgress, type Progress, type ProgressKey } from "../../shared/progress";
import { adoptPlayerId } from "../game/storage";
import { learnDiscordLocale } from "../i18n/store";
import { ensureAuthorized, playerSession } from "./auth";

/** The most the board waits on this before mounting regardless. A late finish still helps the next launch. */
const RESTORE_TIMEOUT_MS = 3000;

/** A burst of writes (a guess lands, stats update, the archive follows) becomes one save. */
const SAVE_DELAY_MS = 1500;

const isKey = (key: string): key is ProgressKey => (PROGRESS_KEYS as readonly string[]).includes(key);

function readLocal(): Progress {
  const out: Progress = {};
  for (const key of PROGRESS_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    } catch {
      // Storage blocked: nothing to read.
    }
  }
  return out;
}

/** Straight to the real setItem, so restoring never schedules a save of what it just restored. */
const originalSetItem = Storage.prototype.setItem;

function writeLocal(progress: Progress): void {
  for (const [key, value] of Object.entries(progress)) {
    try {
      originalSetItem.call(localStorage, key, value);
    } catch {
      // Storage full or blocked: the player keeps what the server has.
    }
  }
}

let proof: string | null = null;
let retired = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function save(keepalive: boolean): Promise<void> {
  if (!proof || retired) return;
  try {
    const res = await fetch("/api/discord/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${proof}` },
      body: JSON.stringify({ progress: readLocal() }),
      keepalive,
    });
    // The claim lasts a day. A longer sitting stops saving rather than asking again: the next launch mints a new one.
    if (res.status === 401) retired = true;
  } catch {
    // Offline or blocked. The next write schedules another try.
  }
}

function saveSoon(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void save(false);
  }, SAVE_DELAY_MS);
}

/**
 * Save whenever the game writes one of its keys. The writers are spread over
 * storage.ts and the sound prefs, so this watches the one call they all share
 * instead of asking each to remember. Only keys in PROGRESS_KEYS schedule
 * anything.
 */
function watchWrites(): void {
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && isKey(key)) saveSoon();
  };
  // A backgrounded Activity can be killed before the timer fires.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || timer === null) return;
    clearTimeout(timer);
    timer = null;
    void save(true);
  });
}

/** Discord's language setting (`identify` covers it), or null. Never throws. */
function discordLocale(instance: DiscordSDK): Promise<string | null> {
  return instance.commands.userSettingsGetLocale().then(
    ({ locale }) => (typeof locale === "string" ? locale : null),
    () => null,
  );
}

async function run(instance: DiscordSDK): Promise<void> {
  if (!(await ensureAuthorized(instance))) return;
  // Asked alongside the restore, decided after it: a pick the saved copy
  // brings back outranks Discord's setting (shared/locale.ts).
  const locale = discordLocale(instance);
  try {
    await restore();
  } finally {
    await learnDiscordLocale(await locale);
  }
}

async function restore(): Promise<void> {
  const session = playerSession();
  if (!session) return;

  adoptPlayerId(session.playerId);
  proof = session.progressToken;
  watchWrites();

  const res = await fetch("/api/discord/progress", { headers: { Authorization: `Bearer ${proof}` } });
  if (!res.ok) return;
  const body = (await res.json().catch(() => null)) as { progress?: unknown } | null;
  const saved = normalizeProgress(body?.progress) ?? {};

  // The copy on this phone leads ties; the saved one fills in whatever the app dropped.
  const local = readLocal();
  const merged = mergeProgress(local, saved);
  writeLocal(merged);
  // Anything this phone had that the server did not goes up.
  if (JSON.stringify(mergeProgress(saved, merged)) !== JSON.stringify(saved)) saveSoon();
}

/**
 * Restore before the board mounts. Resolves when done, failed, or out of time.
 * Never rejects.
 */
export async function restoreProgress(instance: DiscordSDK): Promise<void> {
  const outOfTime = new Promise<void>((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS));
  const attempt = run(instance).catch((err: unknown) => {
    console.warn("[discord] progress restore unavailable:", err);
  });
  await Promise.race([attempt, outOfTime]);
}
