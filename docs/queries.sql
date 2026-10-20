-- Investigation queries for the Supabase SQL editor (docs/stack/04, docs/stack/06).

-- Last 20 failed extractions with reasons
select created_at, product_id, status, error_code, error_message, latency_ms
from extraction_events
where status <> 'ok'
order by created_at desc
limit 20;

-- Gemini failure rate by status over the last 24 h (excluding eval traffic)
select status, count(*) as n,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from extraction_events
where created_at > now() - interval '24 hours' and trigger <> 'eval'
group by status
order by n desc;

-- Products the packers corrected most (AI-origin facts only)
select c.product_id, p.name, c.field, count(*) as corrections
from corrections c join products p on p.id = c.product_id
where c.prior_origin = 'ai'
group by c.product_id, p.name, c.field
order by corrections desc;

-- Slowest order runs and where the time went
select id, created_at, order_id, status, total_ms, extract_ms, pack_ms, cache_misses
from order_runs
where trigger = 'order'
order by total_ms desc
limit 20;

-- Any validator rejections (should be empty: any row is an engine bug)
select id, created_at, order_id, validator_rejections, violations
from order_runs
where validator_rejections > 0
order by created_at desc;

-- Trace one run end to end (replace the uuid)
select * from order_runs        where id     = '00000000-0000-0000-0000-000000000000';
select * from extraction_events where run_id = '00000000-0000-0000-0000-000000000000' order by created_at;
select * from corrections       where run_id = '00000000-0000-0000-0000-000000000000' order by created_at;

-- Catalog: data-source mix of cached facts
select dims_source, origin, count(*) from product_facts group by dims_source, origin order by 1, 2;
