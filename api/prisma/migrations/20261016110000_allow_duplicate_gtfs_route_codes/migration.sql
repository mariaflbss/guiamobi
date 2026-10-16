DROP INDEX IF EXISTS "transit_lines_code_data_source_key";
CREATE INDEX IF NOT EXISTS "transit_lines_code_data_source_idx" ON "transit_lines"("code", "data_source");
