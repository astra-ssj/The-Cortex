import EvidenceVaultPanel from "../components/EvidenceVault";

// Evidence Vault is its own first-class destination under Inventory (no longer a tab
// inside Intelligence). The append-only, hash-chained record store is an inventory of
// proof, not a reasoning surface — so it lives beside AI Systems and Integrations.
export default function EvidenceVault() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        fontFamily: "var(--font-sans)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 24,
            margin: 0,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          Evidence Vault
        </h1>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--dim)",
            margin: "8px 0 0",
            maxWidth: 460,
            lineHeight: 1.5,
          }}
        >
          Append-only, hash-chained record of every assessment, approval, and override
        </p>
      </header>

      <EvidenceVaultPanel />
    </div>
  );
}
