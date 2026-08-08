# Phase 6–7 Lean Control Backend — Implementation Plan

> Spec: `docs/superpowers/specs/2026-08-08-phase6-7-control-backend-design.md`

**Goal:** DB + services + Hono for revision, lean gates, payments, R2 artifacts, release/settle/reconcile/close. No SPA.

## Tasks

1. Schema migration `0020_phase6_7_control` + enums
2. `revision` + `gates` + approve creates READY lines
3. `payments` state machine + `release` + register CSV
4. R2 `ArtifactStore` + `artifacts` service
5. `close` + distributions + reconcile
6. Hono `/v1` pay-run control routes
7. Lifecycle tests with in-memory store
