// components/ui/Card.tsx

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
        className,
      )}
      {...rest}
    />
  );
});
