import * as FileSystem from 'expo-file-system/legacy';
import { MAP_REFERER_URL, SECURE_STORE_KEYS } from '../../constants/config';
import { secureStorageService } from './secureStorageService';

const ROOT_DIR_NAME = 'guiamobi-offline-maps';
const MANIFEST_FILE = 'manifest.json';
const DOWNLOAD_ZOOMS = [13, 14, 15];
const FALLBACK_ZOOMS = [12, 13, 14];
const MIN_ZOOMS = [11, 12, 13];

// Mantém três níveis de zoom detalhados quando a extensão da rota permite.
// Para rotas maiores, cai automaticamente para níveis mais amplos para que
// o download continue finito e rápido o suficiente para uso em aparelho.
const MAX_TILES = 500;
const DOWNLOAD_CONCURRENCY = 4;

const TILE_URL =
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface OfflineMapPoint {
  latitude: number;
  longitude: number;
}

interface TileRef {
  z: number;
  x: number;
  y: number;
}

interface Manifest {
  version: 1;
  regionKey: string;
  zooms: number[];
  tiles: string[];
  createdAt: string;
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function normalizePoint(
  point: OfflineMapPoint,
): OfflineMapPoint | null {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude)
  ) {
    return null;
  }

  if (
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  ) {
    return null;
  }

  return point;
}

function routeBounds(points: OfflineMapPoint[]) {
  const valid = points
    .map(normalizePoint)
    .filter(
      (point): point is OfflineMapPoint =>
        Boolean(point),
    );

  if (!valid.length) return null;

  const latitudes = valid.map(
    (point) => point.latitude,
  );
  const longitudes = valid.map(
    (point) => point.longitude,
  );

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latPadding = Math.max(
    0.004,
    (maxLat - minLat) * 0.10,
  );

  const lngPadding = Math.max(
    0.004,
    (maxLng - minLng) * 0.10,
  );

  return {
    minLat: Math.max(-85, minLat - latPadding),
    maxLat: Math.min(85, maxLat + latPadding),
    minLng: Math.max(-180, minLng - lngPadding),
    maxLng: Math.min(180, maxLng + lngPadding),
  };
}

function tileX(
  longitude: number,
  zoom: number,
): number {
  const n = 2 ** zoom;

  return Math.floor(
    ((longitude + 180) / 360) * n,
  );
}

function tileY(
  latitude: number,
  zoom: number,
): number {
  const clamped = Math.max(
    -85.05112878,
    Math.min(85.05112878, latitude),
  );

  const radians =
    (clamped * Math.PI) / 180;

  const n = 2 ** zoom;

  return Math.floor(
    ((1 -
      Math.asinh(Math.tan(radians)) / Math.PI) /
      2) *
      n,
  );
}

function tileRefsForZoom(
  bounds: NonNullable<
    ReturnType<typeof routeBounds>
  >,
  zoom: number,
): TileRef[] {
  const maxIndex = 2 ** zoom - 1;

  const minX = Math.max(
    0,
    Math.min(
      maxIndex,
      tileX(bounds.minLng, zoom),
    ),
  );

  const maxX = Math.max(
    0,
    Math.min(
      maxIndex,
      tileX(bounds.maxLng, zoom),
    ),
  );

  const minY = Math.max(
    0,
    Math.min(
      maxIndex,
      tileY(bounds.maxLat, zoom),
    ),
  );

  const maxY = Math.max(
    0,
    Math.min(
      maxIndex,
      tileY(bounds.minLat, zoom),
    ),
  );

  const refs: TileRef[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      refs.push({
        z: zoom,
        x,
        y,
      });
    }
  }

  return refs;
}

function buildTileRefs(
  bounds: NonNullable<
    ReturnType<typeof routeBounds>
  >,
  zooms: number[],
): TileRef[] {
  return zooms.flatMap((zoom) =>
    tileRefsForZoom(bounds, zoom),
  );
}

function chooseZooms(
  bounds: NonNullable<
    ReturnType<typeof routeBounds>
  >,
): number[] {
  const candidates = [
    DOWNLOAD_ZOOMS,
    FALLBACK_ZOOMS,
    MIN_ZOOMS,
  ];

  for (const zooms of candidates) {
    const total = buildTileRefs(
      bounds,
      zooms,
    ).length;

    if (total <= MAX_TILES) {
      return zooms;
    }
  }

  return MIN_ZOOMS;
}

async function getCurrentUserId(): Promise<
  string | null
