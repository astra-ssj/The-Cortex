import type { HTMLAttributes, MouseEvent, ReactNode, TdHTMLAttributes } from "react";

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
}

export interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function TableBase({ className = "", children, ...rest }: TableProps) {
  return (
    <div
      className={`w-full overflow-hidden rounded-[var(--radius-md)] border border-cortex-border bg-cortex-card ${className}`}
      {...rest}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

export interface TableHeaderProps {
  columns: TableColumn[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}

function alignClass(align: TableColumn["align"]) {
  switch (align) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    default:
      return "text-left";
  }
}

function TableHeader({
  columns,
  sortKey,
  sortDir,
  onSort,
}: TableHeaderProps) {
  return (
    <thead className="sticky top-0 z-10 bg-cortex-elevated">
      <tr className="border-b border-cortex-border">
        {columns.map((col) => {
          const active = sortKey === col.key;
          const sortable = onSort !== undefined;
          return (
            <th
              key={col.key}
              scope="col"
              style={col.width !== undefined ? { width: col.width } : undefined}
              className={`${alignClass(col.align)} px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-cortex-text-sec`}
            >
              {sortable ? (
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] font-semibold uppercase tracking-wide text-cortex-text-sec transition-colors hover:text-cortex-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "text-cortex-text" : ""}`}
                  onClick={() => {
                    onSort?.(col.key);
                  }}
                >
                  <span>{col.label}</span>
                  {active ? (
                    <span className="text-cortex-blue" aria-hidden>
                      {sortDir === "desc" ? "▼" : "▲"}
                    </span>
                  ) : null}
                </button>
              ) : (
                col.label
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

function TableRow({
  selected = false,
  className = "",
  onClick,
  children,
  ...rest
}: TableRowProps) {
  const clickable = onClick !== undefined;
  const selection =
    selected === true ? "bg-cortex-blue/[0.08]" : "";
  const hover =
    clickable === true
      ? "cursor-pointer transition-colors hover:bg-cortex-card-hover"
      : "";

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    onClick?.(e);
  }

  return (
    <tr
      className={`border-b border-cortex-border-sub ${selection} ${hover} ${className}`}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </tr>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
}

function TableCell({ className = "", children, ...rest }: TableCellProps) {
  return (
    <td
      className={`px-4 py-2.5 text-xs text-cortex-text sm:text-[13px] ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}

export const Table = Object.assign(TableBase, {
  Header: TableHeader,
  Row: TableRow,
  Cell: TableCell,
});
