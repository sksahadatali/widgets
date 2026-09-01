export interface Destination {
  id: string;
  name: string;
  aliases: string[];
  travelMinutes: number;
}

export function findDestination(
  location: string
): Destination | undefined {

  void location;
  return undefined;
}

export function calculateLeaveTime(
  meetingTime: Date,
  travelMinutes: number,
  bufferMinutes = 10
): Date {

  return new Date(
    meetingTime.getTime() -
      (
        travelMinutes +
        bufferMinutes
      ) *
      60 *
      1000
  );
}
