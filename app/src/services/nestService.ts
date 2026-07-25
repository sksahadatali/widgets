export type NestStatus = {
    room: string;
    online: boolean;
    temperatureCelsius: number | null;
    humidityPercent: number | null;
    thermostatMode: string;
    ecoMode: string;
    hvacStatus: string;
    heating: boolean;
    targetTemperatureCelsius: number | null;
  };
  
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    'http://localhost:3001';
  
  export async function fetchNestStatus(
    signal?: AbortSignal
  ): Promise<NestStatus> {
    const response = await fetch(
      `${API_BASE_URL}/api/nest/status`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal,
      }
    );
  
    if (!response.ok) {
      let message = `Nest request failed with HTTP ${response.status}`;
  
      try {
        const body = (await response.json()) as {
          error?: string;
        };
  
        if (body.error) {
          message = body.error;
        }
      } catch {
        // Keep the HTTP error message if the response is not JSON.
      }
  
      throw new Error(message);
    }
  
    return (await response.json()) as NestStatus;
  }