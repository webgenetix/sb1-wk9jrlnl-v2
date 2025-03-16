/*
  # Add video-profile relationship

  1. Changes
    - Add policy for profiles to be readable by authenticated users
    - Add foreign key constraint between videos and profiles tables (if not exists)
*/

-- Add policy to allow reading profiles (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Authenticated users can read all profiles'
  ) THEN
    CREATE POLICY "Authenticated users can read all profiles"
    ON profiles
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- Add foreign key constraint (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'videos_user_id_fkey'
    AND table_name = 'videos'
  ) THEN
    ALTER TABLE videos
    ADD CONSTRAINT videos_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE CASCADE;
  END IF;
END $$;