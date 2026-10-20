# Rassah: Technical Diagrams

The brief requires two diagrams: **Development Flow** and **Monitoring Flow**. Both must reflect the real implementation. If the implementation changes, update these diagrams in the same PR.

The diagrams are written in Mermaid, which GitHub renders natively. To export PNGs for the report and deck, paste each block into <https://mermaid.live> and download the image into `docs/report/`.

---

## 1. Development Flow (required)

How a change goes from idea to production, and how problems found in production feed back into development.

```mermaid
flowchart LR
    A[Task from PLAN.md] --> B[Create branch<br/>feat/... or fix/...]
    B --> C[Code locally<br/>npm run dev]
    C --> D[Local checks<br/>lint · typecheck · vitest]
    D -->|fail| C
    D -->|pass| E[Push branch +<br/>open Pull Request]
    E --> F[GitHub Actions CI<br/>lint · typecheck · vitest]
    E --> G[Vercel Preview<br/>deployment per PR]
    F -->|fail| C
    G --> H[Teammate review<br/>+ test on preview URL]
    H -->|changes requested| C
    F -->|pass| I{Merge to main}
    H -->|approved| I
    I --> J[Vercel Production<br/>deployment]
    J --> K[Smoke test<br/>seeded orders]
    K --> L[Monitoring dashboard<br/>+ alert rules]
    L -->|alert or bad metric| M[Investigate<br/>events by run_id]
    M --> N[Open issue / task]
    N --> B

    O[Evaluation scripts<br/>eval-extraction · eval-packing] --> P[(eval_runs<br/>in Supabase)]
    C -.prompt or engine change.-> O
    P --> Q[Evaluation page<br/>+ report numbers]
```

**Explaining it in Q&A:**
- No change reaches `main` without passing CI and a teammate's review on a live preview URL.
- Prompt and engine changes are re-scored with the evaluation scripts before merging, so we can show *before/after* numbers.
- Production problems enter the same loop through the dashboard. They become issues, then branches.

---

## 2. Monitoring Flow (required)

How events move from the product to the monitoring components, how metrics are calculated, and how results reach the dashboard or trigger alerts.

### 2a. Data flow

```mermaid
flowchart TB
    subgraph Product["Product request path (Vercel function)"]
        U[Packer: POST /api/orders/:id/pack] --> R[Create run_id + start timer]
        R --> CL{Product facts<br/>in catalog cache?}
        CL -->|hit| PK
        CL -->|miss| GX[Gemini extraction]
        GX --> EV1[[write extraction_event<br/>status · latency · tokens · cost<br/>source · confidence · error_code]]
        GX --> PF[(product_facts)]
        PF --> PK[Packing engine]
        PK --> VA[Independent validator]
        VA --> EV2[[write order_run<br/>status · carton · timings · cache hits<br/>violations · est. cost · tokens · engine_version]]
        EV2 --> RES[Result to packer]
        RES --> ACT[Packer: Confirm / Edit]
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

    subgraph Compute["Metric computation (server, on dashboard load and after each run)"]
        Q[SQL queries over a time window<br/>excluding trigger = 'eval'] --> MET[M1–M7 metric values<br/>+ sample sizes]
        MET --> RULES{Alert rules<br/>threshold + min sample}
        RULES -->|breach| T5
    end

    T1 --> Q
    T2 --> Q
    T3 --> Q

    MET --> DASH[/monitoring dashboard/]
    T5 --> BAN[Alert banner on dashboard<br/>+ optional webhook]
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

    P->>UI: Enter order #1045
    UI->>API: POST pack
    API->>DB: Load order items + cached product_facts
    DB-->>API: 2 cached, 1 missing
    API->>G: generateContent(product text, JSON schema)
    G-->>API: JSON facts + usage tokens
    API->>DB: insert extraction_event, upsert product_facts
    API->>E: pack(items, cartons)
    E-->>API: best layout per carton
    API->>E: validate(layout)
    E-->>API: valid / violations
    API->>DB: insert order_run (timings, status, violations, cost)
    API-->>UI: carton + instructions + layout + run_id
    P->>UI: Confirm (or Edit a product)
    UI->>API: POST /api/runs/:runId/action
    API->>DB: update order_run, insert corrections
```

---

## 3. System architecture (supporting)

```mermaid
flowchart LR
    subgraph Client["Browser"]
        P1[Order page]
        P2[Result page + 3D view]
        P3[Catalog page]
        P4[Monitoring page]
        P5[Evaluation page]
    end

    subgraph Vercel["Vercel: Next.js (Node runtime)"]
        RH[Route handlers /api/*]
        AI[lib/ai<br/>extractor]
        EN[lib/engine<br/>packer · validator · cost · instructions]
        MO[lib/monitoring<br/>events · metrics · alerts]
        DBL[lib/db<br/>Supabase server client]
    end

    GEM[(Gemini API)]
    SUP[(Supabase Postgres)]

    P1 & P2 & P3 & P4 & P5 --> RH
    RH --> AI --> GEM
    RH --> EN
    RH --> MO --> DBL
    AI --> DBL
    DBL --> SUP
```
