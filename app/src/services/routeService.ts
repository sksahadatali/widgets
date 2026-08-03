import travelTimes from '../data/travelTimes.json';

type TravelTime = {
  address: string;
  travelMinutes: number;
};

export function getFallbackTravelTime(
  destination: string
): number | null {

  const value =
    destination.trim().toLowerCase();

  const entry =
    (travelTimes as TravelTime[])
      .find(item => {

        const address =
          item.address
            .trim()
            .toLowerCase();

        return (
          value.includes(address) ||
          address.includes(value)
        );

      });

  return entry
    ? entry.travelMinutes
    : null;
}