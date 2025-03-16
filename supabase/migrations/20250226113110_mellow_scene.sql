/*
  # Add video interactions tables

  1. New Tables
    - `video_likes`
      - `id` (uuid, primary key)
      - `video_id` (uuid, references videos)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamp)
    
    - `video_comments`
      - `id` (uuid, primary key)
      - `video_id` (uuid, references videos)
      - `user_id` (uuid, references auth.users)
      - `content` (text)
      - `created_at` (timestamp)
    
    - `video_shares`
      - `id` (uuid, primary key)
      - `video_id` (uuid, references videos)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create video_likes table
CREATE TABLE IF NOT EXISTS video_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, user_id)
);

-- Create video_comments table
CREATE TABLE IF NOT EXISTS video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create video_shares table
CREATE TABLE IF NOT EXISTS video_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE video_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_shares ENABLE ROW LEVEL SECURITY;

-- Policies for video_likes
CREATE POLICY "Users can view all likes"
  ON video_likes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can like videos"
  ON video_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike videos"
  ON video_likes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for video_comments
CREATE POLICY "Users can view all comments"
  ON video_comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add comments"
  ON video_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON video_comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for video_shares
CREATE POLICY "Users can view all shares"
  ON video_shares
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can share videos"
  ON video_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add functions to get interaction counts
CREATE OR REPLACE FUNCTION get_video_stats(video_id uuid)
RETURNS TABLE (
  likes_count bigint,
  comments_count bigint,
  shares_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM video_likes WHERE video_likes.video_id = $1),
    (SELECT COUNT(*) FROM video_comments WHERE video_comments.video_id = $1),
    (SELECT COUNT(*) FROM video_shares WHERE video_shares.video_id = $1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;