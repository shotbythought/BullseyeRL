create or replace function public.raw_points_for_radius(
  p_min_radius_meters integer,
  p_max_radius_meters integer,
  p_successful_radius integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_min_radius integer := coalesce(p_min_radius_meters, 50);
  v_max_radius integer := greatest(coalesce(p_max_radius_meters, 5000), coalesce(p_min_radius_meters, 50));
  v_radius integer := p_successful_radius;
  v_first_non_bullseye_radius integer;
  v_log_progress double precision;
begin
  if v_radius is null then
    return 0;
  end if;

  if v_radius <= v_min_radius or v_max_radius = v_min_radius then
    return 100;
  end if;

  if v_radius >= v_max_radius then
    return 1;
  end if;

  v_first_non_bullseye_radius := least(250, v_max_radius);

  if v_radius <= v_first_non_bullseye_radius then
    return 90;
  end if;

  if v_max_radius = v_first_non_bullseye_radius then
    return 1;
  end if;

  v_log_progress := ln(v_max_radius::double precision / v_radius::double precision)
    / ln(v_max_radius::double precision / v_first_non_bullseye_radius::double precision);

  return greatest(1, least(90, round(1 + 89 * v_log_progress)::integer));
end;
$$;

grant execute on function public.raw_points_for_radius(integer, integer, integer) to authenticated;
