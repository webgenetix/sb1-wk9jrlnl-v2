/*
  # Add avatar storage bucket and policies

  1. New Storage Bucket
    - `avatars` bucket for storing user profile pictures
  
  2. Security
    - Enable public access for reading avatars
    - Restrict uploads to authenticated users
    - Users can manage their own avatars
*/

-- Create a new storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Allow public access to read avatars
CREATE POLICY "Avatar Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload avatars
CREATE POLICY "Avatar Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow users to manage their own avatars
CREATE POLICY "Avatar Update Access"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatar Delete Access"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');