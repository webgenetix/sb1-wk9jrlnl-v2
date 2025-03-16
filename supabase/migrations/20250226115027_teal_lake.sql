/*
  # Add video interaction counts and tables

  1. Changes
    - Create interaction tables (likes, comments, shares)
    - Add count columns to videos table
    - Create triggers to automatically update counts
    - Add indexes for performance

  2. Security
    - Enable RLS on all new tables
    - Triggers run with security definer to ensure counts stay accurate
*/

-- First add the count columns to videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS comment_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS share_count integer DEFAULT 0;

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

-- Create RLS policies
CREATE POLICY "Users can view all likes"
  ON video_likes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can like videos"
  ON video_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike videos"
  ON video_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view all comments"
  ON video_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can add comments"
  ON video_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON video_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view all shares"
  ON video_shares FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can share videos"
  ON video_shares FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create function to update video like count
CREATE OR REPLACE FUNCTION update_video_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE videos 
    SET like_count = like_count + 1
    WHERE id = NEW.video_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE videos 
    SET like_count = like_count - 1
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update video comment count
CREATE OR REPLACE FUNCTION update_video_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE videos 
    SET comment_count = comment_count + 1
    WHERE id = NEW.video_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE videos 
    SET comment_count = comment_count - 1
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update video share count
CREATE OR REPLACE FUNCTION update_video_share_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE videos 
    SET share_count = share_count + 1
    WHERE id = NEW.video_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE videos 
    SET share_count = share_count - 1
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER video_like_count_trigger
AFTER INSERT OR DELETE ON video_likes
FOR EACH ROW
EXECUTE FUNCTION update_video_like_count();

CREATE TRIGGER video_comment_count_trigger
AFTER INSERT OR DELETE ON video_comments
FOR EACH ROW
EXECUTE FUNCTION update_video_comment_count();

CREATE TRIGGER video_share_count_trigger
AFTER INSERT OR DELETE ON video_shares
FOR EACH ROW
EXECUTE FUNCTION update_video_share_count();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_like_count ON videos(like_count);
CREATE INDEX IF NOT EXISTS idx_videos_comment_count ON videos(comment_count);
CREATE INDEX IF NOT EXISTS idx_videos_share_count ON videos(share_count);
CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_video_id ON video_shares(video_id);