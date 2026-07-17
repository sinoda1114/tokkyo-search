import { describe, expect, it } from "vitest";
import { formatBytesBilled, formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("実行環境のシステムタイムゾーンに関わらず、常にJST（UTC+9）で表示する", () => {
    // UTC 2026-07-16T19:46:58 は JST（UTC+9）で 2026-07-17 04:46:58 になる。
    const utcDate = new Date(Date.UTC(2026, 6, 16, 19, 46, 58));
    expect(formatDateTime(utcDate)).toBe("2026/7/17 4:46:58");
  });

  it("日付が変わらないケースでも正しくJSTへ変換する", () => {
    // UTC 2026-07-17T01:00:00 は JSTで 2026-07-17 10:00:00。
    const utcDate = new Date(Date.UTC(2026, 6, 17, 1, 0, 0));
    expect(formatDateTime(utcDate)).toBe("2026/7/17 10:00:00");
  });
});

describe("formatBytesBilled", () => {
  it("バイト数をGiB表示（小数点以下3桁）に変換する", () => {
    expect(formatBytesBilled(1_330_000_000)).toBe("1.239 GB");
  });

  it("bytesがnullのとき既定のフォールバック文字列を返す", () => {
    expect(formatBytesBilled(null)).toBe("不明");
  });

  it("bytesがundefinedのとき既定のフォールバック文字列を返す", () => {
    expect(formatBytesBilled(undefined)).toBe("不明");
  });

  it("フォールバック文字列を明示的に指定できる", () => {
    expect(formatBytesBilled(null, "-")).toBe("-");
  });
});
