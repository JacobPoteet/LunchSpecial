// The suggestion box and the credit it earns, shared by the check and the tab.
//
// One form, two vocabularies. The diner asks for a dish and sends it to the
// kitchen; the bar asks for a drink and sends it to the bartender. Both POST
// to the same public inbox with `kind` telling them apart, and the admin's
// Requests tab splits on that.

import { useEffect, useState } from "react";
import { submitDishRequest } from "../api";
import type { RequestKind } from "../../shared/types";
import { DISH_REQUEST_LIMITS } from "../../shared/types";
import { currentSurface } from "../discord/bootstrap";
import { playSfx } from "../audio";
import { getPlayerId } from "./storage";

const SURFACE = currentSurface();

const COPY: Record<
  RequestKind,
  {
    toggle: string;
    title: string;
    namePlaceholder: string;
    submit: string;
    thanks: string;
    stampTitle: string;
    stampBody: (name: string) => string;
  }
> = {
  dish: {
    toggle: "🍽️ Suggest a dish for the menu",
    title: "Suggest a dish for the menu",
    namePlaceholder: "Dish name (required)",
    submit: "Send to the kitchen",
    thanks: "🧑‍🍳 Thanks, hon — the cook's got your request!",
    stampTitle: "Off a customer's ticket",
    stampBody: (name) => `A regular asked for ${name}. Yours could be next.`,
  },
  drink: {
    toggle: "🍹 Suggest a drink for the bar",
    title: "Suggest a drink for the bar",
    namePlaceholder: "Drink name (required)",
    submit: "Send to the bar",
    thanks: "🍸 Thanks — the bartender's got your request!",
    stampTitle: "Off a regular's tab",
    stampBody: (name) => `Somebody at the bar asked for ${name}. Yours could be next.`,
  },
};

/**
 * The credit a fan-submitted Special (or pour) carries on the check. It sits
 * directly on top of the suggest form — not up by the name — because the two
 * are one argument (somebody typed this into that form, and here it is), and
 * because the check has to stay short enough to read on a phone: down here the
 * stamp doubles as the form's header instead of costing a separate band of
 * height above the fold.
 *
 * Unrotated on purpose. The tilt read as a sticker but forced extra vertical
 * padding to keep its corners off the neighbouring text, which is exactly the
 * height this modal can't spare.
 */
export function FanStamp({ name, kind }: { name: string; kind: RequestKind }) {
  // Lands with `fan-stamp-press`, whose 0.5s delay in game.css is the beat the
  // receipt's own lines have finished rising on. Rare enough to be a treat and
  // cheap enough to be worth it — the whole reason it's a separate sound is
  // that a credited dish should feel like something happened.
  useEffect(() => {
    playSfx("fan-stamp", { delayMs: 500 });
  }, []);
  const copy = COPY[kind];

  return (
    <div className="fan-stamp">
      <span className="fan-stamp__seal" aria-hidden="true">
        ★
      </span>
      <div>
        <p className="fan-stamp__title">{copy.stampTitle}</p>
        <p className="fan-stamp__body">{copy.stampBody(name)}</p>
      </div>
    </div>
  );
}

/**
 * "Suggest a dish for the menu" (or a drink for the bar), shown on the receipt
 * after a round. Collapsed to a single line until the player opens it; on
 * submit it POSTs an anonymous request to the admin inbox (surface + device
 * id, same model as analytics).
 *
 * `promoted` is set when the Special itself came from a request: the same
 * control, styled loud instead of quiet, because that's the one round where the
 * ask has just proved itself.
 */
export function RequestForm({ kind, promoted = false }: { kind: RequestKind; promoted?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const copy = COPY[kind];

  if (status === "done") {
    return <p className="dish-request__thanks">{copy.thanks}</p>;
  }

  if (!open) {
    return (
      <button
        className={`dish-request__toggle${promoted ? " dish-request__toggle--promoted" : ""}`}
        onClick={() => setOpen(true)}
      >
        {copy.toggle}
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || status === "sending") return;
    setStatus("sending");
    try {
      await submitDishRequest({
        name: name.trim(),
        kind,
        country: country.trim() || undefined,
        note: note.trim() || undefined,
        surface: SURFACE,
        playerId: getPlayerId(),
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <form className="dish-request" onSubmit={submit}>
      <p className="dish-request__title">{copy.title}</p>
      <input
        className="dish-request__input"
        placeholder={copy.namePlaceholder}
        value={name}
        maxLength={DISH_REQUEST_LIMITS.name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="dish-request__input"
        placeholder="Country of origin (optional)"
        value={country}
        maxLength={DISH_REQUEST_LIMITS.country}
        onChange={(e) => setCountry(e.target.value)}
      />
      <textarea
        className="dish-request__input"
        placeholder="Anything else? (optional)"
        value={note}
        maxLength={DISH_REQUEST_LIMITS.note}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      {status === "error" && <p className="dish-request__error">Couldn't send that — try again.</p>}
      <div className="dish-request__actions">
        <button className="replay-btn" type="submit" disabled={!name.trim() || status === "sending"}>
          {status === "sending" ? "Sending…" : copy.submit}
        </button>
        <button className="dish-request__cancel" type="button" onClick={() => setOpen(false)}>
          Never mind
        </button>
      </div>
    </form>
  );
}
