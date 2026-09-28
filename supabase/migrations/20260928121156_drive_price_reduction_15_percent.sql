-- Task #172. CEO approved current published Drive rates minus 15% once.
-- Forward release with matching app catalogue. Historical requests/quotes unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE drive_rate_change(id text PRIMARY KEY,currency text,old_daily bigint,old_airport bigint,new_daily bigint,new_airport bigint) ON COMMIT DROP;
INSERT INTO drive_rate_change VALUES
('managed-eg-cadillac-escalade','USD',110000,55000,93500,46750),
('managed-eg-hyundai-accent','USD',6600,3300,5610,2805),
('managed-eg-hyundai-elantra-cn7','USD',7700,3850,6545,3273),
('managed-eg-hyundai-h1','USD',16500,8250,14025,7013),
('managed-eg-hyundai-tuycan','USD',11000,5500,9350,4675),
('managed-eg-jetour-x70','USD',8800,4400,7480,3740),
('managed-eg-kia-carval','USD',22000,11000,18700,9350),
('managed-eg-kia-k4','USD',9350,4675,7948,3974),
('managed-eg-kia-sportage','USD',13200,6600,11220,5610),
('managed-eg-mercedes-s500','USD',55000,27500,46750,23375),
('managed-eg-mercedes-v250','USD',27500,13750,23375,11688),
('managed-eg-mercedes-v300','USD',44000,22000,37400,18700),
('managed-eg-nissan-patrol','USD',44000,22000,37400,18700),
('managed-eg-nissan-source-2026','USD',77000,38500,65450,32725),
('managed-eg-range-rover-sport','USD',66000,33000,56100,28050),
('managed-eg-soueast-s05','USD',8800,4400,7480,3740),
('managed-eg-soueast-s07','USD',8800,4400,7480,3740),
('managed-eg-soueast-s09','USD',11000,5500,9350,4675),
('managed-eg-toyota-hiace','USD',16500,8250,14025,7013),
('managed-eg-toyota-land-cruiser','USD',49500,24750,42075,21038),
('managed-eg-toyota-land-cruiser-2020','USD',38500,19250,32725,16363),
('safeerat-eg-jetour-t1','USD',10000,5000,8500,4250),
('safeerat-eg-jetour-t2','USD',16500,8250,14025,7013),
('safeerat-eg-jetour-x90','USD',11000,5500,9350,4675),
('safeerat-eg-mercedes-e200','USD',18700,9350,15895,7948),
('safeerat-eg-mercedes-e200-amg','USD',20000,10000,17000,8500),
('safeerat-eg-mercedes-gclass','USD',60500,30250,51425,25713),
('safeerat-eg-nissan-sunny','USD',6600,3300,5610,2805),
('safeerat-eg-range-rover','USD',30800,15400,26180,13090),
('safeerat-eg-range-rover-2025','USD',45000,25000,38250,21250);
CREATE TEMP TABLE partner_rate_change(id uuid PRIMARY KEY,currency text,old_cents bigint,new_cents bigint,old_version integer) ON COMMIT DROP;
INSERT INTO partner_rate_change VALUES
('06c334a0-d4a9-49ad-bc19-3018a24e8c0c'::uuid,'SAR',75000,63750,1),
('0a2f5f91-c53c-49e7-9b27-bb4e8728faf0'::uuid,'USD',25000,21250,3),
('2de05514-e1f9-4182-b119-341d1233167a'::uuid,'SAR',30000,25500,1),
('39b5beba-b875-4c9b-a5e5-c9a3276c85c8'::uuid,'SAR',75000,63750,1),
('5326200a-a0ce-4021-9c0f-77a9756f3365'::uuid,'SAR',75000,63750,1),
('55bf6423-9623-4181-a2bb-9946a71585c7'::uuid,'SAR',75000,63750,1),
('6bbf035f-7d7b-4cf3-8ccd-b82570e37b21'::uuid,'SAR',75000,63750,1),
('6d0b1992-9bdd-4ff9-b141-84b07a3c5a5f'::uuid,'SAR',75000,63750,1),
('75a81586-0b41-48f7-9c5b-70947bd038c8'::uuid,'SAR',75000,63750,1),
('86ed339b-8945-40fa-bc04-4a142c5d755e'::uuid,'SAR',17000,14450,1),
('dba01f1d-cd4b-40d9-9b95-2d978ac6f74a'::uuid,'SAR',75000,63750,1),
('e65694b7-09f4-4bd0-875a-4b239187e402'::uuid,'SAR',75000,63750,1),
('ec0a1b39-685a-455f-9247-e77227f10a8d'::uuid,'USD',40000,34000,4);
CREATE TEMP TABLE availability_rate_change(id uuid PRIMARY KEY,product_id uuid,currency text,old_price bigint,old_weekend bigint,old_seasonal bigint,old_discount numeric) ON COMMIT DROP;
INSERT INTO availability_rate_change VALUES
('05956635-0454-4c39-b3ba-536f53d04461','ec0a1b39-685a-455f-9247-e77227f10a8d','EGP',NULL,NULL,NULL,0),
('12b0751f-2903-4d72-9b82-9d3dd5a84238','5326200a-a0ce-4021-9c0f-77a9756f3365','SAR',75000,NULL,NULL,0),
('15619b81-32a1-4747-a884-4cf8affb2463','86ed339b-8945-40fa-bc04-4a142c5d755e','EGP',NULL,NULL,NULL,0),
('2c31fd77-8fa7-4323-bf2c-1c6191471f6c','0a2f5f91-c53c-49e7-9b27-bb4e8728faf0','EGP',NULL,NULL,NULL,0),
('3f6cf843-77d7-4001-ac22-722741eab4d4','6bbf035f-7d7b-4cf3-8ccd-b82570e37b21','SAR',75000,NULL,NULL,0),
('8f094111-d5b9-4e36-a839-4cbc46f91e93','e65694b7-09f4-4bd0-875a-4b239187e402','SAR',75000,NULL,NULL,0),
('bb9c9793-b6f0-4dda-9809-ca96079717cb','06c334a0-d4a9-49ad-bc19-3018a24e8c0c','SAR',75000,NULL,NULL,0),
('bcf1a451-c396-4316-9d95-66c4cb5a0bae','6d0b1992-9bdd-4ff9-b141-84b07a3c5a5f','SAR',75000,NULL,NULL,0),
('bddc5eee-670f-4165-be7d-0998d91ad89b','2de05514-e1f9-4182-b119-341d1233167a','SAR',75000,NULL,NULL,0),
('cd48709b-4d46-4cd9-948f-fddff629029a','55bf6423-9623-4181-a2bb-9946a71585c7','SAR',75000,NULL,NULL,0),
('d7e45b23-9200-4e26-b6e4-abfd34cf9b43','dba01f1d-cd4b-40d9-9b95-2d978ac6f74a','SAR',75000,NULL,NULL,0),
('f4ff4997-7607-49cd-91a7-f700e64d30d6','39b5beba-b875-4c9b-a5e5-c9a3276c85c8','SAR',75000,NULL,NULL,0),
('f6162e4d-7c6f-4da1-8449-ece954389e15','75a81586-0b41-48f7-9c5b-70947bd038c8','SAR',75000,NULL,NULL,0);
LOCK TABLE public.drive_managed_offers,public.products,public.product_availability IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.drive_managed_offers WHERE active)<>30 THEN RAISE EXCEPTION 'DRIVE_SCOPE_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.drive_managed_offers o JOIN drive_rate_change c USING(id)
 WHERE o.active AND o.version='managed-eg-20260928-v3' AND o.supplier_currency=c.currency
 AND o.daily_amount*100=c.old_daily AND o.airport_amount*100=c.old_airport)<>30 THEN RAISE EXCEPTION 'DRIVE_PRICE_BASELINE_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.products o JOIN partner_rate_change c USING(id)
 WHERE o.status='published' AND o.marketplace_family='drive' AND o.deleted_at IS NULL AND NOT coalesce(o.synthetic,false)
 AND o.currency=c.currency AND o.base_price*100=c.old_cents AND o.lifecycle_version=c.old_version)<>13 THEN RAISE EXCEPTION 'PARTNER_PRICE_BASELINE_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.product_availability a JOIN partner_rate_change p ON p.id=a.product_id)<>13 OR
 (SELECT count(*) FROM public.product_availability a JOIN availability_rate_change c USING(id)
 WHERE a.product_id=c.product_id AND a.currency=c.currency
 AND a.price*100 IS NOT DISTINCT FROM c.old_price
 AND a.weekend_price*100 IS NOT DISTINCT FROM c.old_weekend
 AND a.seasonal_price*100 IS NOT DISTINCT FROM c.old_seasonal
 AND a.discount_percent IS NOT DISTINCT FROM c.old_discount)<>13 THEN RAISE EXCEPTION 'AVAILABILITY_PRICE_BASELINE_CHANGED'; END IF;
