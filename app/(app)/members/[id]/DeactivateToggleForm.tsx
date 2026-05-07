"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { deactivateMember, reactivateMember } from "../actions";

type Props = {
  memberId: string;
  isActive: boolean;
};

export function DeactivateToggleForm({ memberId, isActive }: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      if (isActive) await deactivateMember(memberId);
      else await reactivateMember(memberId);
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      disabled={pending}
    >
      {pending
        ? "Saving…"
        : isActive
        ? "Deactivate"
        : "Reactivate"}
    </Button>
  );
}
