-- Выполните целиком в Supabase: SQL Editor → New query → Run

-- Профили (имя, фамилия, роль)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'user' check (role in ('user','journalist','admin'))
);

-- Автосоздание профиля при регистрации
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверка роли (без рекурсии RLS)
create function public.my_role() returns text
language sql security definer stable set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- Новости
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  region text not null,
  image_url text,
  video_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- Комментарии
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;

-- profiles: имена видны всем; менять роль через интерфейс нельзя (нет update-политики)
create policy "profiles read" on public.profiles for select using (true);

-- posts
create policy "posts read" on public.posts for select
  using (status = 'approved' or author_id = auth.uid() or public.my_role() = 'admin');
create policy "posts insert" on public.posts for insert
  with check (author_id = auth.uid() and status = 'pending'
              and public.my_role() in ('journalist','admin'));
create policy "posts admin update" on public.posts for update
  using (public.my_role() = 'admin');
create policy "posts admin delete" on public.posts for delete
  using (public.my_role() = 'admin');

-- comments
create policy "comments read" on public.comments for select using (true);
create policy "comments insert" on public.comments for insert
  with check (user_id = auth.uid());
create policy "comments delete" on public.comments for delete
  using (user_id = auth.uid() or public.my_role() = 'admin');

-- Хранилище для картинок и видео (публичное чтение, загрузка — журналисты/админ)
insert into storage.buckets (id, name, public) values ('media','media', true);
create policy "media read" on storage.objects for select using (bucket_id = 'media');
create policy "media upload" on storage.objects for insert
  with check (bucket_id = 'media' and public.my_role() in ('journalist','admin'));

-- ===== Назначение ролей (после регистрации аккаунта) =====
-- update public.profiles set role = 'admin'      where id = (select id from auth.users where email = 'ВАШ@EMAIL');
-- update public.profiles set role = 'journalist' where id = (select id from auth.users where email = 'журналист@email');