END $$;
CREATE TEMP TABLE partner_price_release_snapshot ON COMMIT DROP AS
SELECT p.id,to_jsonb(p)-ARRAY['base_price','lifecycle_version','updated_at'] AS unchanged FROM public.products p JOIN partner_rate_change c USING(id);
CREATE TEMP TABLE availability_price_release_snapshot ON COMMIT DROP AS
SELECT a.id,to_jsonb(a)-ARRAY['price','weekend_price','seasonal_price'] AS unchanged FROM public.product_availability a JOIN availability_rate_change c USING(id);
UPDATE public.drive_managed_offers o SET daily_amount=c.new_daily::numeric/100,airport_amount=c.new_airport::numeric/100,version='managed-eg-20260928-v4' FROM drive_rate_change c WHERE o.id=c.id;
UPDATE public.products o SET base_price=c.new_cents::numeric/100,lifecycle_version=o.lifecycle_version+1,updated_at=now() FROM partner_rate_change c WHERE o.id=c.id;
UPDATE public.product_availability a SET price=round(a.price*0.85,2),weekend_price=round(a.weekend_price*0.85,2),seasonal_price=round(a.seasonal_price*0.85,2)
FROM availability_rate_change c WHERE a.id=c.id AND (a.price IS NOT NULL OR a.weekend_price IS NOT NULL OR a.seasonal_price IS NOT NULL);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.products p JOIN partner_price_release_snapshot s USING(id)
 WHERE to_jsonb(p)-ARRAY['base_price','lifecycle_version','updated_at'] IS DISTINCT FROM s.unchanged)
 OR EXISTS(SELECT 1 FROM public.product_availability a JOIN availability_price_release_snapshot s USING(id)
 WHERE to_jsonb(a)-ARRAY['price','weekend_price','seasonal_price'] IS DISTINCT FROM s.unchanged)
 THEN RAISE EXCEPTION 'UNEXPECTED_NONPRICE_MUTATION'; END IF;
END $$;
INSERT INTO public.system_events(event_name,entity_type,entity_id,payload,source)
SELECT 'drive_catalog_prices_reduced','catalog','managed-eg-20260928-v4',jsonb_build_object(
 'task',172,'reduction_percent',15,'previous_version','managed-eg-20260928-v3',
 'managed',(SELECT jsonb_agg(to_jsonb(c)) FROM drive_rate_change c),
 'partners',(SELECT jsonb_agg(to_jsonb(c)) FROM partner_rate_change c),
 'availability_before',(SELECT jsonb_agg(to_jsonb(c)) FROM availability_rate_change c)), 'authorized_price_migration';
-- Preserve the deployed authority/idempotency implementation; replace only its catalogue literal.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.create_managed_drive_request(text,text,jsonb,text)'::regprocedure);
 IF (length(definition)-length(replace(definition,'managed-eg-20260928-v3','')))/length('managed-eg-20260928-v3')<>2 THEN RAISE EXCEPTION 'DRIVE_REQUEST_CONTRACT_CHANGED'; END IF;
 EXECUTE replace(definition,'managed-eg-20260928-v3','managed-eg-20260928-v4');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
