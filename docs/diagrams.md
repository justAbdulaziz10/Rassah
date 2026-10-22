# Rassah: Technical Diagrams

The brief requires two diagrams: **Development Flow** and **Monitoring Flow**. Both must reflect the real implementation. If the implementation changes, update these diagrams in the same commit.

The diagrams are written in Mermaid, which GitHub renders natively. PNG exports live in `docs/report/` (`diagram-dev-flow.png`, `diagram-monitoring-flow.png`, `diagram-monitoring-sequence.png`, `diagram-architecture.png`), rendered with `@mermaid-js/mermaid-cli` (mmdc). Re-export them whenever a block changes. The PNGs were last exported on 2026-10-21 (commit `4128fcd`); the Mermaid blocks below have changed since (alert re-evaluation, notifications, store, multi-carton split), so the PNGs need a re-export.

---

## 1. Development Flow (required)

How a change goes from idea to production, and how problems found in production feed back into development.

```mermaid
flowchart LR
    A[Task / issue] --> B[Agents work in<br/>separate git worktrees]
    B --> C[Code + tests locally<br/>npm run dev / npm test]
    C --> D[Merge worktrees<br/>into main locally]
    D --> E[Local CI gate: agent-ship ci<br/>secret scan · floor guard · lint ·<br/>typecheck · tests · build]
    E -->|fail| C
    E -->|pass| F[Push to main]
    F --> G[GitHub Actions CI<br/>lint · typecheck · validate-data ·<br/>vitest · build · eval:packing]
    F --> H[Vercel Production<br/>deployment from main]
    G -->|fail| C
    H --> K[Smoke test<br/>seeded orders]
    K --> L[Monitoring dashboard<br/>+ alert rules]
    L -->|alert or bad metric| M[Investigate<br/>events by run_id]
    M --> N[Open issue / task]
    N --> A

    O[Evaluation scripts<br/>eval-extraction · eval-packing] --> P[(eval_runs<br/>in Supabase)]
    C -.prompt or engine change.-> O
    P --> Q[Evaluation page<br/>+ report numbers]
```

**How to read it:**
- No change reaches `main` without passing the local gate (`agent-ship ci`: secret scan, floor guard that blocks new lint suppressions or skipped tests, lint, typecheck, tests, build). GitHub Actions then re-runs CI on the pushed commit, and Vercel deploys production from `main`.
- We did not use per-PR branches, Vercel preview deployments or a PR review step: one integrator merged the worktrees locally and pushed to `main`.
- Prompt and engine changes are re-scored with the evaluation scripts before merging, so we can show *before/after* numbers.
- Production problems enter the same loop through the dashboard. They become issues, then tasks.

---

## 2. Monitoring Flow (required)

How events move from the product to the monitoring components, how metrics are calculated, and how results reach the dashboard or trigger alerts.

### 2a. Data flow

```mermaid
flowchart TB
    subgraph Product["Product request path (Vercel function, lib/pipeline/pack.ts)"]
        U[Packer: POST /api/orders/:id/pack] --> R[Create run_id + start timer]
        R --> CL{Product facts<br/>in catalog cache?}
        CL -->|hit| PK
        CL -->|miss| GX[Gemini extraction]
        GX --> EV1[[extraction_event per call<br/>status · latency · tokens · cost<br/>source · confidence · error_code]]
        GX --> PF[(product_facts)]
        PF --> PK[Packing engine<br/>every layout checked by the<br/>independent validator ·<br/>split if no single carton fits]
        PK --> EV2[[order_run<br/>status · carton · timings · cache hits<br/>violations · est. cost · tokens · engine_version]]
        EV2 --> RES[Result to packer]
        RES --> ACT[Packer: Confirm / Edit / Measure]
        ACT --> EV3[[update order_run.employee_action<br/>write corrections rows]]
    end

    subgraph Store["Supabase Postgres"]
        T1[(extraction_events)]
        T2[(order_runs)]
        T3[(corrections)]
        T4[(eval_runs / eval_results)]
        T5[(alerts)]
    end

    EV1 --> T1
    EV2 --> T2
    EV3 --> T2
    EV3 --> T3

    subgraph Compute["Computation (server, TypeScript)"]
        Q[Read rows<br/>excluding trigger = 'eval'] --> MET[computeMetrics: M1–M7<br/>+ sample sizes, for the chosen window]
        Q --> RULES{Alert rules<br/>rolling last N · min sample<br/>after each pack, each packer action<br/>and each dashboard load}
        RULES -->|breach: open| T5
        RULES -->|clean: resolve| T5
    end

    T1 --> Q
    T2 --> Q
    T3 --> Q

    MET --> DASH[/monitoring dashboard/]
    T5 --> BAN[Status list on /monitoring<br/>/notifications · nav bell<br/>+ optional webhook]
    T4 --> EVP[/evaluation page/]
```

### 2b. Sequence for one order (uncached product)

```mermaid
sequenceDiagram
    autonumber
    actor P as Packer
    participant UI as Next.js page
    participant API as /api/orders/:id/pack
    participant DB as Supabase
    participant G as Gemini API
    participant E as Engine + Validator

    P->>UI: Open order #1002
    UI->>API: POST pack
    API->>DB: Load order, products, cartons, cached product_facts
    DB-->>API: 2 cached, 1 missing
    API->>G: generateContent(product text, JSON schema)
    G-->>API: JSON facts + usage tokens
    API->>DB: upsert product_facts
    API->>E: packOrder(items, facts, cartons)
    E->>E: search; validate every layout
    E-->>API: cheapest valid carton (or split, or no_box)
    API->>DB: insert order_run + extraction_events
    API->>DB: re-evaluate alert rules (open / resolve alerts)
    API-->>UI: carton + instructions + layout + run_id
    P->>UI: Confirm (or Edit a product)
    UI->>API: POST /api/runs/:runId/action
    API->>DB: update order_run, insert corrections, re-evaluate alerts
```

---

## 3. System architecture (supporting)

```mermaid
flowchart LR
    subgraph Client["Browser"]
        P0[Landing page]
        P1[Orders queue]
        P2[Result page + 3D view]
        P6[Notifications page]
        P3[Catalog page]
        P4[Monitoring page]
        P5[Evaluation page]
        P7[Store /store]
    end

    subgraph Vercel["Vercel: Next.js (Node runtime, fra1)"]
        RH[Route handlers /api/*]
        PL[lib/pipeline<br/>pack orchestration · corrections]
        AI[lib/ai<br/>extractor · prompt · schema · catalog cache]
        EN[lib/engine<br/>packer · validator · split · cost · instructions]
        MO[lib/monitoring<br/>metrics · alerts · dashboard · evaluation]
        OR[lib/orders<br/>queue · notifications]
        IN[lib/integrations<br/>external Orders API, optional]
        DBL[lib/db<br/>Repo: Supabase adapter<br/>or memory backend]
    end

    GEM[(Gemini API)]
    SUP[(Supabase Postgres)]
    EXT[(External store API<br/>optional, read-only)]

    EVS[scripts/eval-*<br/>+ lib/eval scoring]

    P0 & P1 & P2 & P3 & P4 & P5 & P6 & P7 --> RH
    RH --> PL
    RH --> OR
    PL --> AI --> GEM
    PL --> EN
    PL --> MO
    PL --> IN --> EXT
    RH --> MO
    PL --> DBL
    MO --> DBL
    OR --> DBL
    EVS --> AI
    EVS --> EN
    EVS --> DBL
    DBL --> SUP
```

Pages are server components that read through `lib/` directly as well as calling the API routes; the arrows show the main data paths only.
