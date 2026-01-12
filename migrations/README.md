# Database Migrations

This directory contains SQL migration files for the CommuteSmart shuttle system database.

## Running Migrations

To run the migrations, execute the SQL files in numerical order against your PostgreSQL database:

```bash
# Example using psql
psql $POSTGRES_URL -f migrations/001_add_core_business_tables.sql
psql $POSTGRES_URL -f migrations/002_add_passengers_table.sql
```

## Migration 002: Add Passengers Table

This migration adds the `passengers` table to store detailed passenger information including:
- Name (姓名)
- Company (所属公司)
- Position (职位)
- Phone number (手机号码)

It also automatically creates the following passenger as requested:
- **Name**: 陈子瑜 (Chen Ziyu)
- **Company**: 厦门轨道集团商业物业公司 (Xiamen Rail Group Commercial Property Company)
- **Position**: 经理 (Manager)
- **Phone**: 18559279970

## Verification

After running the migration, you can verify it was successful by querying:

```sql
-- Check if passengers table exists
SELECT * FROM passengers WHERE name = '陈子瑜';

-- Should return the passenger information
```

## Features Added

1. **Passenger Management in Admin Panel**
   - Add new passengers with detailed information
   - View passenger list with company and contact details
   - Filter and manage passenger records

2. **Enhanced QR Code Scanning**
   - Continuous scanning mode (no need to reopen scanner)
   - Floating toast notifications for success/failure
   - Visual feedback with green flash for success, red flash for failure
   - Passenger name and company shown on successful verification
