-- AlterTable
-- Link do PDF oficial de horário/itinerário publicado pela Prefeitura de
-- São José dos Campos para a linha (quando isOfficialData = true).
ALTER TABLE "transit_lines" ADD COLUMN "official_source_url" TEXT;
