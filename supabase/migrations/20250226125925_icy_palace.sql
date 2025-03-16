/*
  # Fix message and profile relationships

  1. Changes
    - Drop existing foreign key constraints if they exist
    - Create profiles for message participants if they don't exist
    - Add functions for retrieving messages with profile information

  2. Security
    - Functions are created with SECURITY DEFINER to ensure proper access control
*/

-- Drop existing foreign key constraints if they exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'messages_sender_profile_fkey'
    AND table_name = 'messages'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT messages_sender_profile_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'messages_receiver_profile_fkey'
    AND table_name = 'messages'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT messages_receiver_profile_fkey;
  END IF;
END $$;

-- Create temporary table for collecting unique user IDs
CREATE TEMPORARY TABLE temp_users AS
SELECT DISTINCT sender_id as user_id FROM messages WHERE sender_id IS NOT NULL
UNION
SELECT DISTINCT receiver_id FROM messages WHERE receiver_id IS NOT NULL;

-- Insert profiles for users that don't have them yet
INSERT INTO profiles (id, username, updated_at)
SELECT 
  t.user_id,
  'user_' || substr(t.user_id::text, 1, 8),
  now()
FROM temp_users t
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = t.user_id
);

-- Drop temporary table
DROP TABLE temp_users;

-- Create function to get messages with profiles
CREATE OR REPLACE FUNCTION get_messages_with_profiles(user_id uuid)
RETURNS TABLE (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  content text,
  read boolean,
  created_at timestamptz,
  sender_username text,
  sender_avatar_url text,
  receiver_username text,
  receiver_avatar_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.sender_id,
    m.receiver_id,
    m.content,
    m.read,
    m.created_at,
    sp.username as sender_username,
    sp.avatar_url as sender_avatar_url,
    rp.username as receiver_username,
    rp.avatar_url as receiver_avatar_url
  FROM messages m
  LEFT JOIN profiles sp ON m.sender_id = sp.id
  LEFT JOIN profiles rp ON m.receiver_id = rp.id
  WHERE m.sender_id = user_id OR m.receiver_id = user_id
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get conversation messages
CREATE OR REPLACE FUNCTION get_conversation_messages(user_id uuid, other_user_id uuid)
RETURNS TABLE (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  content text,
  read boolean,
  created_at timestamptz,
  sender_username text,
  sender_avatar_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.sender_id,
    m.receiver_id,
    m.content,
    m.read,
    m.created_at,
    p.username as sender_username,
    p.avatar_url as sender_avatar_url
  FROM messages m
  LEFT JOIN profiles p ON m.sender_id = p.id
  WHERE (m.sender_id = user_id AND m.receiver_id = other_user_id)
     OR (m.sender_id = other_user_id AND m.receiver_id = user_id)
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;