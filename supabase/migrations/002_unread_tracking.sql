-- Unread message tracking
-- Adds last_read_at to conversations for tracking unread state

ALTER TABLE conversations ADD COLUMN last_read_at TIMESTAMPTZ;

-- Create a function to count unread messages for a conversation
CREATE OR REPLACE FUNCTION unread_count(conv conversations)
RETURNS BIGINT AS $$
  SELECT COUNT(*)
  FROM messages m
  WHERE m.conversation_id = conv.id
    AND m.direction = 'inbound'
    AND (conv.last_read_at IS NULL OR m.created_at > conv.last_read_at);
$$ LANGUAGE sql STABLE;

-- Index to speed up unread count queries
CREATE INDEX idx_messages_conversation_direction_created
  ON messages(conversation_id, direction, created_at DESC);
