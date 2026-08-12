import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "16px",
  borderRadius = "4px",
  className,
  style = {},
}: SkeletonProps) {
  return (
    <div
      className={className ? `skeleton-shimmer ${className}` : "skeleton-shimmer"}
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "20px 24px",
      }}
    >
      <Skeleton width="60%" height="11px" style={{ marginBottom: "12px" }} />
      <Skeleton width="40%" height="32px" borderRadius="6px" />
    </div>
  );
}

export function FrameworkCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ flex: 1 }}>
          <Skeleton width="70%" height="13px" style={{ marginBottom: "6px" }} />
          <Skeleton width="45%" height="10px" />
        </div>
        <Skeleton width="36px" height="24px" borderRadius="6px" />
      </div>
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "10px",
        }}
      >
        <Skeleton width="64px" height="18px" borderRadius="4px" />
        <Skeleton width="48px" height="18px" borderRadius="4px" />
      </div>
      <Skeleton width="100%" height="3px" borderRadius="2px" />
    </div>
  );
}

export function EntityCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--border-l)",
        borderRadius: "10px",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <div>
          <Skeleton width="28px" height="28px" borderRadius="50%" style={{ marginBottom: "8px" }} />
          <Skeleton width="120px" height="14px" style={{ marginBottom: "4px" }} />
          <Skeleton width="90px" height="11px" />
        </div>
        <div style={{ textAlign: "right" }}>
          <Skeleton width="48px" height="32px" borderRadius="6px" style={{ marginBottom: "6px" }} />
          <Skeleton width="64px" height="18px" borderRadius="4px" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width="52px" height="18px" borderRadius="4px" />
        ))}
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  const widths = ["80px", "180px", "160px", "100px", "60px", "120px"];
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "14px" }}>
          <Skeleton width={widths[i] ?? "100px"} height="12px" />
        </td>
      ))}
    </tr>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div style={{ marginBottom: "24px" }}>
      <Skeleton width="200px" height="28px" borderRadius="6px" style={{ marginBottom: "8px" }} />
      <Skeleton width="320px" height="12px" />
    </div>
  );
}

export function HeatmapSkeleton() {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "20px",
      }}
    >
      <Skeleton width="240px" height="12px" style={{ marginBottom: "16px" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto repeat(8, 52px)",
          gap: "4px",
        }}
      >
        {Array.from({ length: 9 * 6 }).map((_, i) => (
          <Skeleton key={i} width={i % 9 === 0 ? "80px" : "52px"} height="32px" borderRadius="4px" />
        ))}
      </div>
    </div>
  );
}
