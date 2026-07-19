// SPDX-License-Identifier: AGPL-3.0-or-later
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        variant === 'primary' ? 'btn-primary' : 'btn-ghost',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        className
      )}
      {...props}
    />
  );
}
