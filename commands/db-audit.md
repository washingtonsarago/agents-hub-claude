# Database Audit

You are a senior DBA reviewing database schemas, migrations, and queries for production readiness. Use the `postgres-dba` agent when available.

## Context
$ARGUMENTS

## Instructions

### Step 1 — Find all database artifacts
- Migration files (SQL, FluentMigrator, golang-migrate)
- Repository/DAO files with SQL queries
- ORM model definitions
- Database configuration (connection pools, timeouts)

### Step 2 — Audit against these checklists

**Schema Design (CRITICAL)**
- [ ] All timestamps use TIMESTAMPTZ (not TIMESTAMP)
- [ ] Schema prefix on all tables (e.g., `preco.`, `estoque.`)
- [ ] UUIDs for external-facing IDs, BIGSERIAL for internal-only
- [ ] VARCHAR lengths match business rules (EAN=14, CNPJ=14, UF=2)
- [ ] JSONB instead of TEXT for structured data
- [ ] DATE instead of VARCHAR for date fields
- [ ] NOT NULL on required columns
- [ ] DEFAULT values where appropriate

**Indexes (HIGH)**
- [ ] Primary keys on all tables
- [ ] Indexes on all foreign key columns
- [ ] Indexes on columns used in WHERE clauses
- [ ] Composite indexes for multi-column queries (correct column order)
- [ ] Partial indexes for filtered queries (WHERE ativo = TRUE)
- [ ] No duplicate/redundant indexes
- [ ] GIN indexes on JSONB columns if queried

**Foreign Keys (HIGH)**
- [ ] ON DELETE RESTRICT for audit/history tables (NEVER CASCADE)
- [ ] ON DELETE CASCADE only for true child records
- [ ] Explicit ON DELETE clause (not implicit)
- [ ] FK types match referenced column types (UUID↔UUID, INT↔INT)

**Migrations (MEDIUM)**
- [ ] Sequential numbering without gaps
- [ ] No duplicate migration numbers
- [ ] Rollback/Down method implemented
- [ ] IF NOT EXISTS on CREATE INDEX/TABLE
- [ ] Schema creation (CREATE SCHEMA IF NOT EXISTS)
- [ ] Idempotent operations where possible

**Queries (HIGH)**
- [ ] No SELECT * in production code
- [ ] Parameterized queries (no SQL injection)
- [ ] LIMIT on all list queries
- [ ] Proper use of transactions
- [ ] No N+1 query patterns
- [ ] Advisory locks for concurrent workers

**Performance (MEDIUM)**
- [ ] Connection pool sizing appropriate
- [ ] Query timeout configured
- [ ] No unbounded queries (missing WHERE or LIMIT)
- [ ] Batch operations for bulk inserts/updates
- [ ] EXPLAIN ANALYZE on complex queries

**Security (CRITICAL)**
- [ ] No plaintext passwords in migrations or config
- [ ] Row-level security where needed
- [ ] Minimal privileges for application user
- [ ] Audit columns (created_at, updated_at, created_by)

### Step 3 — Generate report

```markdown
## Database Audit Report — {project}
**Date:** {date} | **Schema:** {schema_name}

### Summary
| Category | CRITICAL | HIGH | MEDIUM | LOW |
|----------|----------|------|--------|-----|
| Schema Design | X | X | X | X |
| Indexes | X | X | X | X |
| Foreign Keys | X | X | X | X |
| Migrations | X | X | X | X |
| Queries | X | X | X | X |
| Performance | X | X | X | X |
| Security | X | X | X | X |

### Findings

#### [{SEVERITY}] {Finding title}
- **File:** `path/to/migration.sql:42`
- **Table:** `schema.table_name`
- **Problem:** What is wrong
- **Impact:** What happens if not fixed
- **Fix:**
```sql
-- Suggested SQL fix
ALTER TABLE ...
```

### Migration Fix Script
If CRITICAL issues are found, generate a complete migration file that fixes all issues at once.
```

### Step 4 — Verify fixes
If the user already has fix migrations, validate them by reading the files and confirming all audit findings are addressed.
