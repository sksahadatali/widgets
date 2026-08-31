import { useEffect, useState } from 'react';
import { apiUrl } from '../services/clientApi';

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
          apiUrl('/api/petrol')
        );

        const result = await response.json();
        if (!response.ok || result.error) {
          console.error('Petrol API error:', result);
          return;
        }

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
