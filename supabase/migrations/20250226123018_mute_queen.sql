/*
  # Fix messages and profiles relationships

  1. Changes
    - Add foreign key references to profiles table for sender and receiver
    - Create policies to allow profile access for message participants
    - Add indexes for better performance

  2. Security
    - Maintain existing RLS policies
    - Add new policies for profile access
*/

-- Add foreign key references to profiles
ALTER TABLE messages
ADD CONSTRAINT messages_sender_profile_fkey
FOREIGN KEY (sender_id) REFERENCES profiles(id)
ON DELETE CASCADE;

ALTER TABLE messages
ADD CONSTRAINT messages_receiver_profile_fkey
FOREIGN KEY (receiver_id) REFERENCES profiles(id)
ON DELETE CASCADE;

-- Create policy for profiles to allow access for message participants
CREATE POLICY "Users can view profiles of message participants"
ON profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT sender_id FROM messages WHERE receiver_id = auth.uid()
    UNION
    SELECT receiver_id FROM messages WHERE sender_id = auth.uid()
  )
);

-- Add composite indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_participants 
ON messages(sender_id, receiver_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON messages(sender_id, receiver_id, created_at DESC);