> {
  const raw =
    await secureStorageService.getItem(
      SECURE_STORE_KEYS.USER,
    );

  if (!raw) return null;

  try {
    const user = JSON.parse(raw) as {
      id?: string;
    };

    return user.id ?? null;
  } catch {
    return null;
  }
}

async function getBaseDir(): Promise<
  string | null
> {
  const root = FileSystem.documentDirectory;

  if (!root) return null;

  const userId = await getCurrentUserId();

  if (!userId) return null;

  const dir =
    `${root}${ROOT_DIR_NAME}/${stableHash(userId)}/`;

  await FileSystem.makeDirectoryAsync(dir, {
    intermediates: true,
  });

  return dir;
}

async function getRegionDir(
  regionKey: string,
): Promise<string | null> {
  const base = await getBaseDir();

  if (!base) return null;

  const dir = `${base}${regionKey}/`;

  await FileSystem.makeDirectoryAsync(dir, {
    intermediates: true,
  });

  return dir;
}

function tilePath(
  regionDir: string,
  tile: TileRef,
): string {
  return `${regionDir}${tile.z}/${tile.x}/${tile.y}.png`;
}

async function ensureParentDirectory(
  uri: string,
): Promise<void> {
  const lastSlash = uri.lastIndexOf('/');

  if (lastSlash <= 0) return;

  const directory = uri.slice(
    0,
    lastSlash,
  );

  await FileSystem.makeDirectoryAsync(
    directory,
    {
      intermediates: true,
    },
  );
}

async function downloadTile(
  regionDir: string,
  tile: TileRef,
): Promise<boolean> {
  const destination = tilePath(
    regionDir,
    tile,
  );

  try {
    const existing =
      await FileSystem.getInfoAsync(
        destination,
      );

    if (
      existing.exists &&
      (existing.size ?? 0) > 0
    ) {
      return true;
    }
  } catch {
    // Continua para tentar baixar novamente.
  }

  try {
    await ensureParentDirectory(
      destination,
    );

    const url = TILE_URL
      .replace(
        '{z}',
        String(tile.z),
      )
      .replace(
        '{x}',
        String(tile.x),
      )
      .replace(
        '{y}',
        String(tile.y),
      );

    const result =
      await FileSystem.downloadAsync(
        url,
        destination,
        {
          headers: {
            Referer: MAP_REFERER_URL,
          },
        },
      );

    if (
      result.status < 200 ||
      result.status >= 300
    ) {
      try {
        await FileSystem.deleteAsync(
          destination,
          { idempotent: true },
        );
      } catch {
        // Ignora limpeza.
      }

      return false;
    }

    const downloadedInfo =
      await FileSystem.getInfoAsync(
        destination,
      );

    if (
      !downloadedInfo.exists ||
      (downloadedInfo.size ?? 0) <= 0
    ) {
      try {
        await FileSystem.deleteAsync(
          destination,
          { idempotent: true },
        );
      } catch {
        // Ignora limpeza.
      }

      return false;
    }

    return true;
  } catch {
    try {
      await FileSystem.deleteAsync(
        destination,
        { idempotent: true },
      );
    } catch {
      // Ignora limpeza.
    }

    return false;
  }
}

