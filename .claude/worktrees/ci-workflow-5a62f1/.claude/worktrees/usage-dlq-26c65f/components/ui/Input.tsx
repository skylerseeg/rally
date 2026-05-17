// components/ui/Input.tsx

import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400",
        "focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900",
        "disabled:cursor-not-allowed disabled:bg-slate-50",
        className,
      )}
      {...rest}
    />
  );
});
