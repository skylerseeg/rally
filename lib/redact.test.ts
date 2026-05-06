// lib/redact.test.ts

import { beforeEach, describe, expect, it } from "vitest";

import { RedactionError } from "@/lib/errors";
import {
  _assertNoNameAndDob,
  createTokenMapper,
  redactMember,
  scrubNotes,
  type Member,
} from "@/lib/redact";

const FIXED_NOW = new Date("2026-05-06T00:00:00Z");

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    unit_id: "00000000-0000-0000-0000-000000000010",
    quorum_class: "deacons",
    first_name: "Tyson",
    last_name: "Barrio",
    preferred_name: null,
    birthdate: "2014-12-29",
    parent_contacts: [{ name: "Mom", phone: "801-555-1212" }],
    notes: { general: "Loves baseball." },
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.RALLY_USAGE_HASH_SALT = "test-salt";
});

describe("redactMember — drops", () => {
  it("drops last_name", () => {
    const m = makeMember();
    const r = redactMember(m, { now: FIXED_NOW });
    expect(r).not.toHaveProperty("last_name");
    expect(JSON.stringify(r)).not.toContain("Barrio");
  });

  it("drops phone, email, parent_contacts, photo_object_id", () => {
    const phantom = {
      ...makeMember(),
      // Fields not on the schema today, but defensively dropped if a
      // future schema drift slips them through.
      phone: "555-1234",
      email: "tyson@example.com",
      parent_contacts: [{ phone: "801-555-1212" }],
      photo_object_id: "members/abc.jpg",
    };
    const r = redactMember(phantom as unknown as Member, { now: FIXED_NOW });

    expect(r).not.toHaveProperty("phone");
    expect(r).not.toHaveProperty("email");
    expect(r).not.toHaveProperty("parent_contacts");
    expect(r).not.toHaveProperty("photo_object_id");

    const json = JSON.stringify(r);
    expect(json).not.toContain("555-1234");
    expect(json).not.toContain("tyson@example.com");
    expect(json).not.toContain("members/abc.jpg");
  });

  it("drops notes by default", () => {
    const m = makeMember({
      notes: { general: "very personal note about Tyson" },
    });
    const r = redactMember(m, { now: FIXED_NOW });
    expect(r).not.toHaveProperty("notes");
    expect(JSON.stringify(r)).not.toContain("personal note");
  });
});

describe("redactMember — notes opt-in", () => {
  it("includes scrubbed notes when includeNotes: true", () => {
    const m = makeMember({
      notes: {
        general: "Mom: 801-555-9999 / mom@example.com / 123 Maple Street",
      },
    });
    const r = redactMember(m, { includeNotes: true, now: FIXED_NOW });
    expect(r.notes?.general).toBeDefined();
    expect(r.notes?.general).not.toContain("801-555-9999");
    expect(r.notes?.general).not.toContain("mom@example.com");
    expect(r.notes?.general).not.toContain("123 Maple Street");
  });

  it("notes scrubbing replaces phone numbers", () => {
    expect(scrubNotes("Call (801) 555-1234 today.")).toBe(
      "Call [phone] today.",
    );
    expect(scrubNotes("Reach out: 801.555.1234")).toBe("Reach out: [phone]");
    expect(scrubNotes("8015551234")).toBe("[phone]");
  });

  it("notes scrubbing replaces emails", () => {
    expect(scrubNotes("Email tyson@example.com please.")).toBe(
      "Email [email] please.",
    );
    expect(scrubNotes("Multi: a@b.co, c.d+tag@foo-bar.io")).toBe(
      "Multi: [email], [email]",
    );
  });

  it("notes scrubbing replaces URLs", () => {
    expect(scrubNotes("See https://example.com/path?x=1 for more.")).toBe(
      "See [url] for more.",
    );
    expect(scrubNotes("http://foo.bar")).toBe("[url]");
  });

  it("notes scrubbing replaces addresses", () => {
    expect(scrubNotes("Lives at 123 Maple Street.")).toBe(
      "Lives at [address].",
    );
    expect(scrubNotes("Pickup: 4500 W Country Club Dr.")).toBe(
      "Pickup: [address].",
    );
    expect(scrubNotes("Old place: 22 N Main Avenue")).toBe(
      "Old place: [address]",
    );
  });
});

