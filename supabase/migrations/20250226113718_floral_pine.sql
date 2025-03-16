/*
  # Fix video-profile relationship

  1. Changes
    - Drop existing foreign key constraint from videos table
    - Add new foreign key constraint to reference profiles table
    - Update video queries to use proper joins
*/

-- First drop the existing foreign key if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'videos_user_id_fkey'
    AND table_name = 'videos'
  ) THEN
    ALTER TABLE videos DROP CONSTRAINT videos_user_id_fkey;
  END IF;
END $$;

-- Add the new foreign key constraint
ALTER TABLE videos
ADD CONSTRAINT videos_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Ensure the profiles policy exists
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

-- Create a function to get video with profile
CREATE OR REPLACE FUNCTION get_video_with_profile(video_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  video_url text,
  user_id uuid,
  created_at timestamptz,
  username text,
  avatar_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.title,
    v.description,
    v.video_url,
    v.user_id,
    v.created_at,
    p.username,
    p.avatar_url
  FROM videos v
  LEFT JOIN profiles p ON v.user_id = p.id
  WHERE v.id = video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;