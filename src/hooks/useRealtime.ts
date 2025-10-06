import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeSubscription<T = any>(table: string, filter?: string) {
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`${table}-changes`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setData(prev => [...prev, payload.new as T]);
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => 
              prev.map(item => 
                (item as any).id === (payload.new as any).id 
                  ? payload.new as T 
                  : item
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setData(prev => 
              prev.filter(item => (item as any).id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe();

    return () => { 
      channel.unsubscribe(); 
    };
  }, [table, filter]);

  return data;
}
