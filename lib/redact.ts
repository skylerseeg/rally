// lib/redact.ts
//
// Privacy gate. Every outbound Claude prompt that touches member data
// passes through this file. Keep it boring, paranoid, and well-tested.
//
// Hard rules (CLAUDE.md "Privacy Rules" + the redaction-rules table in
// docs/ARCHITECTURE.md):
//
//   * `last_name` is dropped. The redacted shape carries `first_name`
//     only — no last initial. (Stricter than the doc's prose; the doc
//     was updated to match in this PR.)
//   * `birthdate` is converted to `age_years`; the raw date never
//     leaves Supabase.
//   * Phone, email, address, parent contacts, photo identifiers, and
//     free-text notes are dropped by default.
//   * Notes can be opted in (`includeNotes: true`); when included, the
//     general string is run through scrubNotes() to strip phone/email/
//     URL/zip/address-shaped substrings.
//   * Member ids are replaced with per-request opaque tokens
//     (createTokenMapper) so suggestions can be mapped back without
//     ever putting a uuid in a prompt.
//   * Belt-and-suspenders: after redaction, if a record contains both
//     a name field AND any value that looks like a date of birth, the
//     redactor throws.

import { createHash } from "node:crypto";

import { differenceInYears } from "date-fns";

import { RedactionError } from "@/lib/errors";
import type { Database, Json } from "@/supabase/types";

export type Member = Database["public"]["Tables"]["members"]["Row"];

export type RedactedMember = {
  id: string;
  first_name: string;
  age_years: number | null;
  quorum_class: string;
  tenure_label: string | null;
  interests: string[];
  notes?: { general: string };
};

export type RedactOptions = {
  /**
   * When true, include `notes.general` after running it through
   * scrubNotes(). Default false — notes never leave the DB unless the
   * caller's agent schema explicitly opts in.
   */
  includeNotes?: boolean;
  /**
   * Per-request seed used to derive opaque tokens for member ids.
   * Required when the caller needs to map agent suggestions back to
   * real members; supply via createTokenMapper().
   */
  tokenSeed?: string;
  /**
   * Override the salt read from RALLY_USAGE_HASH_SALT. Tests pass a
   * fixed value here. Production should leave this unset and rely on
   * the env var.
   */
  hashSalt?: string;
  /**
   * Stable "now" for age calculation. Tests pin it. Defaults to
   * new Date().
   */
  now?: Date;
};

// ---------------------------------------------------------------------------
// scrubNotes — strip phone/email/url/zip/address-shaped substrings
// ---------------------------------------------------------------------------

