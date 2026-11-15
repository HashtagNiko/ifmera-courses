-- Rechte-Test zu Baustein 7, Teil 1: Einstellung "Notizen" an der Freigabe (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261115100000_kt_stichpunkte_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (S..).
-- Personen: Niko (Besitzer), Co (Freigabe auf weg), Fremd (kein kt_trainer).

begin;

set local lock_timeout = '3s';

insert into public.eingeladene_trainer (email) values ('kt-test-co@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid', 'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename) values ('00000000-0000-4000-8000-0000000000c1', 'Test Co');
insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
values ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000c1', 'fassung');

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.co', '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.weg', (select k.id::text from public.kurse k where k.slug = 'weg'), true);
select set_config('kt.hg', (select k.id::text from public.kurse k where k.slug = 'hg'), true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null or nullif(current_setting('kt.weg', true), '') is null
     or nullif(current_setting('kt.hg', true), '') is null or nullif(current_setting('kt.co', true), '') is null then
    raise exception 'S00: Testgrundlage fehlt';
  end if;
  if (select notiz_umfang from public.kt_kurs_freigaben where trainer_id = current_setting('kt.co')::uuid) is distinct from 'voll' then
    raise exception 'S01: neue Freigabe ist nicht "voll"';
  end if;
  begin
    update public.kt_kurs_freigaben set notiz_umfang = 'etwas' where trainer_id = current_setting('kt.co')::uuid;
    raise exception 'S02: ungueltiger Wert fuer notizen angenommen';
  exception when check_violation then null;
  end;
end
$$;

-- Niko: voll fuer den eigenen Kurs; stellt Co auf Stichpunkte
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  if public.kt_kurs_notiz_umfang(current_setting('kt.weg')::uuid) is distinct from 'voll' then
    raise exception 'S10: Besitzer bekommt nicht "voll"';
  end if;
  update public.kt_kurs_freigaben set notiz_umfang = 'stichpunkte'
  where kurs_id = current_setting('kt.weg')::uuid and trainer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'S11: Besitzer kann die Notiz-Einstellung nicht setzen'; end if;
end
$$;
reset role;

-- Co: sieht seine Einstellung, kann sie nicht selbst zurueckstellen; ohne Kurszugang null
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  if public.kt_kurs_notiz_umfang(current_setting('kt.weg')::uuid) is distinct from 'stichpunkte' then
    raise exception 'S20: Co bekommt nicht "stichpunkte"';
  end if;
  if (select notiz_umfang from public.kt_kurs_freigaben where kurs_id = current_setting('kt.weg')::uuid) is distinct from 'stichpunkte' then
    raise exception 'S21: Co sieht seine Einstellung nicht';
  end if;
  update public.kt_kurs_freigaben set notiz_umfang = 'voll' where kurs_id = current_setting('kt.weg')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'S22: Co konnte sich selbst auf "voll" stellen'; end if;
  if public.kt_kurs_notiz_umfang(current_setting('kt.hg')::uuid) is not null then
    raise exception 'S23: Co bekommt eine Einstellung fuer einen Kurs ohne Zugang';
  end if;
end
$$;
reset role;

-- Co abgeschaltet: keine Einstellung mehr (Teil 2 verlangt "voll", null heisst also kein Zugriff)
update public.kt_trainer set aktiv = false where id = current_setting('kt.co')::uuid;
set local role authenticated;
do $$
begin
  if public.kt_kurs_notiz_umfang(current_setting('kt.weg')::uuid) is not null then
    raise exception 'S24: abgeschalteter Trainer bekommt eine Einstellung';
  end if;
end
$$;
reset role;
update public.kt_trainer set aktiv = true where id = current_setting('kt.co')::uuid;

-- Fremd und anon
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if public.kt_kurs_notiz_umfang(current_setting('kt.weg')::uuid) is not null then
    raise exception 'S30: fremdes Konto bekommt eine Notiz-Einstellung';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$
begin
  begin
    perform public.kt_kurs_notiz_umfang(current_setting('kt.weg')::uuid);
    raise exception 'S31: anon kann kt_kurs_notiz_umfang aufrufen';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
