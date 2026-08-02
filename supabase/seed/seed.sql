INSERT INTO profiles (id, full_name, email, phone, role, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Admin DIR3COM', 'admin@dir3com.com', '+966500000000', 'admin', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Customer One', 'customer1@dir3com.com', '+966500000001', 'customer', 'active');

INSERT INTO service_categories (id, name_ar, name_en, slug, description_ar, description_en, status)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'الخدمات الفاخرة', 'Luxury Services', 'luxury-services', 'خدمات فاخرة ومخصصة', 'Premium curated services', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'الرحلات', 'Travel', 'travel', 'رحلات ووجهات مميزة', 'Travel and destinations', 'active');

INSERT INTO services (id, category_id, name_ar, name_en, slug, description_ar, description_en, base_price, currency, status, featured)
VALUES
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'DIR3 Stay', 'DIR3 Stay', 'dir3-stay', 'إقامة فاخرة ومريحة', 'Premium stay experience', 1200.00, 'SAR', 'active', true),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'DIR3 Drive', 'DIR3 Drive', 'dir3-drive', 'خدمة انتقال مريحة وموثوقة', 'Reliable premium transfer service', 300.00, 'SAR', 'active', true);

INSERT INTO destinations (id, service_id, name_ar, name_en, slug, description_ar, description_en, country, region, featured, status)
VALUES
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'الدوحة', 'Doha', 'doha', 'وجهة فاخرة في قلب الخليج', 'Premium destination in the Gulf', 'QA', 'الشرق الأوسط', true, 'active'),
  ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'دبي', 'Dubai', 'dubai', 'مدينة راقية وتجارب متطورة', 'Luxury city experience', 'AE', 'الشرق الأوسط', true, 'active');

INSERT INTO partners (
  id,
  company_name,
  contact_person,
  email,
  phone,
  country,
  city,
  slug,
  website_url,
  logo_url,
  description_ar,
  description_en,
  commercial_registration,
  tax_number,
  iban,
  status,
  shield_level
)
VALUES
  ('99999999-9999-9999-9999-999999999999', 'Aurum Luxury', 'Sara Al Maktoum', 'sara@aurumluxury.com', '+966500000001', 'Saudi Arabia', 'Riyadh', 'aurum-luxury', 'https://example.com', NULL, 'شريك خدمات فاخر', 'Luxury service partner', 'CR-1001', 'TAX-1001', 'SA0310000000000000000000', 'active', 'gold');

INSERT INTO promotions (id, service_id, code, title_ar, title_en, description_ar, description_en, discount_percentage, starts_at, ends_at, status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'LUXE10', 'خصم على الإقامة', 'Stay discount', 'خصم مقدّم للعميل', 'Limited offer for premium stay', 10.00, NOW(), NOW() + INTERVAL '30 days', 'active');

INSERT INTO reviews (id, profile_id, service_id, booking_id, rating, title_ar, title_en, comment_ar, comment_en, status)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', NULL, 5, 'تجربة ممتازة', 'Excellent experience', 'الخدمة كانت مميزة جدًا', 'The service was exceptional', 'active');
