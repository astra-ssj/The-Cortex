import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { PageSnapshot } from "../components/help/PageSnapshot";
import { HELP_DOC_SECTIONS, HELP_TOC } from "../lib/helpDocsContent";
import { replayTour } from "../lib/welcomeTour";

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function HelpDocs() {
  const [activeId, setActiveId] = useState(HELP_TOC[0]?.id ?? "overview");
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_DOC_SECTIONS;
    return HELP_DOC_SECTIONS.map((section) => {
      const haystack = [
        section.title,
        section.intro ?? "",
        ...section.steps.flatMap((s) => [s.title, s.body, ...(s.tips ?? [])]),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return section;
      const steps = section.steps.filter((step) => {
        const h = [step.title, step.body, ...(step.tips ?? [])].join(" ").toLowerCase();
        return h.includes(q);
      });
      if (steps.length === 0) return null;
      return { ...section, steps };
    }).filter((s): s is (typeof HELP_DOC_SECTIONS)[number] => s !== null);
  }, [query]);

  useEffect(() => {
    const ids = HELP_TOC.map((t) => t.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1));
        const first = visible[0];
        if (first?.target.id && ids.includes(first.target.id)) {
          setActiveId(first.target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ paddingTop: 4, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: 28 }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--cyan)",
          }}
        >
          Documentation
        </p>
        <h1 className="cortex-text-page-title" style={{ margin: "0 0 10px" }}>
          Astra GRC Help & Onboarding
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 640 }}>
          Step-by-step guide from registration through daily compliance workflows. Illustrations mirror each
          screen — use the table of contents to jump to a topic.
        </p>
        <button
          type="button"
          onClick={() => replayTour()}
          style={{
            marginTop: 12,
            padding: 0,
            border: "none",
            background: "none",
            fontSize: 13,
            color: "var(--cyan)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Replay welcome tour
        </button>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          <input
            type="search"
            placeholder="Search documentation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: "1 1 240px",
              maxWidth: 360,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Press <kbd style={kbdStyle}>H</kbd> for quick help · <kbd style={kbdStyle}>⌘K</kbd> command palette
          </span>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 220px) minmax(0, 1fr)",
          gap: 32,
          alignItems: "start",
        }}
      >
        <nav
          aria-label="Documentation contents"
          style={{
            position: "sticky",
            top: 16,
            padding: "12px 0",
            borderRight: "1px solid var(--border-subtle)",
            paddingRight: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--text-tertiary)",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            On this page
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {HELP_TOC.map((item) => (
              <li key={item.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    background: activeId === item.id ? "var(--elevated)" : "transparent",
                    color: activeId === item.id ? "var(--text)" : "var(--text-secondary)",
                    borderLeft:
                      activeId === item.id ? "2px solid var(--cyan)" : "2px solid transparent",
                  }}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            <Link
              to="/dashboard"
              style={{ fontSize: 12, color: "var(--cyan)", textDecoration: "none" }}
            >
              ← Back to Dashboard
            </Link>
          </div>
        </nav>

        <div>
          {filteredSections.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No topics match your search.</p>
          ) : null}

          {filteredSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              style={{
                marginBottom: 48,
                scrollMarginTop: 24,
              }}
            >
              <h2
                style={{
                  margin: "0 0 12px",
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--text)",
                }}
              >
                {section.title}
              </h2>
              {section.intro ? (
                <p
                  style={{
                    margin: "0 0 20px",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                  }}
                >
                  {section.intro}
                </p>
              ) : null}

              <ol
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}
              >
                {section.steps.map((step, index) => (
                  <li
                    key={`${section.id}-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: step.snapshot ? "minmax(0, 1fr) minmax(200px, 280px)" : "1fr",
                      gap: 20,
                      alignItems: "start",
                      padding: "16px 0 0",
                      borderTop: index > 0 ? "1px solid var(--border-subtle)" : undefined,
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: "0 0 8px",
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text)",
                        }}
                      >
                        {step.title}
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          color: "var(--text-secondary)",
                          lineHeight: 1.65,
                        }}
                      >
                        {step.body}
                      </p>
                      {step.tips?.length ? (
                        <ul
                          style={{
                            margin: "12px 0 0",
                            paddingLeft: 18,
                            fontSize: 13,
                            color: "var(--text-tertiary)",
                            lineHeight: 1.55,
                          }}
                        >
                          {step.tips.map((tip) => (
                            <li key={tip} style={{ marginBottom: 4 }}>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {step.snapshot ? (
                      <PageSnapshot
                        variant={step.snapshot}
                        caption={step.snapshotCaption}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <footer
            style={{
              marginTop: 32,
              paddingTop: 24,
              borderTop: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-tertiary)",
            }}
          >
            <p style={{ margin: "0 0 8px" }}>Astra GRC · AstraLabs Group · Enterprise compliance intelligence</p>
            <a
              href="https://github.com/AstraLabs-AI/The-Cortex"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--cyan)" }}
            >
              Open source repository →
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--elevated)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};
