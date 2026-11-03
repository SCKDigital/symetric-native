/*
  # Add appetite and physical_wellbeing columns to check_ins

  ## Changes
  - `check_ins` table: add nullable `appetite` (integer) and `physical_wellbeing` (integer) columns
  - These match the two new tracking domains added in v1.1 (appetite and physical wellbeing)
  - Both are nullable to preserve backward compatibility with existing rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'appetite'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN appetite integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_ins' AND column_name = 'physical_wellbeing'
  ) THEN
    ALTER TABLE check_ins ADD COLUMN physical_wellbeing integer;
  END IF;
END $$;
