-- Opslag: advertentiefoto's zijn openbaar, bewijs bij geschillen is privé.
-- Paden:
--   listing-photos/{user_id}/{listing_id}/{bestand}
--   evidence/{dispute_id}/{user_id}/{bestand}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos', 'listing-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('evidence', 'evidence', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy "listing photos: upload in eigen map"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing photos: eigen foto's verwijderen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "evidence: partijen uploaden bij open geschil"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.disputes d join public.orders o on o.id = d.order_id
      where d.id::text = (storage.foldername(name))[1]
        and auth.uid() in (o.buyer_id, o.seller_id)
        and d.status in ('awaiting_seller', 'awaiting_review', 'appealed')
    )
  );

create policy "evidence: partijen en support lezen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and exists (
      select 1 from public.disputes d join public.orders o on o.id = d.order_id
      where d.id::text = (storage.foldername(name))[1]
        and (auth.uid() in (o.buyer_id, o.seller_id) or public.is_support())
    )
  );
