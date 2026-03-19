-- V2 Features Migration
-- Adds: retry_count, media_url, archived, phonenumbers-bot provider type

-- Add phonenumbers-bot to provider_type enum
ALTER TYPE provider_type ADD VALUE IF NOT EXISTS 'phonenumbers-bot';

-- Add retry_count to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Add media_url to messages (for MMS)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Add archived to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Index for filtering non-archived conversations
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(user_id, archived);
