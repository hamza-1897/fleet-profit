-- Fleet profit tracker: run this once in Supabase > SQL Editor.

create table if not exists vehicles (
  id bigint generated always as identity primary key,
  number text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id bigint generated always as identity primary key,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One rate per product per month, e.g. month = '2026-10'
create table if not exists rates (
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  product_id bigint not null references products(id) on delete restrict,
  rate_per_bag numeric(10,2) not null check (rate_per_bag >= 0),
  primary key (month, product_id)
);

-- BAGS: freight = quantity x rate_used (rate is copied into the trip, so later rate changes never alter old trips)
-- LUMPSUM: quantity unknown, freight typed directly
create table if not exists trips (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  trip_date date not null,
  type text not null check (type in ('BAGS','LUMPSUM')),
  product_id bigint references products(id) on delete restrict,
  quantity numeric(12,2) check (quantity > 0),
  rate_used numeric(10,2) check (rate_used >= 0),
  freight numeric(14,2) not null check (freight >= 0),
  note text,
  created_at timestamptz not null default now(),
  constraint bags_need_details check (
    type <> 'BAGS' or (product_id is not null and quantity is not null and rate_used is not null)
  )
);
create index if not exists trips_vehicle_date on trips (vehicle_id, trip_date);
create index if not exists trips_date on trips (trip_date);

-- One row per vehicle per day. challan is already part of total_expense (shown separately, never subtracted twice).
create table if not exists daily_expenses (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  expense_date date not null,
  total_expense numeric(14,2) not null check (total_expense >= 0),
  challan numeric(14,2) not null default 0 check (challan >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (vehicle_id, expense_date)
);

-- Security: only the logged-in office account can read or write.
alter table vehicles enable row level security;
alter table products enable row level security;
alter table rates enable row level security;
alter table trips enable row level security;
alter table daily_expenses enable row level security;

create policy "office access" on vehicles for all to authenticated using (true) with check (true);
create policy "office access" on products for all to authenticated using (true) with check (true);
create policy "office access" on rates for all to authenticated using (true) with check (true);
create policy "office access" on trips for all to authenticated using (true) with check (true);
create policy "office access" on daily_expenses for all to authenticated using (true) with check (true);

-- Starting data (same vehicles, products and rates as the Excel file)
insert into vehicles (number) values
  ('599'),('899'),('3886'),('1340'),('399'),('977'),('6314'),('799'),('699'),('7158'),('499'),('00-09')
on conflict (number) do nothing;

insert into products (code) values ('PK'),('P'),('DT'),('FJ'),('ST'),('Other')
on conflict (code) do nothing;

insert into rates (month, product_id, rate_per_bag)
select '2026-10', id,
  case code when 'PK' then 150 when 'FJ' then 175 when 'ST' then 150 else 100 end
from products
on conflict (month, product_id) do nothing;
