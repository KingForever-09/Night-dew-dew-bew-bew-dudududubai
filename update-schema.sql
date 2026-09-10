-- ============================================================
-- สมุดงานนักเรียน — อัปเดตฐานข้อมูล (เพิ่มเติมเท่านั้น)
-- ============================================================
-- ไฟล์นี้แค่ "เพิ่ม" ตารางใหม่ 2 ตัว ไม่แตะต้องผู้ใช้ (auth.users) หรือตาราง
-- assignments / class_schedule / personal_schedule ที่มีอยู่เดิมเลย
-- ดังนั้นรันแล้ว "จะไม่มีทาง" ทำให้ผู้ใช้ที่สมัครไว้แล้วต้องสมัครใหม่
-- หรือทำให้งาน/ตารางเรียนเดิมหายไป
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งหมดนี้ > RUN
-- ============================================================

-- ตารางการสอบ/ควิซ
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null,
  exam_title text not null,
  exam_date date not null,
  exam_time time,
  location text,
  topics text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table exams enable row level security;

do $$ begin
  create policy "own exams select" on exams for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own exams insert" on exams for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own exams update" on exams for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own exams delete" on exams for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;


-- ตารางรายการปฏิทินที่ผู้ใช้เพิ่มเอง (โน้ต/กิจกรรม/เตือนความจำ/ยุ่ง/ว่าง) — หลายรายการต่อวันได้
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_date date not null,
  event_time time,
  title text not null,
  note text,
  category text not null default 'note' check (category in ('event','note','reminder','busy','free')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table calendar_events enable row level security;

do $$ begin
  create policy "own calendar_events select" on calendar_events for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own calendar_events insert" on calendar_events for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own calendar_events update" on calendar_events for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own calendar_events delete" on calendar_events for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;


-- (ไม่บังคับ) ถ้าคุณเคยรันเวอร์ชันเก่าที่มีตาราง calendar_marks (ยุ่ง/ว่างแบบเดิม)
-- และอยากย้ายเครื่องหมายเก่ามาเป็นรายการในปฏิทินใหม่ ให้เอาคอมเมนต์ (--) ข้างหน้า
-- คำสั่งด้านล่างออก แล้วรันอีกครั้ง (ถ้าไม่เคยมีตารางนี้ ข้ามส่วนนี้ไปได้เลย ไม่มีผลอะไร)

-- insert into calendar_events (user_id, event_date, title, category)
-- select user_id, mark_date, case when mark_type='busy' then 'ยุ่ง' else 'ว่าง' end, mark_type
-- from calendar_marks
-- on conflict do nothing;
