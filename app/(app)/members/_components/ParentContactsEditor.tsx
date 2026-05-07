"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  PARENT_RELATIONSHIPS,
  type ParentContact,
} from "@/lib/validation/member";

type Props = {
  value: ParentContact[];
  onChange: (next: ParentContact[]) => void;
};

export function ParentContactsEditor({ value, onChange }: Props) {
  function addEmpty() {
    onChange([
      ...value,
      {
        name: "",
        relationship: "mother",
        phone: "",
        email: "",
        is_primary: value.length === 0,
      },
    ]);
  }

  function update(index: number, patch: Partial<ParentContact>) {
    const next = value.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  }

  function remove(index: number) {
    const next = value.filter((_, i) => i !== index);
    // If we removed the primary, promote the first remaining contact.
    if (
      value[index]?.is_primary &&
      next.length > 0 &&
      !next.some((c) => c.is_primary)
    ) {
      next[0] = { ...next[0]!, is_primary: true };
    }
    onChange(next);
  }

  function setPrimary(index: number) {
    onChange(value.map((c, i) => ({ ...c, is_primary: i === index })));
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="block text-xs font-medium uppercase tracking-wide text-slate-600">
        Parent contacts
      </span>

      {value.length === 0 ? (
        <p className="text-sm text-slate-500">
          No parent contacts yet. Add at least one for emergency reach.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {value.map((c, i) => (
            <li
              key={i}
              className="rounded-md border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`pc-name-${i}`}>Name</Label>
                  <Input
                    id={`pc-name-${i}`}
                    value={c.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Parent or guardian name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`pc-rel-${i}`}>Relationship</Label>
                  <select
                    id={`pc-rel-${i}`}
                    value={c.relationship}
                    onChange={(e) =>
                      update(i, {
                        relationship: e.target
                          .value as ParentContact["relationship"],
                      })
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    {PARENT_RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`pc-phone-${i}`}>Phone</Label>
                  <Input
                    id={`pc-phone-${i}`}
                    inputMode="tel"
                    value={c.phone ?? ""}
                    onChange={(e) => update(i, { phone: e.target.value })}
                    placeholder="(801) 555-1212"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`pc-email-${i}`}>Email</Label>
                  <Input
                    id={`pc-email-${i}`}
                    inputMode="email"
                    value={c.email ?? ""}
                    onChange={(e) => update(i, { email: e.target.value })}
                    placeholder="parent@example.com"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!c.is_primary}
                    onChange={() => setPrimary(i)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  Primary contact
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => remove(i)}
                  className="text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addEmpty}>
          Add parent contact
        </Button>
      </div>
    </div>
  );
}
