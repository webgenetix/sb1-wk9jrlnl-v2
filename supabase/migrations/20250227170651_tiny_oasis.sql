/*
  # Add bookmark feature

  1. New Tables
    - `video_bookmarks` - Tracks user bookmarks
      - `id` (uuid, primary key)
      - `video_id` (uuid, references videos)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamp)
  
  2. Changes to Existing Tables
    - Add `bookmark_count` to videos table
  
  3. Security
    - Enable RLS on `video_bookmarks` table
    - Add policies for authenticated users to manage their bookmarks
  
  4. Triggers
    - Add trigger to update bookmark count when videos are bookmarked/unbookmarked
*/

-- Add bookmark_count to videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS bookmark_count integer DEFAULT 0;

-- Create video_bookmarks table
CREATE TABLE IF NOT EXISTS video_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, user_id)
);

-- Enable RLS
ALTER TABLE video_bookmarks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own bookmarks"
  ON video_bookmarks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can bookmark videos"
  ON video_bookmarks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unbookmark videos"
  ON video_bookmarks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update video bookmark count
CREATE OR REPLACE FUNCTION update_video_bookmark_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE videos 
    SET bookmark_count = bookmark_count + 1
    WHERE id = NEW.video_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE videos 
    SET bookmark_count = bookmark_count - 1
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER video_bookmark_count_trigger
AFTER INSERT OR DELETE ON video_bookmarks
FOR EACH ROW
EXECUTE FUNCTION update_video_bookmark_count();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_bookmarks_video_id ON video_bookmarks(video_id);
CREATE INDEX IF NOT EXISTS idx_video_bookmarks_user_id ON video_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_bookmark_count ON videos(bookmark_count);

-- Enable real-time for video_bookmarks table
ALTER PUBLICATION supabase_realtime ADD TABLE video_bookmarks;