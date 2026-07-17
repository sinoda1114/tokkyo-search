import { describe, expect, it } from "vitest";
import { buildClaimsLookupQuery, buildSearchQuery } from "./query-builder";
import type { SearchConditions } from "./query-builder";

const baseConditions: SearchConditions = {
  dateFrom: "2000-01-01",
  dateTo: "2024-12-31",
  terms: ["半導体"],
};

describe("buildSearchQuery", () => {
  describe("date range guard (partition pruning)", () => {
    it("throws when dateFrom is missing", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, dateFrom: "" }),
      ).toThrow(Error);
    });

    it("throws when dateTo is missing", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, dateTo: "" }),
      ).toThrow(Error);
    });

    it("throws when dateFrom has an invalid format", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, dateFrom: "2000/01/01" }),
      ).toThrow(Error);
    });

    it("throws when dateTo has an invalid format", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, dateTo: "not-a-date" }),
      ).toThrow(Error);
    });

    it("throws when dateFrom is after dateTo", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", {
          ...baseConditions,
          dateFrom: "2024-12-31",
          dateTo: "2000-01-01",
        }),
      ).toThrow(Error);
    });

    it("allows dateFrom equal to dateTo", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        dateFrom: "2020-01-01",
        dateTo: "2020-01-01",
      });
      expect(result.params.dateFrom).toBe("2020-01-01");
    });

    it("includes DATE-cast bounds in the SQL when dates are valid", () => {
      const result = buildSearchQuery("proj", "patents_jp", baseConditions);
      expect(result.sql).toContain("publication_date >= DATE(@dateFrom)");
      expect(result.sql).toContain("publication_date <= DATE(@dateTo)");
      expect(result.params.dateFrom).toBe("2000-01-01");
      expect(result.params.dateTo).toBe("2024-12-31");
    });
  });

  describe("terms guard", () => {
    it("throws when terms is an empty array", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, terms: [] }),
      ).toThrow(Error);
    });

    it("throws when terms only contains blank strings", () => {
      expect(() =>
        buildSearchQuery("proj", "patents_jp", { ...baseConditions, terms: ["  ", ""] }),
      ).toThrow(Error);
    });
  });

  describe("regex escaping", () => {
    it("escapes regex special characters so terms are matched literally", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        terms: ["A.B(C)"],
      });
      expect(result.params.pattern).toBe("A\\.B\\(C\\)");
    });

    it("joins multiple escaped terms with a regex alternation", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        terms: ["半導体", "A+B"],
      });
      expect(result.params.pattern).toBe("(半導体|A\\+B)");
    });

    it("trims whitespace and drops blank terms before building the pattern", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        terms: [" 半導体 ", ""],
      });
      expect(result.params.pattern).toBe("半導体");
    });
  });

  describe("searchClaims branching", () => {
    it("defaults searchClaims param to false when not provided", () => {
      const result = buildSearchQuery("proj", "patents_jp", baseConditions);
      expect(result.params.searchClaims).toBe(false);
      expect(result.sql).toContain("REGEXP_CONTAINS(claims_ja, @pattern)");
      expect(result.sql).toContain("@searchClaims");
    });

    it("sets searchClaims param to true when explicitly requested", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        searchClaims: true,
      });
      expect(result.params.searchClaims).toBe(true);
    });

    it("never selects claims_ja to keep scan cost minimal", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        searchClaims: true,
      });
      const selectClause = result.sql.slice(0, result.sql.indexOf("FROM"));
      expect(selectClause).not.toContain("claims_ja");
    });
  });

  describe("identifier validation", () => {
    it("throws when projectId contains invalid characters", () => {
      expect(() => buildSearchQuery("proj`; DROP TABLE x; --", "patents_jp", baseConditions)).toThrow(
        Error,
      );
    });

    it("throws when dataset contains invalid characters", () => {
      expect(() => buildSearchQuery("proj", "patents_jp`.evil", baseConditions)).toThrow(Error);
    });

    it("builds a fully-qualified table reference for valid identifiers", () => {
      const result = buildSearchQuery("my-project_1", "patents_jp", baseConditions);
      expect(result.sql).toContain("FROM `my-project_1.patents_jp.publications`");
    });
  });

  describe("select columns and ordering", () => {
    it("selects only search-safe columns, orders by date, and caps results", () => {
      const result = buildSearchQuery("proj", "patents_jp", baseConditions);
      for (const column of [
        "publication_number",
        "application_number",
        "country_code",
        "kind_code",
        "publication_date",
        "filing_date",
        "title_ja",
        "abstract_ja",
        "assignees",
        "ipc_codes",
        "cpc_codes",
        "cited_publications",
      ]) {
        expect(result.sql).toContain(column);
      }
      expect(result.sql).toContain("ORDER BY publication_date DESC");
      expect(result.sql).toContain("LIMIT 200");
    });
  });

  describe("optional filters", () => {
    it("adds an assignee filter param when assignee is provided", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        assignee: "テスト工業",
      });
      expect(result.sql).toContain("@assigneePattern");
      expect(result.params.assigneePattern).toBe("%テスト工業%");
    });

    it("omits the assignee filter when assignee is not provided", () => {
      const result = buildSearchQuery("proj", "patents_jp", baseConditions);
      expect(result.sql).not.toContain("@assigneePattern");
      expect(result.params.assigneePattern).toBeUndefined();
    });

    it("adds an IPC prefix filter param when ipcPrefix is provided", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        ipcPrefix: "H01L",
      });
      expect(result.sql).toContain("@ipcPrefix");
      expect(result.params.ipcPrefix).toBe("H01L");
    });

    it("omits the IPC filter when ipcPrefix is not provided", () => {
      const result = buildSearchQuery("proj", "patents_jp", baseConditions);
      expect(result.sql).not.toContain("@ipcPrefix");
      expect(result.params.ipcPrefix).toBeUndefined();
    });
  });

  describe("parameterization", () => {
    it("never inlines raw term text into the SQL string", () => {
      const result = buildSearchQuery("proj", "patents_jp", {
        ...baseConditions,
        terms: ["絶対に埋め込まれないはずの語"],
      });
      expect(result.sql).not.toContain("絶対に埋め込まれないはずの語");
    });
  });
});

describe("buildClaimsLookupQuery", () => {
  it("selects only claims_ja for a single publication_number", () => {
    const result = buildClaimsLookupQuery("proj", "patents_jp", "JP2020-123456A");
    expect(result.sql).toContain("SELECT claims_ja");
    expect(result.sql).toContain("FROM `proj.patents_jp.publications`");
    expect(result.sql).toContain("WHERE publication_number = @publicationNumber");
    expect(result.params.publicationNumber).toBe("JP2020-123456A");
  });

  it("throws when publicationNumber is empty", () => {
    expect(() => buildClaimsLookupQuery("proj", "patents_jp", "")).toThrow(Error);
  });

  it("throws when identifiers are invalid", () => {
    expect(() => buildClaimsLookupQuery("proj`; --", "patents_jp", "JP1")).toThrow(Error);
  });
});
