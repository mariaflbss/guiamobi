import { httpClient } from './httpClient';
import { Coordinates } from '../../types/location';

export interface MovementCheckResult {
  activeUsers: number;
  highMovement: boolean;
  radiusMeters: number;
}

export const movementService = {
  async checkNearStop(user: Coordinates, stop: Coordinates, radiusMeters = 200): Promise<MovementCheckResult> {
    return httpClient('/movement/check', {
      method: 'POST',
      authenticated: true,
      body: {
        latitude: user.latitude,
        longitude: user.longitude,
        targetLatitude: stop.latitude,
        targetLongitude: stop.longitude,
        radiusMeters,
      },
    });
  },
};
