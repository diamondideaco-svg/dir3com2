# Database Schema Architecture

## 1. Purpose
This document outlines the expected logical database model for DIR3COM, including the core entities required for services, bookings, reviews, contacts, and administration.

## 2. Core Tables
### users
- id
- email
- full_name
- phone
- role
- avatar_url
- created_at
- updated_at

### services
- id
- name_ar
- name_en
- description_ar
- description_en
- slug
- category
- status
- created_at
- updated_at

### products
- id
- service_id
- name_ar
- name_en
- description_ar
- description_en
- price
- currency
- availability_status
- created_at
- updated_at

### partners
- id
- name
- logo_url
- website_url
- status
- created_at
- updated_at

### product_images
- id
- product_id
- image_url
- caption
- created_at

### bookings
- id
- user_id
- service_id
- product_id
- booking_reference
- status
- requested_at
- confirmed_at
- completed_at
- notes
- created_at
- updated_at

### reviews
- id
- user_id
- service_id
- rating
- comment_ar
- comment_en
- created_at

### contacts
- id
- name
- email
- phone
- subject
- message
- status
- created_at

### admin_notifications
- id
- admin_user_id
- type
- message
- is_read
- created_at

## 3. Relationships
- services has many products.
- products belong to one service.
- products can have many images.
- products can be linked to one partner.
- bookings belong to one user and one service/product.
- reviews belong to one user and one service.
- contacts are standalone operational records.

## 4. Recommended Indexing
- Index on service_id, user_id, status, created_at.
- Index slug and booking_reference for fast lookup.
- Index on role and email for authentication and admin operations.

## 5. Data Integrity Rules
- Enforce non-null fields where required.
- Keep status values limited to controlled enumerations.
- Use timestamps for traceability.
- Avoid storing sensitive data in plain text where possible.

## 6. Supabase Considerations
- Use Row Level Security (RLS) policies for public and protected access.
- Keep admin and tenant-sensitive data behind secure policies.
- Use generated columns and views where appropriate for reporting.
- Use migration files in supabase/migrations for schema changes.
- Use seed scripts in supabase/seed for initial sample data.
