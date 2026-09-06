-- =========================================================
-- KIVANTA SCOUT
-- D1 Migration 0001
--
-- Initial durable investigation architecture.
--
-- Creates:
-- 1. investigations
-- 2. active_review_claims
-- 3. investigation_dispatch_outbox
--
-- This supports Scout's locked architecture:
--
-- investigation
--      ↓
-- unique active review claim
--      ↓
-- durable dispatch/outbox
--      ↓
-- Queue later
--
-- D1 is the authoritative state.
-- =========================================================


PRAGMA foreign_keys = ON;


-- =========================================================
-- 1. INVESTIGATIONS
-- =========================================================
--
-- One row represents one Scout investigation.
--
-- Exact review identity:
--
-- provider
-- + repository_id
-- + commit_sha
-- + methodology_id
-- + methodology_version
--
-- target_json stores the complete frozen target.
-- =========================================================

CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT NOT NULL PRIMARY KEY,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    provider TEXT NOT NULL,

    repository_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL,

    methodology_id TEXT NOT NULL,
    methodology_version TEXT NOT NULL,

    lifecycle_state TEXT NOT NULL,

    target_json TEXT NOT NULL,

    failure_reason TEXT
);


CREATE INDEX IF NOT EXISTS idx_investigations_review_identity
ON investigations (
    provider,
    repository_id,
    commit_sha,
    methodology_id,
    methodology_version
);


CREATE INDEX IF NOT EXISTS idx_investigations_lifecycle_state
ON investigations (
    lifecycle_state
);


-- =========================================================
-- 2. ACTIVE REVIEW CLAIMS
-- =========================================================
--
-- Prevents duplicate active work for the exact
-- same review identity.
-- =========================================================

CREATE TABLE IF NOT EXISTS active_review_claims (
    provider TEXT NOT NULL,

    repository_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL,

    methodology_id TEXT NOT NULL,
    methodology_version TEXT NOT NULL,

    investigation_id TEXT NOT NULL UNIQUE,

    claimed_at TEXT NOT NULL,

    PRIMARY KEY (
        provider,
        repository_id,
        commit_sha,
        methodology_id,
        methodology_version
    ),

    FOREIGN KEY (
        investigation_id
    )
    REFERENCES investigations (
        investigation_id
    )
    ON DELETE CASCADE
);


-- =========================================================
-- 3. INVESTIGATION DISPATCH OUTBOX
-- =========================================================
--
-- D1 and Cloudflare Queue are separate systems.
--
-- Scout first records durable dispatch intent here.
-- Queue sending comes later.
-- =========================================================

CREATE TABLE IF NOT EXISTS investigation_dispatch_outbox (
    outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,

    investigation_id TEXT NOT NULL,

    event_type TEXT NOT NULL
        DEFAULT 'INVESTIGATION_REQUESTED',

    dispatch_state TEXT NOT NULL
        DEFAULT 'PENDING',

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    available_at TEXT NOT NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    dispatched_at TEXT,

    last_error TEXT,

    UNIQUE (
        investigation_id,
        event_type
    ),

    FOREIGN KEY (
        investigation_id
    )
    REFERENCES investigations (
        investigation_id
    )
    ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_dispatch_outbox_pending
ON investigation_dispatch_outbox (
    dispatch_state,
    available_at
);