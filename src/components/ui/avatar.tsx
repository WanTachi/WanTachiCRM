import type { HTMLAttributes } from "react";

type AvatarProps = HTMLAttributes<HTMLSpanElement> & { initials: string };

export function Avatar({ initials, className = "", ...props }: AvatarProps) {
  return (
    <span className={`avatar ${className}`.trim()} aria-label={`Профиль ${initials}`} {...props}>
      {initials}
    </span>
  );
}
