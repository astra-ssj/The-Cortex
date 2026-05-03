import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  children?: ReactNode;
}

function CardRoot({
  hoverable = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const hover =
    hoverable === true
      ? "transition-colors duration-150 hover:bg-cortex-card-hover"
      : "";

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-md)] border border-cortex-border bg-cortex-card ${hover} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function CardHeader({ className = "", children, ...rest }: CardSectionProps) {
  return (
    <div
      className={`flex items-center justify-between border-b border-cortex-border px-4 py-3.5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardBody({ className = "", children, ...rest }: CardSectionProps) {
  return (
    <div className={`p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({ className = "", children, ...rest }: CardSectionProps) {
  return (
    <div
      className={`border-t border-cortex-border px-4 py-3.5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
