"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { deleteActivity } from "../actions";

type Props = {
  activityId: string;
  title: string;
};

export function DeleteActivityForm({ activityId, title }: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (
      !window.confirm(
        `Delete "${title}"? Attendance records for this activity will also be removed.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteActivity(activityId);
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      disabled={pending}
      className="text-red-700 hover:bg-red-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
