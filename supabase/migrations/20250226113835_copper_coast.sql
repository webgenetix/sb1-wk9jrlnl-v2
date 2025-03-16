/*
  # Fix video relationships and ensure proper table structure

  1. Changes
    - Ensure correct foreign key relationships
    - Add indexes for better performance
    - Update video stats function
*/

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_video_id ON video_shares(video_id);

-- Update the video stats function to be more efficient
CREATE OR REPLACE FUNCTION get_video_stats(video_id uuid)
RETURNS TABLE (
  likes_count bigint,
  comments_count bigint,
  shares_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM video_likes WHERE video_likes.video_id = $1), 0),
    COALESCE((SELECT COUNT(*) FROM video_comments WHERE video_comments.video_id = $1), 0),
    COALESCE((SELECT COUNT(*) FROM video_shares WHERE video_shares.video_id = $1), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get videos with user profiles
CREATE OR REPLACE FUNCTION get_videos_with_profiles()
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
  ORDER BY v.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;