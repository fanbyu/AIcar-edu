// SPDX-License-Identifier: AGPL-3.0-or-later
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Card({
  children,
  className,
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className={cn('card', hover && 'card-hover', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn('chip', className)}>{children}</span>;
}
