/*
  # Create video user profiles materialized view

  1. Changes
    - Create a materialized view for efficient video and profile data querying
    - Add function to refresh the materialized view
    - Add indexes for better query performance

  2. Security
    - Function is created with SECURITY DEFINER to ensure proper access control
*/

-- Create materialized view for efficient searching
CREATE MATERIALIZED VIEW video_user_profiles AS
SELECT 
  v.id,
  v.title,
  v.description,
  v.video_url,
  v.thumbnail_url,
  v.created_at,
  v.user_id,
  p.username,
  p.avatar_url,
  v.like_count
FROM videos v
LEFT JOIN auth.users u ON v.user_id = u.id
LEFT JOIN profiles p ON v.user_id = p.id;

-- Create indexes for better performance
CREATE UNIQUE INDEX video_user_profiles_id_idx ON video_user_profiles(id);
CREATE INDEX video_user_profiles_user_id_idx ON video_user_profiles(user_id);
CREATE INDEX video_user_profiles_created_at_idx ON video_user_profiles(created_at DESC);

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_video_user_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY video_user_profiles;
  RETURN NULL;
END;
$$;

-- Create triggers to refresh the materialized view
CREATE TRIGGER refresh_video_user_profiles_on_video
AFTER INSERT OR UPDATE OR DELETE ON videos
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_video_user_profiles();

CREATE TRIGGER refresh_video_user_profiles_on_profile
AFTER UPDATE OF username, avatar_url ON profiles
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_video_user_profiles();

-- Grant access to authenticated users
GRANT SELECT ON video_user_profiles TO authenticated;