// components/ui/Label.tsx

import { forwardRef, type LabelHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Props = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, Props>(function Label(
  { className, ...rest },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn(
        "block text-xs font-medium uppercase tracking-wide text-slate-600",
        className,
      )}
      {...rest}
    />
  );
});
