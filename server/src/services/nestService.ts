import { env } from '../config/env.js';
import { getAccessToken } from './googleAuthService.js';

type NestTraits = {
  'sdm.devices.traits.Info'?: {
    customName?: string;
  };

  'sdm.devices.traits.Humidity'?: {
    ambientHumidityPercent?: number;
  };

  'sdm.devices.traits.Connectivity'?: {
    status?: string;
  };

  'sdm.devices.traits.ThermostatMode'?: {
    mode?: string;
    availableModes?: string[];
  };

  'sdm.devices.traits.ThermostatEco'?: {
    mode?: string;
    availableModes?: string[];
    heatCelsius?: number;
    coolCelsius?: number;
  };

  'sdm.devices.traits.ThermostatHvac'?: {
    status?: string;
  };

  'sdm.devices.traits.ThermostatTemperatureSetpoint'?: {
    heatCelsius?: number;
    coolCelsius?: number;
  };

  'sdm.devices.traits.Temperature'?: {
    ambientTemperatureCelsius?: number;
  };
};

type NestDeviceResponse = {
  name: string;
  type: string;
  traits: NestTraits;
  parentRelations?: Array<{
    parent?: string;
    displayName?: string;
  }>;
};

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

async function readNestApiError(
  response: Response
): Promise<string> {
  const responseText = await response.text();

  try {
    const parsed = JSON.parse(responseText) as {
      error?: {
        code?: number;
        message?: string;
        status?: string;
      };
    };

    const status =
      parsed.error?.status ??
      `HTTP ${response.status}`;

    const message =
      parsed.error?.message ??
      'Unknown Nest API error';

    return `${status}: ${message}`;
  } catch {
    return (
      responseText ||
      `Nest API returned HTTP ${response.status}.`
    );
  }
}

export async function getNestStatus(): Promise<NestStatus> {
  const accessToken = await getAccessToken();

  const deviceName = env.nest.deviceName.replace(
    /^\/+/,
    ''
  );

  const response = await fetch(
    `https://smartdevicemanagement.googleapis.com/v1/${deviceName}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorMessage =
      await readNestApiError(response);

    throw new Error(`Nest API error: ${errorMessage}`);
  }

  const device =
    (await response.json()) as NestDeviceResponse;

  const traits = device.traits;

  const temperature =
    traits['sdm.devices.traits.Temperature']
      ?.ambientTemperatureCelsius;

  const humidity =
    traits['sdm.devices.traits.Humidity']
      ?.ambientHumidityPercent;

  const connectivityStatus =
    traits['sdm.devices.traits.Connectivity']
      ?.status;

  const thermostatMode =
    traits['sdm.devices.traits.ThermostatMode']
      ?.mode ?? 'UNKNOWN';

  const ecoMode =
    traits['sdm.devices.traits.ThermostatEco']
      ?.mode ?? 'UNKNOWN';

  const hvacStatus =
    traits['sdm.devices.traits.ThermostatHvac']
      ?.status ?? 'UNKNOWN';

  const targetTemperature =
    traits[
      'sdm.devices.traits.ThermostatTemperatureSetpoint'
    ]?.heatCelsius;

  return {
    room:
      device.parentRelations?.[0]?.displayName ??
      traits['sdm.devices.traits.Info']
        ?.customName ??
      'Nest Thermostat',

    online: connectivityStatus === 'ONLINE',

    temperatureCelsius:
      typeof temperature === 'number'
        ? Number(temperature.toFixed(1))
        : null,

    humidityPercent:
      typeof humidity === 'number'
        ? humidity
        : null,

    thermostatMode,
    ecoMode,
    hvacStatus,
    heating: hvacStatus === 'HEATING',

    targetTemperatureCelsius:
      typeof targetTemperature === 'number'
        ? Number(targetTemperature.toFixed(1))
        : null,
  };
}