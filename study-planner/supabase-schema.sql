-- ============================================================
-- สมุดงานนักเรียน · Study Planner — Supabase schema
-- วางโค้ดทั้งหมดนี้ใน Supabase Dashboard > SQL Editor > New query
-- แล้วกด RUN ครั้งเดียว
-- ============================================================

-- ตารางงาน/การบ้าน
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null,
  title text not null,
  due_date date,
  details text,
  status text not null default 'todo' check (status in ('todo','done','submitted')),
  progress int not null default 0 check (progress between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ตารางเรียนของโรงเรียน
create table if not exists class_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=อาทิตย์ ... 6=เสาร์
  subject text not null,
  room text,
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);

-- ตารางส่วนตัว
create table if not exists personal_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  title text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);

-- เครื่องหมายวันยุ่ง/ว่างในปฏิทิน
create table if not exists calendar_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mark_date date not null,
  mark_type text not null check (mark_type in ('busy','free')),
  created_at timestamptz default now(),
  unique(user_id, mark_date)
);

-- ============================================================
-- Row Level Security: ผู้ใช้แต่ละคนเห็น/แก้ไขได้แค่ข้อมูลของตัวเอง
-- ============================================================
alter table assignments enable row level security;
alter table class_schedule enable row level security;
alter table personal_schedule enable row level security;
alter table calendar_marks enable row level security;

create policy "own assignments select" on assignments for select using (auth.uid() = user_id);
create policy "own assignments insert" on assignments for insert with check (auth.uid() = user_id);
create policy "own assignments update" on assignments for update using (auth.uid() = user_id);
create policy "own assignments delete" on assignments for delete using (auth.uid() = user_id);

create policy "own class_schedule select" on class_schedule for select using (auth.uid() = user_id);
create policy "own class_schedule insert" on class_schedule for insert with check (auth.uid() = user_id);
create policy "own class_schedule update" on class_schedule for update using (auth.uid() = user_id);
create policy "own class_schedule delete" on class_schedule for delete using (auth.uid() = user_id);

create policy "own personal_schedule select" on personal_schedule for select using (auth.uid() = user_id);
create policy "own personal_schedule insert" on personal_schedule for insert with check (auth.uid() = user_id);
create policy "own personal_schedule update" on personal_schedule for update using (auth.uid() = user_id);
create policy "own personal_schedule delete" on personal_schedule for delete using (auth.uid() = user_id);

create policy "own calendar_marks select" on calendar_marks for select using (auth.uid() = user_id);
create policy "own calendar_marks insert" on calendar_marks for insert with check (auth.uid() = user_id);
create policy "own calendar_marks update" on calendar_marks for update using (auth.uid() = user_id);
create policy "own calendar_marks delete" on calendar_marks for delete using (auth.uid() = user_id);