describe("redactMember — birthdate handling", () => {
  it("converts birthday to age_years", () => {
    const m = makeMember({ birthdate: "2013-01-25" });
    const r = redactMember(m, { now: FIXED_NOW });
    // FIXED_NOW = 2026-05-06; birthday 2013-01-25 → 13 full years
    expect(r.age_years).toBe(13);
  });

  it("never includes the raw birthday", () => {
    const m = makeMember({ birthdate: "2013-01-25" });
    const r = redactMember(m, { now: FIXED_NOW });
    const json = JSON.stringify(r);
    expect(json).not.toContain("2013-01-25");
    expect(r).not.toHaveProperty("birthdate");
    expect(r).not.toHaveProperty("birthday");
    expect(r).not.toHaveProperty("dob");
  });
});

describe("redactMember — name validation", () => {
  it("throws RedactionError when first_name and preferred_name are both empty", () => {
    const m = makeMember({ first_name: "", preferred_name: null });
    expect(() => redactMember(m, { now: FIXED_NOW })).toThrowError(
      RedactionError,
    );
    try {
      redactMember(m, { now: FIXED_NOW });
    } catch (err) {
      expect(err).toBeInstanceOf(RedactionError);
      expect((err as RedactionError).code).toBe("UNREDACTABLE_INPUT");
    }
  });

  it("falls back to preferred_name when first_name is empty", () => {
    const m = makeMember({ first_name: "", preferred_name: "Ty" });
    const r = redactMember(m, { now: FIXED_NOW });
    expect(r.first_name).toBe("Ty");
  });
});

describe("_assertNoNameAndDob — hard-fail belt-and-suspenders", () => {
  it("throws RedactionError if redacted record somehow ends up with both name + dob", () => {
    const fakeRedacted = {
      first_name: "Tyson",
      birthdate: "2014-12-29",
      quorum_class: "deacons",
    };
    expect(() => _assertNoNameAndDob(fakeRedacted)).toThrowError(
      RedactionError,
    );
    try {
      _assertNoNameAndDob(fakeRedacted);
    } catch (err) {
      expect(err).toBeInstanceOf(RedactionError);
      expect((err as RedactionError).code).toBe("NAME_AND_DOB_PRESENT");
    }
  });

  it("also catches a date-shaped value in a non-notes field", () => {
    const fakeRedacted = {
      first_name: "Tyson",
      something_weird: "2014-12-29",
    };
    expect(() => _assertNoNameAndDob(fakeRedacted)).toThrowError(
      RedactionError,
    );
  });

  it("does NOT throw when there's a name but no DOB", () => {
    const ok = {
      id: "abc",
      first_name: "Tyson",
      age_years: 11,
      quorum_class: "deacons",
    };
    expect(() => _assertNoNameAndDob(ok)).not.toThrow();
  });
});

describe("createTokenMapper", () => {
  it("tokenize is deterministic given same seed", () => {
    const a = createTokenMapper("seed-1", "salt-A");
    const b = createTokenMapper("seed-1", "salt-A");
    const member = { id: "00000000-0000-0000-0000-000000000001" };
    expect(a.tokenize(member)).toBe(b.tokenize(member));
  });

  it("tokenize is different with different seeds", () => {
    const a = createTokenMapper("seed-1", "salt-A");
    const b = createTokenMapper("seed-2", "salt-A");
    const member = { id: "00000000-0000-0000-0000-000000000001" };
    expect(a.tokenize(member)).not.toBe(b.tokenize(member));
  });

  it("resolve returns the original id when given a tokenized id", () => {
    const m = createTokenMapper("seed-1", "salt-A");
    const member = { id: "00000000-0000-0000-0000-000000000123" };
    const tok = m.tokenize(member);
    expect(m.resolve(tok)).toBe(member.id);
  });

  it("resolve returns undefined for an unknown token", () => {
    const m = createTokenMapper("seed-1", "salt-A");
    expect(m.resolve("0000000000000000")).toBeUndefined();
  });
});
