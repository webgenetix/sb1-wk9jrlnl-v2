/*
  # Add location data to videos table

  1. Changes
    - Add location fields to videos table:
      - `address` (text): Human-readable address
      - `latitude` (float): Geographic latitude coordinate
      - `longitude` (float): Geographic longitude coordinate
    
  2. Purpose
    - Enable videos to be associated with specific locations
    - Support displaying videos on a map interface
*/

-- Add location columns to videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS latitude float,
ADD COLUMN IF NOT EXISTS longitude float;

-- Create index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_videos_location 
ON videos(latitude, longitude);