alter table ems.visits drop constraint visits_check;
alter table ems.visits add constraint visits_time_fields_check check(
 (all_day and start_date is not null and end_date is not null and end_date>=start_date and starts_at is null and ends_at is null)
 or (not all_day and starts_at is not null and ends_at is not null and ends_at>starts_at and start_date is null and end_date is null)
);
