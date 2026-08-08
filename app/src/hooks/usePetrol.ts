import { useEffect, useState } from 'react';

export interface PetrolData {
  station: string;
  petrolPrice: number;
  updatedAt: string;
}

export function usePetrol() {
  const [data, setData] = useState<PetrolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(
          'http://localhost:3001/api/petrol'
        );

        const result = await response.json();
        console.log(
          'Petrol API response:',
          JSON.stringify(result, null, 2)
        );

        setData(result);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();

    const interval = setInterval(load, 30 * 60 * 1000);

    return () => clearInterval(interval);

  }, []);

  return {
    petrol: data,
    loading,
  };
}