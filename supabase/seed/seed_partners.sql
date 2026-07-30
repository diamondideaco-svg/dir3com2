INSERT INTO partners (
  id,
  company_name,
  contact_person,
  email,
  phone,
  country,
  city,
  commercial_registration,
  tax_number,
  iban,
  status,
  shield_level
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Aurum Luxury', 'Sara Al Maktoum', 'sara@aurumluxury.com', '+966500000001', 'Saudi Arabia', 'Riyadh', 'CR-1001', 'TAX-1001', 'SA0310000000000000000000', 'active', 'gold'),
  ('22222222-2222-2222-2222-222222222222', 'NOVA Travel', 'Khalid Al Harbi', 'khalid@novatravel.com', '+966500000002', 'UAE', 'Dubai', 'CR-1002', 'TAX-1002', 'AE070331234567890123456', 'active', 'silver'),
  ('33333333-3333-3333-3333-333333333333', 'Elite Concierge', 'Mona Haddad', 'mona@eliteconcierge.com', '+966500000003', 'Saudi Arabia', 'Jeddah', 'CR-1003', 'TAX-1003', 'SA0310000000000000000001', 'pending', 'basic'),
  ('44444444-4444-4444-4444-444444444444', 'Vanta Mobility', 'Omar Fawaz', 'omar@vantamobility.com', '+966500000004', 'Qatar', 'Doha', 'CR-1004', 'TAX-1004', 'QA58DOHB00001234567890', 'active', 'platinum'),
  ('55555555-5555-5555-5555-555555555555', 'Luxe Hospitality', 'Noor Ibrahim', 'noor@luxehospitality.com', '+966500000005', 'Saudi Arabia', 'Mecca', 'CR-1005', 'TAX-1005', 'SA0310000000000000000002', 'inactive', 'silver');

INSERT INTO partner_documents (id, partner_id, document_type, file_url, verified, verified_at)
VALUES
  ('61111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'commercial_registration', 'https://example.com/docs/cr1.pdf', true, NOW()),
  ('62222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'tax_certificate', 'https://example.com/docs/tax2.pdf', true, NOW()),
  ('63333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'bank_statement', 'https://example.com/docs/bank3.pdf', false, NULL),
  ('64444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'commercial_registration', 'https://example.com/docs/cr4.pdf', true, NOW()),
  ('65555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'tax_certificate', 'https://example.com/docs/tax5.pdf', false, NULL);

INSERT INTO partner_services (id, partner_id, service_type)
VALUES
  ('71111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'DIR3 Stay'),
  ('72222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'DIR3 VIP'),
  ('73333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'DIR3 Drive'),
  ('74444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'DIR3 Concierge'),
  ('75555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'DIR3 Airport');

INSERT INTO partner_coverage (id, partner_id, country, city)
VALUES
  ('81111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Saudi Arabia', 'Riyadh'),
  ('82222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'UAE', 'Dubai'),
  ('83333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'UAE', 'Abu Dhabi'),
  ('84444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Saudi Arabia', 'Jeddah'),
  ('85555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'Qatar', 'Doha');

INSERT INTO partner_performance (
  partner_id,
  total_bookings,
  completed_bookings,
  cancelled_bookings,
  average_rating,
  on_time_rate,
  complaints,
  revenue,
  last_activity
)
VALUES
  ('11111111-1111-1111-1111-111111111111', 120, 110, 10, 4.90, 98.50, 2, 85000.00, NOW()),
  ('22222222-2222-2222-2222-222222222222', 80, 72, 8, 4.70, 95.00, 1, 52000.00, NOW()),
  ('33333333-3333-3333-3333-333333333333', 25, 18, 7, 3.80, 80.00, 4, 18000.00, NOW()),
  ('44444444-4444-4444-4444-444444444444', 200, 195, 5, 4.95, 99.20, 0, 140000.00, NOW()),
  ('55555555-5555-5555-5555-555555555555', 40, 25, 15, 3.60, 75.00, 6, 24000.00, NOW());
