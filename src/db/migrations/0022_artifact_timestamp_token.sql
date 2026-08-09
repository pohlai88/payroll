-- RFC 3161 tokens are artifacts in their own right: the bytes a verifier is
-- pointed at to prove the closure manifest existed at the authority's genTime.
ALTER TYPE "public"."artifact_type" ADD VALUE IF NOT EXISTS 'TIMESTAMP_TOKEN';
