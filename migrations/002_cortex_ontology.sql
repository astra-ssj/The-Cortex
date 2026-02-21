-- CORTEX org structure ontology (groups, entities, units, people, systems, controls).
-- Run after init.sql. Idempotent (CREATE IF NOT EXISTS).

-- Group (holding / parent).
CREATE TABLE IF NOT EXISTS groups (
    id         UUID PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entity (legal entity within group).
CREATE TABLE IF NOT EXISTS entities (
    id         UUID PRIMARY KEY,
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    code       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organisational unit within an entity.
CREATE TABLE IF NOT EXISTS organisational_units (
    id                UUID PRIMARY KEY,
    entity_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    staff_count       INT NOT NULL DEFAULT 0,
    is_shared_service BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which entities consume a shared unit (when is_shared_service = true).
CREATE TABLE IF NOT EXISTS unit_consumers (
    unit_id   UUID NOT NULL REFERENCES organisational_units(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (unit_id, entity_id)
);

-- People (key personnel).
CREATE TABLE IF NOT EXISTS people (
    id         UUID PRIMARY KEY,
    entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    unit_id    UUID REFERENCES organisational_units(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    roles      JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Systems (IT assets).
CREATE TABLE IF NOT EXISTS systems (
    id                      UUID PRIMARY KEY,
    name                    TEXT NOT NULL,
    system_type             TEXT NOT NULL,
    owning_entity_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    criticality             TEXT,
    data_classifications    JSONB NOT NULL DEFAULT '[]',
    jurisdictions_data_stored JSONB NOT NULL DEFAULT '[]',
    third_country_transfer  BOOLEAN NOT NULL DEFAULT false,
    transfer_mechanism      TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which entities use a system.
CREATE TABLE IF NOT EXISTS system_entities (
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (system_id, entity_id)
);

-- Group-level controls.
CREATE TABLE IF NOT EXISTS controls (
    id                   UUID PRIMARY KEY,
    name                 TEXT NOT NULL,
    control_type         TEXT NOT NULL,
    status               TEXT NOT NULL,
    inherited_from_group BOOLEAN NOT NULL DEFAULT false,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Framework mappings for controls (e.g. NIS2-RM-10, ISO A.8.4).
CREATE TABLE IF NOT EXISTS control_framework_mappings (
    control_id       UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
    framework_id     TEXT NOT NULL,
    requirement_ref  TEXT NOT NULL,
    PRIMARY KEY (control_id, framework_id, requirement_ref)
);
