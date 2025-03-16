/*
  # Create mock chat data

  1. Changes
    - Insert mock messages between two users
    - Add sample conversation data with proper timestamps
*/

-- Insert mock messages
WITH user1 AS (
  SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1
),
user2 AS (
  SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1
),
messages_data AS (
  SELECT 
    u1.id as user1_id,
    u2.id as user2_id,
    message,
    timestamp,
    ROW_NUMBER() OVER (ORDER BY timestamp) as rnum
  FROM user1 u1, user2 u2,
  (VALUES
    ('Hey there! How are you?', NOW() - INTERVAL '1 hour'),
    ('Hi! I''m doing great, thanks for asking. How about you?', NOW() - INTERVAL '59 minutes'),
    ('Pretty good! I saw your latest video, it was amazing!', NOW() - INTERVAL '58 minutes'),
    ('Thank you so much! I worked really hard on it 😊', NOW() - INTERVAL '57 minutes'),
    ('The editing was really smooth. What software do you use?', NOW() - INTERVAL '55 minutes'),
    ('I use Adobe Premiere Pro for most of my edits', NOW() - INTERVAL '54 minutes'),
    ('That''s cool! I''ve been thinking about getting into video editing', NOW() - INTERVAL '52 minutes'),
    ('You should! It''s really fun once you get the hang of it', NOW() - INTERVAL '50 minutes'),
    ('Would you mind giving me some tips?', NOW() - INTERVAL '48 minutes'),
    ('Of course! I''d be happy to help', NOW() - INTERVAL '47 minutes'),
    ('Maybe we could collaborate on a video sometime?', NOW() - INTERVAL '45 minutes'),
    ('That would be awesome! Let''s plan something', NOW() - INTERVAL '44 minutes'),
    ('Great! I''ll come up with some ideas', NOW() - INTERVAL '42 minutes'),
    ('Looking forward to it! 🎥', NOW() - INTERVAL '40 minutes'),
    ('Me too! This is going to be fun', NOW() - INTERVAL '38 minutes')
  ) AS t(message, timestamp)
)
INSERT INTO messages (sender_id, receiver_id, content, created_at)
SELECT 
  CASE WHEN rnum % 2 = 0 THEN user1_id ELSE user2_id END as sender_id,
  CASE WHEN rnum % 2 = 0 THEN user2_id ELSE user1_id END as receiver_id,
  message,
  timestamp
FROM messages_data;