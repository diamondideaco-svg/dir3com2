[CmdletBinding()]
param(
  [string]$DbHost = '127.0.0.1',
  [int]$DbPort = 54322,
  [string]$ApiUrl = 'http://127.0.0.1:54321',
  [string]$Container = 'supabase_db_dir3com2',
  [string]$QaPassword,
  [switch]$StartApp
)

$ErrorActionPreference = 'Stop'

function Stop-Script([string]$Message) {
  throw "LOCAL QA BOOTSTRAP REFUSED: $Message"
}

if ($DbHost -notin @('127.0.0.1', 'localhost')) { Stop-Script "DB host must be loopback." }
if ($DbPort -ne 54322) { Stop-Script "DB port must be 54322." }
if ($ApiUrl -ne 'http://127.0.0.1:54321') { Stop-Script "API URL must be http://127.0.0.1:54321." }
if ($ApiUrl -match 'ynupwivgvwcyrsdhtkcc|supabase\.co|https?://(?!127\.0\.0\.1(?::|/)|localhost(?::|/))') {
  Stop-Script "Remote or non-loopback API target is forbidden."
}
if ([string]::IsNullOrWhiteSpace($QaPassword)) { Stop-Script 'QaPassword must be supplied as a process argument and is never stored or printed.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Stop-Script "docker is required." }

$containerExists = docker ps --format '{{.Names}}' | Where-Object { $_ -eq $Container }
if (-not $containerExists) { Stop-Script "Local container '$Container' is not running." }

function Invoke-LocalSql([string]$Sql) {
  $sqlFile = [IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $sqlFile -Value $Sql -Encoding utf8 -NoNewline
    docker cp $sqlFile "${Container}:/tmp/partner-qa-bootstrap.sql" | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Script "Could not copy local SQL to the local container." }
    $publishedPort = docker port $Container 5432/tcp 2>&1
    if ($LASTEXITCODE -ne 0 -or $publishedPort -notmatch ':54322$') { Stop-Script "Database target verification failed." }
    docker exec $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/partner-qa-bootstrap.sql
    if ($LASTEXITCODE -ne 0) { Stop-Script "Local schema SQL failed." }
  } finally {
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-LocalJwtSecret() {
  $line = docker inspect supabase_auth_dir3com2 --format '{{range .Config.Env}}{{println .}}{{end}}' | Where-Object { $_ -like 'GOTRUE_JWT_SECRET=*' } | Select-Object -First 1
  if (-not $line) { Stop-Script "Local JWT secret is unavailable from the local Auth container." }
  return ($line -split '=', 2)[1]
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return ([Convert]::ToBase64String($Bytes).TrimEnd('=') -replace '\+', '-' -replace '/', '_')
}

function New-LocalServiceToken([string]$Secret) {
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payload = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @{ iss = 'supabase'; ref = 'local'; role = 'service_role'; aud = 'authenticated'; iat = $now; exp = $now + 3600 } -Compress)))
  $unsigned = "$header.$payload"
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
  try { $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned))) } finally { $hmac.Dispose() }
  return "$unsigned.$signature"
}

Write-Output 'TARGET DB = 127.0.0.1:54322'
Write-Output 'TARGET API = http://127.0.0.1:54321'
Write-Output 'REMOTE TARGET = NO'

$authCount = [int](docker exec $Container psql -U postgres -d postgres -Atc "select count(*) from auth.users;")
$identityCount = [int](docker exec $Container psql -U postgres -d postgres -Atc "select count(*) from auth.identities;")
Write-Output "LOCAL AUTH USERS COUNT = $authCount"
Write-Output "LOCAL AUTH IDENTITIES COUNT = $identityCount"
if ($authCount -gt 0 -or $identityCount -gt 0) { Stop-Script 'Existing local Auth data detected; Auth reset is refused.' }

$qaEmail = 'partner.qa.local@example.invalid'
$qaPassword = $QaPassword
$userId = [guid]::NewGuid().ToString()
$escapedId = $userId.Replace("'", "''")
$escapedEmail = $qaEmail.Replace("'", "''")

