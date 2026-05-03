import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span className="select-none text-cortex-text-ter" aria-hidden>
                  /
                </span>
              ) : null}
              {isLast ? (
                <span className="font-medium text-cortex-text" aria-current="page">
                  {item.label}
                </span>
              ) : item.href !== undefined ? (
                <Link
                  to={item.href}
                  className="text-cortex-text-sec transition-colors hover:text-cortex-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-cortex-text-sec">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
