alter table public.plots add column if not exists "group" integer not null default 1;

comment on column public.plots."group" is
    'Grupo del lote dentro del campo (agrupa lotes en la vista satelital).';