async function readManifest(
  regionDir: string,
): Promise<Manifest | null> {
  try {
    const uri =
      `${regionDir}${MANIFEST_FILE}`;

    const info =
      await FileSystem.getInfoAsync(uri);

    if (
      !info.exists ||
      !info.size
    ) {
      return null;
    }

    const text =
      await FileSystem.readAsStringAsync(
        uri,
      );

    const parsed =
      JSON.parse(text) as Manifest;

    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.tiles) ||
      !Array.isArray(parsed.zooms)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export const offlineMapService = {
  makeRegionKey(
    originLatitude: number,
    originLongitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
  ): string {
    return stableHash(
      [
        originLatitude,
        originLongitude,
        destinationLatitude,
        destinationLongitude,
      ]
        .map((value) =>
          value.toFixed(5),
        )
        .join(':'),
    );
  },

  async hasRegion(
    regionKey: string,
  ): Promise<boolean> {
    const regionDir =
      await getRegionDir(regionKey);

    if (!regionDir) return false;

    const manifest =
      await readManifest(regionDir);

    if (
      !manifest ||
      !manifest.tiles.length
    ) {
      return false;
    }

    /*
     * Confirma pelo menos uma tile física.
     * Isso evita considerar uma região como salva
     * quando existe apenas um manifest incompleto.
     */
    for (const tile of manifest.tiles) {
      const parts = tile.split('/');

      if (parts.length !== 3) continue;

      const z = Number(parts[0]);
      const x = Number(parts[1]);
      const y = Number(parts[2]);

      if (
        !Number.isInteger(z) ||
        !Number.isInteger(x) ||
        !Number.isInteger(y)
      ) {
        continue;
      }

      const uri = tilePath(
        regionDir,
        { z, x, y },
      );

      try {
        const info =
          await FileSystem.getInfoAsync(
            uri,
          );

        if (
          info.exists &&
          (info.size ?? 0) > 0
        ) {
          return true;
        }
      } catch {
        // Continua procurando.
      }
    }

    return false;
  },

  async getRegionMinZoom(
    regionKey: string,
  ): Promise<number | null> {
    const regionDir =
      await getRegionDir(regionKey);

    if (!regionDir) return null;

    const manifest =
      await readManifest(regionDir);

    if (
      !manifest?.zooms?.length
    ) {
      return null;
    }

    return Math.min(
      ...manifest.zooms,
    );
  },

  async getRegionMaxZoom(
    regionKey: string,
  ): Promise<number | null> {
    const regionDir =
      await getRegionDir(regionKey);

    if (!regionDir) return null;

    const manifest =
      await readManifest(regionDir);

    if (
      !manifest?.zooms?.length
    ) {
      return null;
    }

    return Math.max(
      ...manifest.zooms,
    );
  },

  async getRegionTileTemplate(
    regionKey: string,
  ): Promise<string | null> {
    const regionDir = await getRegionDir(regionKey);

    if (!regionDir) return null;

    const manifest = await readManifest(regionDir);
    if (!manifest?.tiles?.length) return null;

    // react-native-maps LocalTile consome diretamente o esquema XYZ local.
    return `${regionDir}{z}/{x}/{y}.png`;
  },

  async saveRegion(
    regionKey: string,
    points: OfflineMapPoint[],
  ): Promise<{
    downloaded: number;
    total: number;
  }> {
    const bounds =
      routeBounds(points);

    if (!bounds) {
      throw new Error(
        'Mapa offline indisponível para esta rota.',
      );
    }

    const regionDir =
      await getRegionDir(regionKey);

    if (!regionDir) {
      throw new Error(
        'Armazenamento local indisponível.',
      );
    }

    const zooms =
      chooseZooms(bounds);

    const tiles =
      buildTileRefs(
        bounds,
        zooms,
      );

    if (!tiles.length) {
      throw new Error(
        'Não foi possível definir as áreas do mapa para esta rota.',
      );
    }

    let cursor = 0;
    let downloaded = 0;

    const downloadedKeys =
      new Set<string>();

    const worker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;

        if (
          index >= tiles.length
        ) {
          return;
        }

        const tile =
          tiles[index];

        const success =
          await downloadTile(
            regionDir,
            tile,
          );

        if (success) {
          downloaded += 1;

          downloadedKeys.add(
            `${tile.z}/${tile.x}/${tile.y}`,
          );
        }
      }
    };

    await Promise.all(
      Array.from(
        {
          length: Math.min(
            DOWNLOAD_CONCURRENCY,
            tiles.length,
          ),
        },
        () => worker(),
      ),
    );

    if (downloaded === 0) {
      throw new Error(
        'Não foi possível baixar o mapa para uso offline.',
      );
    }

    /*
     * O manifest registra somente as tiles que realmente
     * existem no armazenamento.
     *
     * Isso evita que o mapa considere como disponível
     * uma tile cujo download falhou.
     */
    const manifest: Manifest = {
      version: 1,
      regionKey,
      zooms,
      tiles:
        Array.from(downloadedKeys),
      createdAt:
        new Date().toISOString(),
    };

    await FileSystem.writeAsStringAsync(
      `${regionDir}${MANIFEST_FILE}`,
      JSON.stringify(manifest),
    );

    return {
      downloaded,
      total: tiles.length,
    };
  },


  async removeRegion(regionKey: string): Promise<void> {
    const root = FileSystem.documentDirectory;
    if (!root) return;

    const userId = await getCurrentUserId();
    if (!userId) return;

    const regionDir = `${root}${ROOT_DIR_NAME}/${stableHash(userId)}/${regionKey}/`;
    const info = await FileSystem.getInfoAsync(regionDir);
    if (!info.exists) return;

    await FileSystem.deleteAsync(regionDir, { idempotent: true });
  },
};