$schemaSql = @'
DROP TABLE IF EXISTS public.product_images, public.product_availability, public.products, public.partner_documents, public.partners, public.profiles CASCADE;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','partner','staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending','banned')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.partners (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text NOT NULL,
  contact_person text,
  slug text NOT NULL UNIQUE,
  email text,
  phone text,
  country text,
  city text,
  commercial_registration text,
  tax_number text,
  iban text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','inactive','pending')),
  shield_level text NOT NULL DEFAULT 'basic',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  slug text NOT NULL UNIQUE,
  description_ar text,
  description_en text,
  city text,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  shield_certified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  city text NOT NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_owner_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_owner_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY partners_service_role ON public.partners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY partner_documents_owner_read ON public.partner_documents FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY partner_documents_owner_insert ON public.partner_documents FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());
CREATE POLICY partner_documents_service_role ON public.partner_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY products_service_role ON public.products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY product_availability_service_role ON public.product_availability FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY product_images_service_role ON public.product_images FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY product_images_public_read ON public.product_images FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND lower(p.status) IN ('active','featured')));

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.partner_documents TO authenticated;
GRANT INSERT (id, partner_id, document_type, file_url, status, verified, verified_at, created_at, updated_at) ON public.partner_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
'@
Invoke-LocalSql $schemaSql

$passwordSql = $qaPassword.Replace("'", "''")
$authAndDataSql = @"
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('$escapedId', 'authenticated', 'authenticated', '$escapedEmail', crypt('$passwordSql', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Local QA Partner"}'::jsonb, now(), now());
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES ('$escapedId', '$escapedId', '{"sub":"$escapedId","email":"$escapedEmail"}'::jsonb, 'email', now(), now());
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-media', 'partner-media', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-documents', 'partner-documents', false, 8388608, ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
"@
Invoke-LocalSql $authAndDataSql

$dataSql = @"
INSERT INTO public.profiles (id, full_name, email, role, status) VALUES ('$escapedId', 'Local QA Partner', '$qaEmail', 'partner', 'active');
INSERT INTO public.partners (id, name, company_name, contact_person, slug, email, status, shield_level) VALUES ('$escapedId', 'Local QA Partner', 'Local QA Partner Company', 'Local QA Contact', 'local-qa-partner', '$qaEmail', 'active', 'basic');
INSERT INTO public.products (name_ar, name_en, slug, city, base_price, currency, status, verified) VALUES ('خدمة اختبار محلية', 'Local QA Test Service', 'local-qa-test-service', 'Local QA', 100, 'SAR', 'active', true);
INSERT INTO public.product_availability (product_id, city, partner_id, available) SELECT id, 'Local QA', '$escapedId', true FROM public.products WHERE slug = 'local-qa-test-service';
"@
Invoke-LocalSql $dataSql

Write-Output 'LOCAL REQUIRED TABLES READY = YES'
Write-Output 'LOCAL REQUIRED BUCKETS READY = YES'
Write-Output 'LOCAL RLS READY = YES'
Write-Output 'LOCAL QA PARTNER READY = YES'
Write-Output 'EFFECTIVE ROLE = partner'
Write-Output 'OWNED TEST PRODUCT/SERVICE READY = YES'
Write-Output 'SYNTHETIC QA EMAIL = partner.qa.local@example.invalid'
Write-Output 'LOCAL QA PASSWORD = stored in script for local-only QA; do not use outside local stack'

if ($StartApp) {
  $env:NEXT_PUBLIC_SUPABASE_URL = $ApiUrl
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $serviceToken
  $env:SUPABASE_URL = $ApiUrl
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceToken
  $env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3002'
  Write-Output 'APP SUPABASE TARGET = LOCAL'
  Write-Output 'PRODUCTION PROJECT TARGETED = NO'
  npm run dev -- --port 3002
}
