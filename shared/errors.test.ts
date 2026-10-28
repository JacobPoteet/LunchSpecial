import { describe, expect, it } from "vitest";
import en from "./i18n/locales/en";
import { errorCopy, isPlayerErrorCode, playerError, PLAYER_ERROR_CODES } from "./errors";

describe("errorCopy", () => {
  it("says a code in the catalog's words", () => {
    expect(errorCopy({ message: "The bar is closed", code: "bar_closed" }, en)).toBe(en.errors.bar_closed);
  });

  it("keeps the English when there's no code", () => {
    expect(errorCopy({ message: "Unauthorized" }, en)).toBe("Unauthorized");
    expect(errorCopy({ message: "Unauthorized", code: null }, en)).toBe("Unauthorized");
  });

  it("quotes the status of an unreadable answer", () => {
    expect(errorCopy({ message: "Request failed (502)", code: "failed", status: 502 }, en)).toBe(
      `${en.errors.failed} (502)`,
    );
  });
});

describe("the codes", () => {
  it("are recognised, and nothing else is", () => {
    for (const code of PLAYER_ERROR_CODES) expect(isPlayerErrorCode(code)).toBe(true);
    for (const junk of ["", "Invalid date", null, 3, undefined]) expect(isPlayerErrorCode(junk)).toBe(false);
  });

  it("travel beside the English", () => {
    expect(playerError("Invalid date", "bad_date")).toEqual({ error: "Invalid date", code: "bad_date" });
  });
});
