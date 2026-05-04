-- CreateTable
CREATE TABLE "ImportedLap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerName" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "car" TEXT NOT NULL,
    "carClass" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lapNumber" INTEGER NOT NULL,
    "lapTime" REAL NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "sector1" REAL,
    "sector2" REAL,
    "sector3" REAL,
    "fuelUsed" REAL NOT NULL,
    "fuelRemaining" REAL NOT NULL,
    "fuelCapacity" REAL NOT NULL,
    "tyreWearAvg" REAL,
    "position" INTEGER,
    "hasTouch" BOOLEAN NOT NULL DEFAULT false,
    "telemetryJson" TEXT,
    "originalCreatedAt" DATETIME NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ImportedLap_trackName_carClass_idx" ON "ImportedLap"("trackName", "carClass");