const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/\S+/g;
const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/g;
// Match a number followed by 1-4 capitalised words then a street suffix.
// Suffix list covers the long forms and common abbreviations.
const ADDRESS_RE =
  /\b\d{1,6}\s+(?:[A-Z][\w'.-]*\s+){1,4}(?:Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Road|Rd\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Circle|Cir\.?|Court|Ct\.?|Place|Pl\.?|Way|Terrace|Ter\.?|Highway|Hwy\.?)\b/g;

export function scrubNotes(text: string): string {
  if (!text) return "";
  return text
    // Order matters: addresses first (they may contain a zip), then
    // zips (so a bare 5-digit number at the end of an address is also
    // covered), then the rest.
    .replace(ADDRESS_RE, "[address]")
    .replace(URL_RE, "[url]")
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(ZIP_RE, "[zip]");
}

// ---------------------------------------------------------------------------
// Token mapper — opaque per-request id ↔ real id
// ---------------------------------------------------------------------------

export type TokenMapper = {
  tokenize: (member: Pick<Member, "id">) => string;
  resolve: (token: string) => string | undefined;
};

function tokenFor(memberId: string, seed: string, salt: string): string {
  return createHash("sha256")
    .update(`${memberId}|${seed}|${salt}`)
    .digest("hex")
    .slice(0, 16);
}

export function createTokenMapper(
  seed: string,
  saltOverride?: string,
): TokenMapper {
  const salt = saltOverride ?? process.env.RALLY_USAGE_HASH_SALT ?? "";
  // In-memory only. Discarded when the request goroutine ends.
  const tokenToId = new Map<string, string>();
  return {
    tokenize(member) {
      const t = tokenFor(member.id, seed, salt);
      tokenToId.set(t, member.id);
      return t;
    },
    resolve(token) {
      return tokenToId.get(token);
    },
  };
}

// ---------------------------------------------------------------------------
// Hard-fail: refuse to emit a record that has both a name and a DOB.
// ---------------------------------------------------------------------------

const DOB_KEY_RE = /(birth|dob|date_of_birth)/i;
const NAME_KEY_RE = /name/i;
const DOB_VALUE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Internal: scan a redacted record and throw if it carries both a
 * name-shaped field and a DOB-shaped field/value at the top level.
 *
 * Exported for testing only — agents must call redactMember() not this.
 */
export function _assertNoNameAndDob(record: Record<string, unknown>): void {
  const keys = Object.keys(record);
  const hasNameKey = keys.some((k) => NAME_KEY_RE.test(k));
  const hasDobKey = keys.some((k) => DOB_KEY_RE.test(k));

  if (hasNameKey && hasDobKey) {
    throw new RedactionError(
      "Redacted record contains both a name field and a DOB field.",
      "NAME_AND_DOB_PRESENT",
    );
  }

  // Value-level: catch a date-shaped string snuck into a non-name,
  // non-notes field. Skip the `notes` envelope (free-form prose can
  // legitimately contain dates) and `interests` (tags).
  const dobValueLeaked = Object.entries(record).some(([k, v]) => {
    if (k === "notes" || k === "interests") return false;
    return typeof v === "string" && DOB_VALUE_RE.test(v);
  });

  if (hasNameKey && dobValueLeaked) {
    throw new RedactionError(
      "Redacted record contains both a name field and a date-shaped value.",
      "NAME_AND_DOB_PRESENT",
    );
  }
}

// ---------------------------------------------------------------------------
// redactMember
// ---------------------------------------------------------------------------

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function tenureLabelFromAge(ageYears: number | null): string | null {
  if (ageYears === null) return null;
  if (ageYears <= 12) return "youngest";
  if (ageYears <= 14) return "middle";
  return "older";
}

function readGeneralNote(notes: Json | null | undefined): string | null {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return null;
  const general = (notes as Record<string, Json | undefined>)["general"];
  return typeof general === "string" && general.length > 0 ? general : null;
}

function ageYearsFromBirthdate(
  birthdate: string | null | undefined,
  now: Date,
): number | null {
  if (!birthdate) return null;
  const parsed = new Date(birthdate);
  if (Number.isNaN(parsed.getTime())) return null;
  return differenceInYears(now, parsed);
}

export function redactMember(
  member: Member,
  opts: RedactOptions = {},
): RedactedMember {
  const now = opts.now ?? new Date();

  // Name fallback chain: first_name → preferred_name. Last name is
  // never carried into the redacted record under any condition.
  const nameSource = isNonEmpty(member.first_name)
    ? member.first_name
    : isNonEmpty(member.preferred_name)
    ? member.preferred_name
    : null;

  if (!nameSource) {
    throw new RedactionError(
      "Member has no first_name or preferred_name; cannot redact.",
      "UNREDACTABLE_INPUT",
    );
  }

  const ageYears = ageYearsFromBirthdate(member.birthdate, now);

  // Opaque token for the id. If a tokenSeed isn't supplied we still
  // hash but use a per-call random-ish value so the output never
  // contains the raw uuid.
  const seed = opts.tokenSeed ?? `__one-shot__:${member.id}`;
  const salt = opts.hashSalt ?? process.env.RALLY_USAGE_HASH_SALT ?? "";
  const id = tokenFor(member.id, seed, salt);

  const redacted: RedactedMember = {
    id,
    first_name: nameSource,
    age_years: ageYears,
    quorum_class: member.quorum_class,
    tenure_label: tenureLabelFromAge(ageYears),
    // `interests` aren't on the schema yet; emit an empty list so the
    // shape stays stable when they land. Don't try to derive from notes.
    interests: [],
  };

  if (opts.includeNotes) {
    const general = readGeneralNote(member.notes);
    if (general !== null) {
      redacted.notes = { general: scrubNotes(general) };
    }
  }

  _assertNoNameAndDob(redacted as unknown as Record<string, unknown>);

  return redacted;
}

export function redactMembers(
  members: Member[],
  opts: RedactOptions = {},
): RedactedMember[] {
  return members.map((m) => redactMember(m, opts));
}
