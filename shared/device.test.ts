import { describe, expect, it } from "vitest";
import {
  DEVICE_COOKIE,
  deviceCookie,
  discordClientOf,
  normalizeClient,
  normalizeDeviceOrigin,
  readDeviceCookie,
} from "./device";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const DESKTOP_APP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9200 Chrome/134.0.6998.205 Electron/35.3.0 Safari/537.36";
const UUID = "0b6c2a2e-6f4e-4c0c-9a39-3f1f0f9e2d11";

describe("discordClientOf", () => {
  it("reads mobile off the platform param alone", () => {
    expect(discordClientOf("mobile", CHROME)).toBe("mobile");
  });

  it("splits desktop into the installed app and the browser client", () => {
    expect(discordClientOf("desktop", DESKTOP_APP)).toBe("desktop");
    expect(discordClientOf("desktop", CHROME)).toBe("browser");
  });

  it("is unmeasured without a known platform", () => {
    expect(discordClientOf(null, DESKTOP_APP)).toBeNull();
    expect(discordClientOf("console", CHROME)).toBeNull();
  });
});

describe("normalizeClient / normalizeDeviceOrigin", () => {
  it("keep the closed sets and drop everything else", () => {
    expect(normalizeClient("browser")).toBe("browser");
    expect(normalizeDeviceOrigin("cookie")).toBe("cookie");
    for (const raw of [undefined, null, "", "Desktop", "tv", 1, {}]) {
      expect(normalizeClient(raw)).toBeNull();
      expect(normalizeDeviceOrigin(raw)).toBeNull();
    }
  });
});

describe("device cookie", () => {
  it("round-trips both id shapes", () => {
    for (const id of [UUID, "1760000000000-k3j9x2a1b"]) {
      const set = deviceCookie(id)!;
      const pair = set.split(";")[0];
      expect(readDeviceCookie(`other=1; ${pair}; theme=dark`)).toBe(id);
    }
  });

  it("is a partitioned, cross-site cookie so the Discord browser client keeps it", () => {
    const set = deviceCookie(UUID)!;
    expect(set).toContain("Secure");
    expect(set).toContain("SameSite=None");
    expect(set).toContain("Partitioned");
    expect(set).toContain("Path=/");
  });

  it("ignores missing, look-alike and tampered values", () => {
    expect(readDeviceCookie("")).toBeNull();
    expect(readDeviceCookie(`x${DEVICE_COOKIE}=${UUID}`)).toBeNull();
    expect(readDeviceCookie(`${DEVICE_COOKIE}=<script>`)).toBeNull();
    expect(readDeviceCookie(`${DEVICE_COOKIE}=short`)).toBeNull();
  });

  it("refuses to write an id it would not read back", () => {
    expect(deviceCookie("a; Domain=evil.example")).toBeNull();
  });
});
